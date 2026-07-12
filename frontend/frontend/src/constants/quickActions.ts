import type { QuickAction } from "@/types/recommendation";

export const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Learn",
    icon: "pi pi-book",
    title: "Pelajari Fundamental",
    description: "Pahami data dan indikator utama emiten.",
  },
  {
    label: "Get Advice",
    icon: "pi pi-briefcase",
    title: "Evaluasi Risiko",
    description: "Tinjau risiko dan faktor yang perlu diperhatikan.",
  },
  {
    label: "Research",
    icon: "pi pi-chart-bar",
    title: "Analisis Mendalam",
    description: "Hubungkan laporan keuangan, berita, dan kondisi pasar.",
  },
];

function normalizeCodes(codes: string[]): string[] {
  return [...new Set(codes.map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function primaryCode(codes: string[]): string {
  return codes[0] ?? "emiten ini";
}

export function buildRecommendations(action: string, rawCodes: string[]): string[] {
  const codes = normalizeCodes(rawCodes);
  const ticker = primaryCode(codes);

  if (action === "Learn") {
    return [
      `Apakah kondisi bisnis ${ticker} sedang membaik atau melemah dari data terbaru?`,
      `Apa arti pendapatan, laba bersih, dan rasio keuangan ${ticker} bagi investor awam?`,
      `Bagian laporan keuangan ${ticker} mana yang paling penting untuk dibaca lebih dulu?`,
    ];
  }

  if (action === "Get Advice") {
    return [
      `Apa peluang dan risiko utama ${ticker} yang perlu dipahami sebelum menilai sahamnya?`,
      `Apa yang bisa membuat harga saham ${ticker} naik atau turun dalam waktu dekat?`,
      `Apakah valuasi ${ticker} terlihat wajar jika dibandingkan dengan kinerja dan prospeknya?`,
    ];
  }

  if (action === "Research") {
    const comparisonPrompt =
      codes.length >= 2
        ? `Mana yang terlihat lebih menarik antara ${codes[0]} dan ${codes[1]} dari sisi kinerja, risiko, dan prospek?`
        : `Apa faktor terbesar yang sedang memengaruhi prospek bisnis ${ticker} saat ini?`;

    return [
      `Apakah kinerja keuangan ${ticker} masih sejalan dengan cerita bisnis dan berita terbarunya?`,
      `Apa risiko industri atau kondisi ekonomi yang paling berdampak pada ${ticker}?`,
      comparisonPrompt,
    ];
  }

  return [
    `Apakah kondisi bisnis ${ticker} sedang membaik atau melemah dari data terbaru?`,
    `Apa peluang dan risiko utama ${ticker} yang perlu dipahami sebelum menilai sahamnya?`,
    `Apa faktor terbesar yang sedang memengaruhi prospek bisnis ${ticker} saat ini?`,
  ];
}
