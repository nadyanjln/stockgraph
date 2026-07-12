"""Manager agent for routing and final synthesis."""

from __future__ import annotations

import json
from dataclasses import dataclass

from app.core.agent.common import (
    AgentName,
    ChatMessage,
    MANAGER_MODEL,
    chat_complete,
    stream_chat,
)
from app.core.agent.evidence_policy import coverage_instruction

MANAGER_ROUTER_SYSTEM = """\
Kamu adalah Manager Agent yang merencanakan strategi menjawab pertanyaan analisis saham BEI.
Pertanyaan akan dijawab oleh dua spesialis: News Analyst dan Financial Analyst.

Tugasmu: putuskan agent mana yang perlu dipanggil. Output JSON ketat:
{"agents": ["news"] | ["financial"] | ["news", "financial"], "year": <int>, "rationale": "..."}

Aturan:
- "news"      jika pertanyaan tentang peristiwa, kebijakan, sentimen, tokoh.
- "financial" jika pertanyaan tentang angka, laba, ROE, EPS, perbandingan kinerja.
- keduanya    untuk pertanyaan komprehensif (analisis menyeluruh, prospek, valuasi).
- year        tahun fiskal target (default tahun terbaru yang tersedia).
"""


MANAGER_SYNTHESIZER_SYSTEM = """\
Kamu adalah asisten analisis saham BEI yang menyusun jawaban final berbasis
context retrieval yang diberikan.

Aturan:
- Jawab HANYA menggunakan context yang diberikan.
- Jangan gunakan pengetahuan luar, asumsi, atau informasi yang tidak muncul pada context.
- Pertanyaan investor saat ini adalah sumber kebenaran utama. Abaikan riwayat
  percakapan bila ticker, emiten, tahun, atau topiknya berbeda dari pertanyaan saat ini.
- Setiap klaim faktual harus didukung oleh context retrieval yang tersedia.
- Jika context tidak memuat informasi yang cukup, nyatakan secara eksplisit bahwa
  dokumen yang tersedia tidak memuat informasi yang cukup.
- Prioritaskan laporan keuangan resmi dan data keuangan terstruktur dibanding berita
  bila keduanya tersedia.
- Jangan menciptakan angka, entitas, tanggal, hubungan, penyebab, atau rekomendasi.
- Kutip nilai keuangan persis seperti tertulis pada context.
- Abaikan informasi yang berulang atau duplikat.
- Gabungkan beberapa context pendukung menjadi jawaban yang profesional, natural,
  dan mudah dipahami oleh pembaca awam.
- Fokus hanya pada pertanyaan pengguna.
- Jelaskan angka keuangan dengan bahasa sederhana tanpa mengubah nilainya.
- Hindari penjelasan yang bertele-tele, tetapi jangan terlalu pendek bila
  pertanyaan membutuhkan interpretasi.
- Jangan berspekulasi.
- Gunakan struktur jawaban berikut:
  1. Monolog: pembuka singkat 2-3 kalimat yang menjelaskan inti data dan cara membacanya.
  2. Poin-poin: 3-5 bullet ringkas berisi temuan utama dari context.
  3. Kesimpulan: 1 paragraf singkat yang menjawab pertanyaan secara langsung.
  4. Penutup: 1 kalimat netral yang menjelaskan hal yang perlu dipantau berikutnya.
- Gunakan Markdown sederhana untuk heading dan bullet.
- Jangan menulis daftar sumber di dalam jawaban karena sumber ditampilkan oleh UI.
"""


@dataclass
class ManagerPlan:
    agents: list[AgentName]
    year: int
    rationale: str


