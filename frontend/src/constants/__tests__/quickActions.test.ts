import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuickRecommendationPanel from "@/components/home/QuickRecommendationPanel.vue";
import { QUICK_ACTIONS, buildRecommendations } from "@/constants/quickActions";

const actions = ["Learn", "Get Advice", "Research"];

describe("quick recommendation prompts", () => {
  it("returns exactly three recommendations for every tab", () => {
    for (const action of actions) {
      expect(buildRecommendations(action, ["BBCA"])).toHaveLength(3);
    }
  });

  it("uses the selected ticker and an explicit fallback", () => {
    expect(buildRecommendations("Learn", ["bbca"]).every((item) => item.includes("BBCA"))).toBe(
      true,
    );
    expect(
      buildRecommendations("Get Advice", []).every((item) => item.includes("emiten ini")),
    ).toBe(true);
  });

  it("does not include direct buy/sell, target-price, or personalized advice wording", () => {
    const forbidden =
      /\b(harus beli|harus jual|target harga|waktu terbaik membeli|strategi investasi.*untuk saya|profil risiko)\b/i;
    const prompts = actions.flatMap((action) => buildRecommendations(action, ["BBCA"]));
    expect(prompts.some((item) => forbidden.test(item))).toBe(false);
  });

  it("uses multi-source or relational framing in Research prompts", () => {
    const prompts = buildRecommendations("Research", ["BBCA"]);
    expect(prompts[0]).toMatch(/laba bersih.*sentimen.*berita/i);
    expect(prompts[1]).toMatch(/laporan keuangan.*berita.*kondisi pasar/i);
    expect(prompts[2]).toMatch(/pendapatan.*margin.*laba bersih.*berita/i);
  });

  it("only shows a company comparison when a second ticker is selected", () => {
    const withoutPeer = buildRecommendations("Research", ["BBCA"])[2] ?? "";
    const withPeer = buildRecommendations("Research", ["BBCA", "BBRI"])[2] ?? "";

    expect(withoutPeer).not.toContain("dibandingkan dengan");
    expect(withPeer).toContain("BBCA dibandingkan dengan BBRI");
  });

  it("emits the selected prompt so the existing parent flow can fill the chat input", async () => {
    const recommendations = buildRecommendations("Learn", ["BBCA"]);
    const wrapper = mount(QuickRecommendationPanel, {
      props: {
        actions: QUICK_ACTIONS,
        activeAction: "Learn",
        recommendations,
      },
    });

    await wrapper.findAll(".recommend-item")[0]?.trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual([recommendations[0]]);
  });
});
