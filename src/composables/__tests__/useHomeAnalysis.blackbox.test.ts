import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  push: vi.fn(),
  runAnalysis: vi.fn(),
  state: { pipelineLoading: false },
}));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: harness.push }) }));
vi.mock("@/stores/useChatSession", () => ({
  useChatSession: () => ({ state: harness.state, runAnalysis: harness.runAnalysis }),
}));

import { useHomeAnalysis } from "@/composables/useHomeAnalysis";

describe("black-box home analysis form", () => {
  beforeEach(() => {
    harness.push.mockReset();
    harness.runAnalysis.mockReset();
    harness.state.pipelineLoading = false;
  });

  it("BB-FE-005 rejects empty question and empty ticker", () => {
    const form = useHomeAnalysis();
    form.submitQuestion();
    form.question.value = "Bagaimana kinerjanya?";
    form.submitQuestion();
    expect(harness.runAnalysis).not.toHaveBeenCalled();
    expect(harness.push).not.toHaveBeenCalled();
  });

  it("BB-FE-006 submits normalized multiple tickers and opens result", () => {
    const form = useHomeAnalysis();
    form.selectedCodes.value = [" bbca ", "bmri"];
    form.question.value = "Bandingkan kinerja keduanya";
    form.thresholdModel.value = 7;
    form.submitQuestion();
    expect(harness.runAnalysis).toHaveBeenCalledWith({
      stockCodes: ["BBCA", "BMRI"],
      question: "Bandingkan kinerja keduanya",
      maxArticles: 5,
      threshold: 0.7,
    });
    expect(harness.push).toHaveBeenCalledWith(expect.objectContaining({ name: "result" }));
  });

  it("BB-FE-007 quick recommendation fills the visible question", () => {
    const form = useHomeAnalysis();
    form.applyRecommendation("Apa risiko utama BBCA?");
    expect(form.question.value).toBe("Apa risiko utama BBCA?");
  });

  it("BB-FE-008 prevents a second submission while pipeline is running", () => {
    const form = useHomeAnalysis();
    form.selectedCodes.value = ["BBCA"];
    form.question.value = "Analisis BBCA";
    harness.state.pipelineLoading = true;
    form.submitQuestion();
    expect(harness.runAnalysis).not.toHaveBeenCalled();
  });
});
