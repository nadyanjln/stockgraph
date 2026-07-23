import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: 7,
  username: "tester",
  name: "Test User",
  email: "tester@example.test",
  avatar_url: null,
  provider: "email",
  created_at: "2026-01-01T00:00:00Z",
};

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ profile }) => {
    const now = Math.floor(Date.now() / 1000);
    const session = JSON.stringify({
      access_token: "e2e-access-token",
      refresh_token: "e2e-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user: {
        id: "supabase-e2e-user",
        email: profile.email,
        aud: "authenticated",
        role: "authenticated",
        created_at: profile.created_at,
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { full_name: profile.name },
      },
    });
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (/^sb-.+-auth-token$/.test(key)) return session;
      return originalGetItem.call(this, key);
    };
  }, { profile: user });
}

async function installFakeWebSocket(page: Page, mode: "success" | "failure" = "success") {
  await page.addInitScript(({ socketMode }) => {
    Object.assign(window, { __WS_SENT: [], __WS_MODE: socketMode });
    class FakeWebSocket {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(public url: string) {
        window.setTimeout(() => {
          if ((window as any).__WS_MODE === "failure") {
            this.readyState = FakeWebSocket.CLOSED;
            this.onerror?.();
            this.onclose?.();
            return;
          }
          this.readyState = FakeWebSocket.OPEN;
          this.onopen?.();
        }, 10);
      }

      send(raw: string) {
        const payload = JSON.parse(raw);
        (window as any).__WS_SENT.push(payload);
        const emit = (event: object, delay: number) => window.setTimeout(
          () => this.onmessage?.({ data: JSON.stringify(event) }), delay,
        );
        if (payload.reset) {
          emit({ type: "history_cleared" }, 1);
          return;
        }
        const answer = payload.question.includes("risiko")
          ? "Risiko utama BBCA perlu dipantau dari kualitas kredit. [1]"
          : "Kinerja BBCA didukung pertumbuhan laba berdasarkan laporan resmi. [1]";
        emit({ type: "progress", stage: "financial_retrieval", status: "running" }, 10);
        emit({ type: "token", delta: answer.slice(0, 24) }, 20);
        emit({
          type: "final",
          answer_markdown: answer,
          citations: ["[1]"],
          sources: [{
            source_id: "financial:BBCA:2025",
            source_type: "financial_report",
            title: "Laporan Keuangan BBCA",
            source_name: "IDX",
            url: "https://example.test/bbca.pdf",
            publication_date: "",
            reporting_period: "FY 2025",
            snippet: "Laba BBCA meningkat pada FY 2025.",
            retrieved_text: "Laba BBCA meningkat pada FY 2025.",
          }],
        }, 35);
      }

      close() {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.();
      }
    }
    (window as any).WebSocket = FakeWebSocket;
  }, { socketMode: mode });
}

function pipelineResponse() {
  return {
    keywords: { BBCA: ["BBCA kinerja"] },
    articles_count: { BBCA: 2 },
    financial_count: 1,
    graphs_built: [{ year: 2025, graph_name: "stockgraph_2025", documents_ingested: 3, nodes_created: 4, edges_created: 3, errors: 0, error_messages: [] }],
    insight_snapshot: {
      conversation_id: "",
      ticker: "BBCA",
      sentiment: "mixed",
      sentiment_score: 0,
      sentiment_reason: "Sinyal beragam.",
      sentiment_breakdown: { positive: 1, neutral: 0, negative: 1 },
      source_snapshot_id: "snapshot-e2e",
      source_count: 3,
      news_source_count: 2,
      financial_report_count: 1,
      source_ids: ["news:1", "news:2", "financial:1"],
      entities: [{ id: "stock:BBCA", label: "BBCA", type: "stock", source_ids: ["financial:1"] }],
      entity_ids: ["stock:BBCA"],
      graph_node_count: 4,
      graph_relation_count: 3,
      generated_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  };
}

async function mockBackend(page: Page, pipelineStatus = 200) {
  await page.route("http://localhost:8000/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/users/me") {
      return route.fulfill({ json: { success: true, message: "OK", data: user } });
    }
    if (path === "/api/v1/conversations") {
      if (route.request().method() === "POST") {
        return route.fulfill({ status: 201, json: { success: true, data: { id: 21, user_id: 7, title: "BBCA", created_at: "2026-01-01T00:00:00Z" } } });
      }
    }
    if (path.includes("/api/v1/conversations/users/")) {
      return route.fulfill({ json: { success: true, data: [] } });
    }
    if (path.endsWith("/messages/log")) {
      return route.fulfill({ status: 201, json: { success: true, data: { user_message: {}, bot_message: {} } } });
    }
    if (path.includes("/messages")) {
      return route.fulfill({ json: { success: true, data: [] } });
    }
    if (path === "/api/merger/pipeline") {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return pipelineStatus === 200
        ? route.fulfill({ json: pipelineResponse() })
        : route.fulfill({ status: 500, json: { success: false, message: "Pipeline belum tersedia" } });
    }
    if (path === "/api/graph/explore") {
      return route.fulfill({ json: { nodes: [], edges: [], analytics: { node_count: 0, relationship_count: 0, most_connected: [] } } });
    }
    if (path.startsWith("/api/key-financials/")) {
      return route.fulfill({ json: { stock_code: "BBCA", company_name: "Bank Central Asia", source: "IDX", generated_at: "2026-01-01", columns: [], rows: [] } });
    }
    return route.fulfill({ status: 404, json: { message: `No mock for ${path}` } });
  });
}

