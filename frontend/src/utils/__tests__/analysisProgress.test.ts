import { describe, expect, it } from "vitest";
import {
  advanceProgressStep,
  activeProgressNote,
  applySafeProgressEvent,
  completeProgressSteps,
  createProgressSteps,
  detectTicker,
} from "@/utils/analysisProgress";

describe("analysis progress", () => {
  it("creates an immediate safe fallback state personalized by ticker", () => {
    const steps = createProgressSteps("[BBCA] Bagaimana prospek saham ini?");

    expect(detectTicker("[BBCA] Bagaimana prospek saham ini?")).toBe("BBCA");
    expect(steps[0]?.status).toBe("running");
    expect(steps[0]?.label).toBe("Mengidentifikasi emiten dan konteks analisis");
    expect(steps.find((step) => step.stage === "news_retrieval")?.label).toContain(
      "BBCA",
    );
  });

  it("updates stages from structured backend progress events", () => {
    const steps = createProgressSteps("[BBRI] Analisis risiko");
    let updated = applySafeProgressEvent(
      steps,
      {
        type: "progress",
        stage: "entity_resolution",
        status: "completed",
      },
      "BBRI",
    );
    updated = advanceProgressStep(updated);
    updated = applySafeProgressEvent(
      updated,
      {
        type: "progress",
        stage: "financial_retrieval",
        status: "running",
        label: "untrusted internal reasoning text",
      },
      "BBRI",
    );

    const financial = updated.find((step) => step.stage === "financial_retrieval");
    expect(financial?.status).toBe("running");
    expect(financial?.label).toBe("Menelusuri laporan keuangan BBRI");
    expect(financial?.label).not.toContain("internal reasoning");
  });

  it("queues parallel backend stages and exposes only one active step", () => {
    let steps = createProgressSteps("[BBNI] Analisis risiko");
    steps = applySafeProgressEvent(
      steps,
      { type: "progress", stage: "entity_resolution", status: "completed" },
      "BBNI",
    );
    steps = applySafeProgressEvent(
      steps,
      { type: "progress", stage: "news_retrieval", status: "running" },
      "BBNI",
    );
    steps = applySafeProgressEvent(
      steps,
      { type: "progress", stage: "financial_retrieval", status: "running" },
      "BBNI",
    );

    expect(steps.filter((step) => step.status === "running")).toHaveLength(1);
    expect(steps.find((step) => step.status === "running")?.stage).toBe(
      "entity_resolution",
    );

    steps = advanceProgressStep(steps);
    expect(steps.filter((step) => step.status === "running")).toHaveLength(1);
    expect(steps.find((step) => step.status === "running")?.stage).toBe(
      "financial_retrieval",
    );
    expect(activeProgressNote(steps)).toBe(
      "Menelusuri laporan keuangan BBNI",
    );
  });

  it("supports legacy stream events without exposing agent previews", () => {
    let steps = createProgressSteps("Analisis TLKM");
    steps = applySafeProgressEvent(
      steps,
      { type: "plan" },
      "TLKM",
    );
    steps = advanceProgressStep(steps);
    steps = applySafeProgressEvent(
      steps,
      { type: "agent_start", agent: "news", preview: "hidden agent output" },
      "TLKM",
    );
    steps = applySafeProgressEvent(
      steps,
      { type: "agent_done", agent: "news", preview: "hidden agent output" },
      "TLKM",
    );

    const news = steps.find((step) => step.stage === "news_retrieval");
    expect(news?.reportedStatus).toBe("completed");
    expect(news?.label).not.toContain("hidden agent output");
  });

  it("marks all stages complete when a final answer arrives", () => {
    const completed = completeProgressSteps(createProgressSteps("Analisis ASII"));
    expect(completed.every((step) => step.status === "completed")).toBe(true);
  });
});