async def manager_plan(
    question: str,
    history: list[ChatMessage],
    available_years: list[int],
) -> ManagerPlan:
    """Decide which specialist agents should answer and which year to target."""
    default_year = available_years[-1] if available_years else 0

    years_str = ", ".join(str(y) for y in available_years) or "(belum ada)"
    messages: list[ChatMessage] = [
        {"role": "system", "content": MANAGER_ROUTER_SYSTEM},
        *history[-6:],
        {"role": "user", "content": (
            f"Pertanyaan: {question}\n"
            f"Tahun yang tersedia di graph: {years_str}\n"
            f"Default year: {default_year}\n\n"
            f"Output JSON saja."
        )},
    ]

    try:
        raw = await chat_complete(
            messages,
            model=MANAGER_MODEL,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        if raw.startswith("```"):
            raw = raw.strip("`").lstrip("json").strip()
        plan = json.loads(raw)
        agents = [a for a in plan.get("agents", []) if a in ("news", "financial")]
        comprehensive_query = any(
            keyword in question.lower()
            for keyword in (
                "prospek",
                "risiko",
                "faktor",
                "analisis mendalam",
                "fundamental dan berita",
                "kondisi pasar",
            )
        )
        if comprehensive_query:
            agents = ["news", "financial"]
        if not agents:
            agents = ["news", "financial"]
        year = int(plan.get("year") or default_year)
        if available_years and year not in available_years:
            year = default_year
        return ManagerPlan(
            agents=agents,
            year=year,
            rationale=str(plan.get("rationale", ""))[:200],
        )
    except Exception as exc:
        print(f"[manager_plan] fallback ({exc})")
        return ManagerPlan(
            agents=["news", "financial"],
            year=default_year,
            rationale="default: panggil keduanya",
        )


def manager_synthesizer_messages(
    question: str,
    history: list[ChatMessage],
    sub_answers: dict[str, str],
    sub_citations: list[str],
    sources: list[dict[str, str]] | None = None,
) -> list[ChatMessage]:
    """Build messages for the final synthesizer call."""
    parts = []
    if "news" in sub_answers:
        parts.append(f"## Jawaban News Analyst:\n{sub_answers['news']}")
    if "financial" in sub_answers:
        parts.append(f"## Jawaban Financial Analyst:\n{sub_answers['financial']}")
    source_items = sources or []
    source_lines = []
    for index, source in enumerate(source_items[:8], start=1):
        title = source.get("title") or source.get("source_name") or source.get("url") or f"Sumber {index}"
        publisher = source.get("source_name") or ""
        date = source.get("publication_date") or ""
        source_type = source.get("source_type") or ""
        reporting_period = source.get("reporting_period") or ""
        label = (
            "[Laporan Keuangan IDX]"
            if source_type == "financial_report"
            else "[Berita]"
            if source_type == "news"
            else "[Sumber]"
        )
        snippet = source.get("snippet") or source.get("retrieved_text") or ""
        source_lines.append(
            f"[{index}] {label} {title}\n"
            f"Publisher: {publisher or '-'}\n"
            f"Tanggal/Periode: {date or reporting_period or '-'}\n"
            f"URL: {source.get('url') or '-'}\n"
            f"Cuplikan: {snippet[:700] or '-'}"
        )
    citations_block = "\n\n".join(source_lines) or "(tidak ada)"
    coverage_rule = coverage_instruction(source_items)

    return [
        {"role": "system", "content": MANAGER_SYNTHESIZER_SYSTEM},
        *history[-6:],
        {"role": "user", "content": (
            f"Pertanyaan investor: {question}\n\n"
            f"{chr(10).join(parts)}\n\n"
            f"Sumber retrieval bernomor:\n{citations_block}\n\n"
            f"Kebijakan cakupan evidence:\n{coverage_rule}\n\n"
            "Susun jawaban final yang profesional, natural, dan mudah dipahami oleh awam. "
            "Gunakan struktur wajib: Monolog, Poin-poin, Kesimpulan, dan Penutup. "
            "Gunakan hanya informasi dari jawaban spesialis dan sumber retrieval bernomor di atas. "
            "Abaikan riwayat percakapan jika berbeda ticker, emiten, atau topik. "
            "Jangan memasukkan klaim yang tidak muncul eksplisit pada evidence. "
            "Jangan menulis daftar sumber di dalam jawaban karena sumber sudah ditampilkan oleh UI. "
            "Jika informasi pendukung tidak tersedia, tulis bahwa dokumen yang "
            "tersedia tidak memuat informasi yang cukup."
        )},
    ]


async def synthesize_answer(messages: list[ChatMessage]) -> str:
    """Non-streaming final manager synthesis."""
    return await chat_complete(
        messages,
        model=MANAGER_MODEL,
        temperature=0.0,
        top_p=1.0,
        max_tokens=768,
    )


def stream_synthesis(messages: list[ChatMessage]):
    """Streaming final manager synthesis."""
    return stream_chat(
        messages,
        model=MANAGER_MODEL,
        temperature=0.0,
        top_p=1.0,
        max_tokens=768,
    )


__all__ = [
    "MANAGER_ROUTER_SYSTEM",
    "MANAGER_SYNTHESIZER_SYSTEM",
    "ManagerPlan",
    "manager_plan",
    "manager_synthesizer_messages",
    "synthesize_answer",
    "stream_synthesis",
]
