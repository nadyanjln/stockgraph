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
Kamu adalah Senior Analyst yang menyintesiskan jawaban final untuk investor BEI.
Kamu menerima jawaban parsial dari News Analyst dan Financial Analyst, dan harus
menggabungkannya menjadi jawaban tunggal yang koheren.

Aturan:
- Jawab dalam Bahasa Indonesia, ringkas tapi informatif.
- Mulai dengan kesimpulan utama (1 kalimat), lanjut detail pendukung.
- Cantumkan sitasi sumber bila ada.
- Bila konteks dari history relevan, gunakan untuk menjaga koherensi conversation.
- Jangan ulangi pertanyaan; langsung ke jawaban.
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
) -> list[ChatMessage]:
    """Build messages for the final synthesizer call."""
    parts = []
    if "news" in sub_answers:
        parts.append(f"## Jawaban News Analyst:\n{sub_answers['news']}")
    if "financial" in sub_answers:
        parts.append(f"## Jawaban Financial Analyst:\n{sub_answers['financial']}")
    citations_block = "\n".join(f"- {c}" for c in sub_citations[:8]) or "(tidak ada)"

    return [
        {"role": "system", "content": MANAGER_SYNTHESIZER_SYSTEM},
        *history[-6:],
        {"role": "user", "content": (
            f"Pertanyaan investor: {question}\n\n"
            f"{chr(10).join(parts)}\n\n"
            f"Sumber:\n{citations_block}\n\n"
            f"Tulis jawaban final terpadu."
        )},
    ]


async def synthesize_answer(messages: list[ChatMessage]) -> str:
    """Non-streaming final manager synthesis."""
    return await chat_complete(messages, model=MANAGER_MODEL, temperature=0.3)


def stream_synthesis(messages: list[ChatMessage]):
    """Streaming final manager synthesis."""
    return stream_chat(messages, model=MANAGER_MODEL, temperature=0.3)


__all__ = [
    "MANAGER_ROUTER_SYSTEM",
    "MANAGER_SYNTHESIZER_SYSTEM",
    "ManagerPlan",
    "manager_plan",
    "manager_synthesizer_messages",
    "synthesize_answer",
    "stream_synthesis",
]
