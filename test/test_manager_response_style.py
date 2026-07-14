from __future__ import annotations

import unittest

from app.core.agent.manager_agent import (
    MANAGER_SYNTHESIZER_SYSTEM,
    manager_synthesizer_messages,
)


class ManagerResponseStyleTests(unittest.TestCase):
    def test_system_prompt_uses_adaptive_response_structure(self) -> None:
        prompt = MANAGER_SYNTHESIZER_SYSTEM

        self.assertIn("Jika pengguna meminta perbandingan", prompt)
        self.assertIn("tabel Markdown", prompt)
        self.assertIn("2-4 kalimat per paragraf", prompt)
        self.assertIn("numbered list", prompt)
        self.assertIn("Setiap bullet harus menyampaikan satu gagasan utama", prompt)
        self.assertNotIn("Gunakan struktur jawaban berikut", prompt)
        self.assertNotIn("1. Monolog:", prompt)

    def test_final_instruction_keeps_sources_outside_narrative(self) -> None:
        messages = manager_synthesizer_messages(
            "Apakah BBCA layak dipertimbangkan?",
            history=[],
            sub_answers={"financial": "Evidence tersedia."},
            sub_citations=[],
            sources=[
                {
                    "source_id": "financial:BBCA:2025",
                    "source_type": "financial_report",
                    "title": "Laporan Keuangan BBCA",
                    "reporting_period": "FY 2025",
                    "snippet": "Laba bersih tersedia dalam laporan.",
                }
            ],
        )

        instruction = messages[-1]["content"]
        self.assertIn("berdasarkan intent pertanyaan", instruction)
        self.assertIn("sekitar 2-4 kalimat", instruction)
        self.assertIn("referensi sudah ditampilkan secara terpisah", instruction)
        self.assertNotIn("Gunakan struktur wajib", instruction)


if __name__ == "__main__":
    unittest.main()
