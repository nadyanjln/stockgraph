import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CitationSourceCard from "@/components/citation/CitationSourceCard.vue";
import type { SourceItem } from "@/types/chat";

const source: SourceItem = {
  source_id: "report-1",
  source_type: "financial_report",
  title: "Laporan keuangan BBCA kuartal pertama 2026",
  source_name: "IDX",
  url: "https://example.com/reports/bbca-q1",
  publication_date: "",
  reporting_period: "Q1 2026",
  snippet: "",
  retrieved_text: "",
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CitationSourceCard", () => {
  it("opens preview from the primary card action", async () => {
    const wrapper = mount(CitationSourceCard, {
      props: { source, citationIndex: 2 },
    });

    await wrapper.get(".citation-card__preview").trigger("click");
    expect(wrapper.emitted("preview")).toHaveLength(1);
    expect(wrapper.text()).toContain("Laporan Keuangan IDX");
  });

  it("keeps the direct external link separate from preview", async () => {
    const wrapper = mount(CitationSourceCard, {
      props: { source, citationIndex: 2 },
    });
    const external = wrapper.get<HTMLAnchorElement>(".citation-card__external");

    expect(external.attributes("href")).toBe(source.url);
    expect(external.attributes("target")).toBe("_blank");
    expect(external.attributes("rel")).toContain("noopener");

    await external.trigger("click");
    expect(wrapper.emitted("preview")).toBeUndefined();
  });

  it("does not render an active external action without a valid URL", () => {
    const wrapper = mount(CitationSourceCard, {
      props: {
        source: { ...source, url: "" },
        citationIndex: 1,
      },
    });

    expect(wrapper.find(".citation-card__external").exists()).toBe(false);
    expect(wrapper.text()).toContain("Tautan sumber tidak tersedia");
  });
});
