import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import SourceDetailModal from "@/components/citation/SourceDetailModal.vue";
import type { SourceItem } from "@/types/chat";

const newsSource: SourceItem = {
  source_id: "news-1",
  source_type: "news",
  title: "BBCA mencatat pertumbuhan kredit",
  source_name: "Kontan",
  url: "https://example.com/news/bbca",
  publication_date: "2026-06-20",
  snippet: "Pertumbuhan kredit didukung oleh permintaan pada segmen korporasi.",
  retrieved_text: "",
};

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("SourceDetailModal", () => {
  it("teleports the dialog to body and exposes a safe canonical source link", async () => {
    const wrapper = mount(SourceDetailModal, {
      props: { source: newsSource, citationIndex: 3 },
      attachTo: document.body,
    });
    await nextTick();

    const layer = document.body.querySelector<HTMLElement>("[data-testid='source-modal-layer']");
    const cta = document.body.querySelector<HTMLAnchorElement>(".source-modal__cta");

    expect(layer).not.toBeNull();
    expect(layer?.closest("body")).toBe(document.body);
    expect(layer?.querySelector(".source-modal__citation")?.textContent).toContain("[3]");
    expect(layer?.querySelector(".source-modal__kind")?.textContent).toContain("Berita");
    expect(cta?.href).toBe(newsSource.url);
    expect(cta?.target).toBe("_blank");
    expect(cta?.rel).toContain("noopener");
    expect(document.body.style.overflow).toBe("hidden");

    wrapper.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("shows a disabled availability state when the source has no usable URL", async () => {
    const wrapper = mount(SourceDetailModal, {
      props: {
        source: { ...newsSource, url: "javascript:alert(1)" },
        citationIndex: 1,
      },
      attachTo: document.body,
    });
    await nextTick();

    expect(document.body.querySelector(".source-modal__cta")).toBeNull();
    expect(document.body.querySelector(".source-modal__unavailable")?.textContent).toContain(
      "Tautan sumber tidak tersedia",
    );
    wrapper.unmount();
  });

  it("closes from Escape and the close button", async () => {
    const wrapper = mount(SourceDetailModal, {
      props: { source: newsSource, citationIndex: 1 },
      attachTo: document.body,
    });
    await nextTick();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("close")).toHaveLength(1);

    document.body.querySelector<HTMLButtonElement>(".source-modal__close")?.click();
    expect(wrapper.emitted("close")).toHaveLength(2);
    wrapper.unmount();
  });
});
