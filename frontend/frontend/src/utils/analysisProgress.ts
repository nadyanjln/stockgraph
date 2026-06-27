import type {
  AnalysisProgressStatus,
  AnalysisProgressStep,
  AnalysisStage,
  WsChatEvent,
} from "@/types/chat";

export const ANALYSIS_STAGE_ORDER: AnalysisStage[] = [
  "entity_resolution",
  "financial_retrieval",
  "news_retrieval",
  "graph_traversal",
  "relevance_validation",
  "answer_generation",
];

export function detectTicker(question: string): string {
  const bracketed = question.match(/\[([A-Z]{2,6})(?:[,\s\]])/i)?.[1];
  if (bracketed) return bracketed.toUpperCase();
  return question.match(/\b[A-Z]{4}\b/)?.[0] ?? "";
}

export function progressLabel(stage: AnalysisStage, ticker = ""): string {
  const subject = ticker ? ` ${ticker}` : "";
  const labels: Record<AnalysisStage, string> = {
    question_understanding: "Memahami pertanyaan Anda",
    entity_resolution: "Mengidentifikasi emiten dan konteks analisis",
    financial_retrieval: ticker
      ? `Menelusuri laporan keuangan ${ticker}`
      : "Menelusuri laporan keuangan IDX",
    news_retrieval: ticker
      ? `Mencari berita terbaru terkait ${ticker}`
      : "Mencari berita yang relevan",
    graph_traversal: ticker
      ? `Menghubungkan faktor yang memengaruhi ${ticker}`
      : "Menghubungkan informasi pada knowledge graph",
    relevance_validation: "Memeriksa relevansi sumber",
    answer_generation: "Menyusun analisis dan citation",
    citation_preparation: "Menyiapkan citation sumber",
    completed: `Analisis${subject} siap`,
    failed: "Analisis belum dapat diselesaikan",
  };
  return labels[stage];
}

export function createProgressSteps(question: string): AnalysisProgressStep[] {
  const ticker = detectTicker(question);
  return ANALYSIS_STAGE_ORDER.map((stage, index) => ({
    stage,
    status: index === 0 ? "running" : "pending",
    reportedStatus: index === 0 ? "running" : "pending",
    label: progressLabel(stage, ticker),
  }));
}

export function setProgressStage(
  steps: AnalysisProgressStep[],
  stage: AnalysisStage,
  status: AnalysisProgressStatus,
  ticker = "",
): AnalysisProgressStep[] {
  if (stage === "completed" || stage === "failed") return steps;
  const targetIndex = steps.findIndex((step) => step.stage === stage);
  if (targetIndex < 0) return steps;

  const next = steps.map((step, index) =>
    index === targetIndex
      ? {
          ...step,
          reportedStatus: status,
          label: progressLabel(stage, ticker),
        }
      : step,
  );
  const activeIndex = next.findIndex((step) => step.status === "running");

  if (status === "failed") {
    if (activeIndex !== targetIndex) return next;
    return next.map((step, index) =>
      index === targetIndex ? { ...step, status: "failed" } : step,
    );
  }

  if (status === "running") {
    if (activeIndex >= 0) return next;
    return next.map((step, index) =>
      index === targetIndex ? { ...step, status: "running" } : step,
    );
  }

  return next;
}

export function advanceProgressStep(
  steps: AnalysisProgressStep[],
): AnalysisProgressStep[] {
  const activeIndex = steps.findIndex((step) => step.status === "running");
  if (activeIndex < 0 || steps[activeIndex]?.reportedStatus !== "completed") {
    return steps;
  }
  const nextIndex = steps.findIndex(
    (step, index) => index > activeIndex && step.status === "pending",
  );
  return steps.map((step, index) => {
    if (index === activeIndex) return { ...step, status: "completed" };
    if (index === nextIndex) return { ...step, status: "running" };
    return step;
  });
}

export function completeProgressSteps(
  steps: AnalysisProgressStep[],
): AnalysisProgressStep[] {
  return steps.map((step) => ({
    ...step,
    status: "completed",
    reportedStatus: "completed",
  }));
}

export function activeProgressStep(
  steps: AnalysisProgressStep[],
): AnalysisProgressStep | undefined {
  return steps.find((step) => step.status === "running");
}

export function activeProgressNote(
  steps: AnalysisProgressStep[],
  fallback = "",
): string {
  const active = activeProgressStep(steps);
  if (!active) return fallback;
  return active.label;
}

export function applySafeProgressEvent(
  steps: AnalysisProgressStep[],
  event: WsChatEvent,
  ticker = "",
): AnalysisProgressStep[] {
  if (event.type === "progress" && event.stage && event.status) {
    return setProgressStage(steps, event.stage, event.status, ticker);
  }

  if (event.type === "plan") {
    return setProgressStage(steps, "entity_resolution", "completed", ticker);
  }

  if (event.type === "agent_start") {
    const stage = event.agent === "financial" ? "financial_retrieval" : "news_retrieval";
    return setProgressStage(steps, stage, "running", ticker);
  }

  if (event.type === "agent_done") {
    const stage = event.agent === "financial" ? "financial_retrieval" : "news_retrieval";
    if (steps.find((step) => step.stage === stage)?.status === "failed") return steps;
    return setProgressStage(steps, stage, "completed", ticker);
  }

  if (event.type === "token") {
    return setProgressStage(steps, "answer_generation", "running", ticker);
  }

  return steps;
}
