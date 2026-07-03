import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf-8");
}

describe("responsive layout safeguards", () => {
  it("keeps result page sidebar and insight panels as mobile drawers", () => {
    const source = readSource("../ResultView.vue");

    expect(source).toContain("sidebarDrawerOpen");
    expect(source).toContain("insightDrawerOpen");
    expect(source).toContain('id="conversation-sidebar"');
    expect(source).toContain('id="insight-panel"');
    expect(source).toContain('@media (max-width: 1023px)');
    expect(source).toContain('@media (max-width: 767px)');
    expect(source).toMatch(/\.sidebar-shell\s*\{[\s\S]*?position:\s*fixed/);
    expect(source).toMatch(/\.right-panel\s*\{[\s\S]*?position:\s*fixed/);
    expect(source).toContain('event.key !== "Escape"');
  });

  it("keeps home page sidebar as an off-canvas drawer on small screens", () => {
    const source = readSource("../HomeView.vue");

    expect(source).toContain("sidebarDrawerOpen");
    expect(source).toContain('id="home-conversation-sidebar"');
    expect(source).toContain('@media (max-width: 1080px)');
    expect(source).toMatch(/\.sidebar-shell\s*\{[\s\S]*?position:\s*fixed/);
    expect(source).toMatch(/\.home-screen\s*\{[\s\S]*?overflow-x:\s*hidden/);
    expect(source).toContain('event.key !== "Escape"');
  });

  it("keeps common responsive overflow protections in shared components", () => {
    const globalCss = readSource("../../styles/global.css");
    const composer = readSource("../../components/common/AppMessageComposer.vue");
    const graph = readSource("../../components/graph/KnowledgeGraphExplorer.vue");
    const sourceModal = readSource("../../components/citation/SourceDetailModal.vue");

    expect(globalCss).toContain("overflow-x: hidden");
    expect(composer).toContain("@media (max-width: 420px)");
    expect(composer).toContain("overflow-wrap: anywhere");
    expect(graph).toContain("@media (max-width: 760px)");
    expect(graph).toMatch(/\.source-drawer\s*\{[\s\S]*?position:\s*fixed/);
    expect(sourceModal).toContain('to="body"');
  });
});
