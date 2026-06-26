import MarkdownIt from "markdown-it";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Token from "markdown-it/lib/token.mjs";

function sanitizeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.trim());
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function renderInlineCitations(text: string, sourceCount: number, escapeHtml: (value: string) => string): string {
  const escaped = escapeHtml(text);
  if (sourceCount <= 0) return escaped;

  return escaped.replace(/\[(\d+)\]/g, (match, rawIndex: string) => {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 1 || index > sourceCount) return match;
    return (
      `<button type="button" class="inline-citation" data-citation="${index}" ` +
      `aria-label="Lihat sumber ${index}">[${index}]</button>`
    );
  });
}

function addClass(
  tokens: Token[],
  index: number,
  className: string,
) {
  const token = tokens[index];
  if (!token) return;
  const existing = token.attrGet("class");
  token.attrSet("class", existing ? `${existing} ${className}` : className);
}

function createMarkdownRenderer(sourceCount: number) {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
  });

  md.validateLink = sanitizeUrl;

  const defaultRender =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx]?.attrGet("href");
    if (!href || !sanitizeUrl(href)) {
      tokens[idx]?.attrSet("href", "#");
    }
    tokens[idx]?.attrSet("target", "_blank");
    tokens[idx]?.attrSet("rel", "noopener noreferrer");
    return defaultRender(tokens, idx, options, env, self);
  };

  md.renderer.rules.text = (tokens, idx) =>
    renderInlineCitations(tokens[idx]?.content ?? "", sourceCount, md.utils.escapeHtml);

  md.renderer.rules.table_open = () => '<div class="table-scroll"><table>';
  md.renderer.rules.table_close = () => "</table></div>";

  md.renderer.rules.ordered_list_open = (tokens, idx, options, _env, self) => {
    addClass(tokens, idx, "ai-list ai-list--ordered");
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.bullet_list_open = (tokens, idx, options, _env, self) => {
    addClass(tokens, idx, "ai-list ai-list--bullet");
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.paragraph_open = (tokens, idx, options, _env, self) => {
    addClass(tokens, idx, "ai-paragraph");
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
    addClass(tokens, idx, "ai-heading");
    return self.renderToken(tokens, idx, options);
  };

  return md;
}

function normalizeMarkdown(markdown: string): string {
  return (markdown || "")
    .replaceAll("\r\n", "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function renderMarkdownToHtml(markdown: string, sourceCount = 0): string {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized) return "<p class=\"ai-paragraph\">-</p>";
  return createMarkdownRenderer(sourceCount).render(normalized);
}

export type MarkdownRenderer = Renderer;