async function submitAnalysis(page: Page) {
  await expect(page.locator(".home-screen")).toBeVisible();
  await page.locator("#ticker").click();
  await page.locator(".p-multiselect-option").filter({ hasText: "BBCA" }).click();
  await page.keyboard.press("Escape");
  await page.locator(".home-screen textarea").fill("Bagaimana kinerja BBCA?");
  const send = page.locator(".home-screen").getByRole("button", { name: "Kirim pesan" });
  await expect(send).toBeEnabled();
  await send.click({ force: true });
}

test("E2E-001 unauthenticated users are redirected from protected pages", async ({ page }) => {
  await page.goto("/", { waitUntil: "commit" });
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/result?code=BBCA", { waitUntil: "commit" });
  await expect(page).toHaveURL(/\/login\?redirect=/);
});

test("E2E-002 analysis streams a final answer and opens its citation", async ({ page }) => {
  await installAuthenticatedSession(page);
  await installFakeWebSocket(page);
  await mockBackend(page);
  await page.goto("/", { waitUntil: "commit" });
  await submitAnalysis(page);
  await expect(page.getByText("Menyiapkan data BBCA")).toBeVisible();
  await expect(page).toHaveURL(/\/result/);
  await expect(page.getByText(/Kinerja BBCA didukung/)).toBeVisible();
  await expect(page.getByText("Laporan Keuangan BBCA")).toBeVisible();
  await page.getByRole("button", { name: /Lihat detail sumber 1/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("E2E-003 a pipeline failure follows the GraphRAG fallback and stops loading", async ({ page }) => {
  await installAuthenticatedSession(page);
  await installFakeWebSocket(page);
  await mockBackend(page, 500);
  await page.goto("/", { waitUntil: "commit" });
  await submitAnalysis(page);
  await expect(page.getByText(/Kinerja BBCA didukung/)).toBeVisible();
  await expect(page.getByText("Belum Tersedia", { exact: true })).toBeVisible();
  await page.locator(".composer-wrap textarea").fill("Pertanyaan lanjutan");
  await expect(page.locator(".composer-wrap").getByRole("button", { name: "Kirim pesan" })).toBeEnabled();
});

test("E2E-004 a WebSocket failure stops loading without hanging", async ({ page }) => {
  await installAuthenticatedSession(page);
  await installFakeWebSocket(page, "failure");
  await mockBackend(page);
  await page.goto("/", { waitUntil: "commit" });
  await submitAnalysis(page);
  await expect(page.getByRole("heading", { name: "Analisis belum dapat diselesaikan" })).toBeVisible();
  await page.locator(".composer-wrap textarea").fill("Coba lagi");
  await expect(page.locator(".composer-wrap").getByRole("button", { name: "Kirim pesan" })).toBeEnabled();
});

test("E2E-005 follow-up preserves ticker and session while appending the answer", async ({ page }) => {
  await installAuthenticatedSession(page);
  await installFakeWebSocket(page);
  await mockBackend(page);
  await page.goto("/", { waitUntil: "commit" });
  await submitAnalysis(page);
  await expect(page.getByText(/Kinerja BBCA didukung/)).toBeVisible();
  await page.locator(".composer-wrap textarea").fill("Apa risiko utamanya?");
  await page.locator(".composer-wrap").getByRole("button", { name: "Kirim pesan" }).click();
  await expect(page.getByText(/Risiko utama BBCA/)).toBeVisible();
  const sent = await page.evaluate(() => (window as any).__WS_SENT);
  const questions = sent.filter((item: any) => item.question);
  expect(questions).toHaveLength(2);
  expect(questions[1].question).toContain("[BBCA]");
  expect(questions[1].session_id).toBe(questions[0].session_id);
  await expect(page.locator(".message-row.assistant")).toHaveCount(2);
});
