import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "@/utils/markdown";

describe("markdown inline citations", () => {
  it("renders valid citation references as accessible preview buttons", () => {
    const html = renderMarkdownToHtml("Kinerja tumbuh [1] tetapi risikonya tetap ada [2].", 2);

    expect(html).toContain('data-citation="1"');
    expect(html).toContain('aria-label="Lihat sumber 1"');
    expect(html).toContain('data-citation="2"');
  });

  it("does not make out-of-range citation references interactive", () => {
    const html = renderMarkdownToHtml("Sumber tersedia [1], sumber tidak tersedia [3].", 1);

    expect(html).toContain('data-citation="1"');
    expect(html).not.toContain('data-citation="3"');
    expect(html).toContain("[3]");
  });

  it("keeps ordered list items in one browser-numbered list with nested bullets", () => {
    const html = renderMarkdownToHtml(
      [
        "## Detail Risiko Utama",
        "",
        "1. **Kerugian Investasi pada GOTO**",
        "   - TLKM mengalami kerugian investasi [1].",
        "",
        "2. **Tantangan Industri Telekomunikasi**",
        "   - Persaingan ketat menekan kinerja [2].",
        "",
        "3. **Kebutuhan Investasi Berkelanjutan**",
        "   - Perusahaan perlu menjaga belanja modal [1] [2].",
      ].join("\n"),
      2,
    );

    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html.match(/<ul/g)).toHaveLength(3);
    expect(html).toContain("<strong>Kerugian Investasi pada GOTO</strong>");
    expect(html).toContain('data-citation="1"');
    expect(html).toContain('data-citation="2"');
  });

  it("renders tables and escapes raw html instead of executing it", () => {
    const html = renderMarkdownToHtml(
      [
        "| Metrik | Nilai |",
        "| --- | ---: |",
        "| Laba | 57,54T |",
        "",
        "<script>alert('x')</script>",
      ].join("\n"),
    );

    expect(html).toContain('class="table-scroll"');
    expect(html).toContain("<table>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
