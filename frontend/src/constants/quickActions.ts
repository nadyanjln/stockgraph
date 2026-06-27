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
      `Bagaimana cara membaca kinerja ${ticker} dari pendapatan, laba bersih, dan rasio keuangannya?`,
      `Metrik apa yang paling penting untuk dipantau pada ${ticker}, dan mengapa metrik tersebut relevan?`,
      `Bagaimana berita terbaru dapat berkaitan dengan perubahan kinerja keuangan ${ticker}?`,
    ];
  }

  if (action === "Get Advice") {
    return [
      `Apa tiga risiko utama ${ticker} berdasarkan laporan keuangan dan berita terbaru?`,
      `Sinyal apa yang perlu saya pantau sebelum mempertimbangkan ${ticker} berdasarkan data yang tersedia?`,
      `Faktor apa yang dapat memengaruhi prospek ${ticker} dalam beberapa periode ke depan?`,
    ];
  }

  if (action === "Research") {
    const comparisonPrompt =
      codes.length >= 2
        ? `Bagaimana kinerja ${codes[0]} dibandingkan dengan ${codes[1]} berdasarkan fundamental dan pemberitaan terbaru?`
        : `Bagaimana perubahan pendapatan, margin, dan laba bersih ${ticker} berkaitan dengan berita terbaru?`;

    return [
      `Apa hubungan antara perubahan laba bersih ${ticker} dan sentimen dari berita terbaru?`,
      `Faktor apa yang paling memengaruhi kinerja ${ticker} berdasarkan laporan keuangan, berita, dan kondisi pasar?`,
      comparisonPrompt,
    ];
  }

  return [
    `Bagaimana cara membaca kinerja ${ticker} dari pendapatan, laba bersih, dan rasio keuangannya?`,
    `Apa tiga risiko utama ${ticker} berdasarkan laporan keuangan dan berita terbaru?`,
    `Apa hubungan antara perubahan laba bersih ${ticker} dan sentimen dari berita terbaru?`,
  ];
}
