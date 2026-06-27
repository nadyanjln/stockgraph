import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AnalysisProgress from "@/components/chat/AnalysisProgress.vue";
import {
  advanceProgressStep,
  createProgressSteps,
  setProgressStage,
} from "@/utils/analysisProgress";

describe("AnalysisProgress", () => {
  it("renders only one accessible current-stage status without a checklist", () => {
    let steps = setProgressStage(
      createProgressSteps("[BBCA] Analisis fundamental"),
      "entity_resolution",
      "completed",
      "BBCA",
    );
    steps = advanceProgressStep(steps);
    const wrapper = mount(AnalysisProgress, {
      props: {
        title: "StockGraph sedang menganalisis BBCA",
        note: "Menyiapkan konteks dan sumber analisis.",
        steps,
      },
    });

    expect(wrapper.attributes("role")).toBe("status");
    expect(wrapper.attributes("aria-live")).toBe("polite");
    expect(wrapper.text()).toContain("StockGraph sedang menganalisis BBCA");
    expect(wrapper.text()).toContain("Menelusuri laporan keuangan BBCA");
    expect(wrapper.find("ol").exists()).toBe(false);
    expect(wrapper.find("ul").exists()).toBe(false);
    expect(wrapper.find(".pi-check").exists()).toBe(false);
    expect(wrapper.findAll(".analysis-progress__dots")).toHaveLength(1);
    expect(wrapper.findAll(".analysis-progress__header p")).toHaveLength(1);
  });

  it("replaces the single text when the active stage changes", async () => {
    let steps = setProgressStage(
      createProgressSteps("Analisis emiten"),
      "entity_resolution",
      "completed",
    );
    steps = advanceProgressStep(steps);
    steps = setProgressStage(
      steps,
      "financial_retrieval",
      "completed",
    );
    steps = advanceProgressStep(steps);
    steps = setProgressStage(
      steps,
      "news_retrieval",
      "running",
    );
    const wrapper = mount(AnalysisProgress, {
      props: { title: "StockGraph sedang menganalisis", steps },
    });

    expect(wrapper.text()).toContain("Mencari berita yang relevan");
    expect(wrapper.findAll(".analysis-progress__dots")).toHaveLength(1);

    let next = setProgressStage(steps, "news_retrieval", "completed");
    next = advanceProgressStep(next);
    await wrapper.setProps({ steps: next });

    expect(wrapper.text()).not.toContain("Mencari berita yang relevan");
    expect(wrapper.text()).toContain("Menghubungkan informasi pada knowledge graph");
    expect(wrapper.findAll(".analysis-progress__header p")).toHaveLength(1);
  });

  it("stops animation and shows one error status", () => {
    const steps = createProgressSteps("Analisis emiten").map((step, index) => ({
      ...step,
      status: index === 0 ? ("failed" as const) : ("pending" as const),
    }));
    const wrapper = mount(AnalysisProgress, {
      props: {
        title: "Analisis belum dapat diselesaikan",
        note: "Analisis belum dapat diselesaikan. Silakan coba lagi.",
        steps,
      },
    });

    expect(wrapper.find(".analysis-progress__dots").exists()).toBe(false);
    expect(wrapper.find(".pi-exclamation-circle").exists()).toBe(true);
    expect(wrapper.findAll(".analysis-progress__header p")).toHaveLength(1);
    expect(wrapper.text()).toContain("Silakan coba lagi");
  });
});
