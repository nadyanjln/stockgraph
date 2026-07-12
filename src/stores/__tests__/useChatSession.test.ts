import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const socketHarness = vi.hoisted(() => ({
  open: false,
  onEvent: undefined as ((event: Record<string, unknown>) => void) | undefined,
  onError: undefined as ((message: string) => void) | undefined,
  sent: [] as object[],
}));
const apiHarness = vi.hoisted(() => ({
  runPipeline: vi.fn(),
}));

vi.mock("@/services/chatSocket", () => ({
  ChatSocketClient: class {
    isOpen() {
      return socketHarness.open;
    }
    connect(
      onEvent: (event: Record<string, unknown>) => void,
      onError: (message: string) => void,
    ) {
      socketHarness.open = true;
      socketHarness.onEvent = onEvent;
      socketHarness.onError = onError;
      return Promise.resolve();
    }
    send(payload: object) {
      socketHarness.sent.push(payload);
    }
    close() {
      socketHarness.open = false;
    }
  },
}));

vi.mock("@/stores/useAuth", () => ({
  useAuth: () => ({ state: { user: null } }),
}));

vi.mock("@/services/apiClient", () => ({
  apiClient: {
    runPipeline: apiHarness.runPipeline,
    clearHistory: vi.fn(),
    logMessages: vi.fn(),
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
  },
}));

import { useChatSession } from "@/stores/useChatSession";
import type { PipelineResponse } from "@/types/api";
import type { WsChatEvent } from "@/types/chat";

const chat = useChatSession();

function emit(event: WsChatEvent) {
  socketHarness.onEvent?.(event);
}

function pipeline(snapshotId = "brpt-snapshot"): PipelineResponse {
  return {
    keywords: { BRPT: ["query crawler yang tidak boleh tampil"] },
    articles_count: { BRPT: 2 },
    financial_count: 0,
    graphs_built: [],
    insight_snapshot: {
      conversation_id: "",
      ticker: "BRPT",
      sentiment: "positive",
      sentiment_score: 1,
      sentiment_reason: "Berdasarkan 2 berita relevan.",
      source_snapshot_id: snapshotId,
      source_count: 2,
      news_source_count: 2,
      financial_report_count: 0,
      source_ids: ["article:1", "article:2"],
      entities: [
        {
          id: "brpt",
          label: "BRPT",
          type: "stock",
          source_ids: ["article:1"],
        },
      ],
      entity_ids: ["brpt"],
      graph_node_count: 3,
      graph_relation_count: 2,
      generated_at: "2026-06-25T10:00:00Z",
      updated_at: "2026-06-25T10:00:00Z",
    },
  };
}

describe("useChatSession progress lifecycle", () => {
  beforeEach(() => {
    chat.newChat();
    socketHarness.sent = [];
    apiHarness.runPipeline.mockReset();
    apiHarness.runPipeline.mockResolvedValue(pipeline());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates one user message and one progress assistant immediately", async () => {
    await chat.streamQuestion("[BBCA] Bagaimana prospeknya?");

    expect(chat.state.messages).toHaveLength(2);
    expect(chat.state.messages[0]?.role).toBe("user");
    expect(chat.state.messages[1]?.role).toBe("assistant");
    expect(chat.state.messages[1]?.status).toBe("thinking");
    expect(chat.state.messages[1]?.progressVisible).toBe(false);
    expect(chat.state.messages[1]?.progressBarVisible).toBe(false);
    expect(chat.state.messages[1]?.thinkingText).toBe("StockGraph sedang berpikir...");
    expect(chat.state.messages[1]?.progressSteps?.[0]?.status).toBe("running");
  });

  it("updates progress from backend events and finalizes the existing bubble", async () => {
    await chat.streamQuestion("[BBCA] Bagaimana prospeknya?");
    emit({
      type: "progress",
      stage: "news_retrieval",
      status: "running",
      label: "Mencari berita yang relevan",
    });
    emit({ type: "token", delta: "Jawaban " });
    emit({
      type: "final",
      answer_markdown: "Jawaban final [1]",
      sources: [
        {
          source_id: "news-1",
          source_type: "news",
          title: "Berita BBCA",
          source_name: "Kontan",
          url: "https://example.com/bbca",
          publication_date: "2026-06-20",
          snippet: "Ringkasan",
          retrieved_text: "",
        },
      ],
    });

    expect(chat.state.messages).toHaveLength(2);
    const assistant = chat.state.messages[1]!;
    expect(assistant.status).toBe("complete");
    expect(assistant.content).toBe("Jawaban final [1]");
    expect(assistant.sources).toHaveLength(1);
    expect(assistant.progressSteps?.every((step) => step.status === "completed")).toBe(true);
  });

  it("serializes parallel backend stages into one visual spinner", async () => {
    vi.useFakeTimers();
    await chat.streamQuestion("[BBNI] Analisis fundamental");
    emit({
      type: "progress",
      stage: "entity_resolution",
      status: "completed",
    });
    emit({
      type: "progress",
      stage: "news_retrieval",
      status: "running",
    });
    emit({
      type: "progress",
      stage: "financial_retrieval",
      status: "running",
    });

    let steps = chat.state.messages[1]?.progressSteps ?? [];
    expect(steps.filter((step) => step.status === "running")).toHaveLength(1);
    expect(steps.find((step) => step.status === "running")?.stage).toBe(
      "entity_resolution",
    );

    await vi.advanceTimersByTimeAsync(260);
    steps = chat.state.messages[1]?.progressSteps ?? [];
    expect(steps.filter((step) => step.status === "running")).toHaveLength(1);
    expect(steps.find((step) => step.status === "running")?.stage).toBe(
      "financial_retrieval",
    );
  });

  it("turns a backend error into a finite, user-friendly error state", async () => {
    await chat.streamQuestion("Analisis TLKM");
    emit({ type: "error", message: "private stack trace and agent prompt" });

    const assistant = chat.state.messages[1]!;
    expect(chat.state.isStreaming).toBe(false);
    expect(assistant.status).toBe("error");
    expect(assistant.content).toContain("Analisis belum dapat diselesaikan");
    expect(assistant.content).not.toContain("private stack trace");
  });

  it("stops indefinite loading after the hard timeout", async () => {
    vi.useFakeTimers();
    await chat.streamQuestion("Analisis ASII");

    await vi.advanceTimersByTimeAsync(120_000);

    const assistant = chat.state.messages[1]!;
    expect(chat.state.isStreaming).toBe(false);
    expect(assistant.status).toBe("error");
    expect(socketHarness.open).toBe(false);
  });

  it("allows the ingestion pipeline to run longer than the chat stream timeout", async () => {
    vi.useFakeTimers();
    apiHarness.runPipeline.mockImplementationOnce(() => new Promise(() => {}));

    void chat.runAnalysis({
      stockCodes: ["BBCA"],
      question: "Analisis risiko BBCA",
      maxArticles: 4,
      threshold: 0.6,
    });
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(120_000);
    let assistant = chat.state.messages[1]!;
    expect(chat.state.pipelineLoading).toBe(true);
    expect(chat.state.isStreaming).toBe(true);
    expect(assistant.status).toBe("thinking");
    expect(assistant.progressVisible).toBe(true);
    expect(assistant.progressBarVisible).toBe(true);
    expect(assistant.progressTitle).toBe("Menyiapkan data BBCA");

    await vi.advanceTimersByTimeAsync(480_001);
    assistant = chat.state.messages[1]!;
    expect(chat.state.pipelineLoading).toBe(false);
    expect(chat.state.isStreaming).toBe(false);
    expect(assistant.status).toBe("error");
  });

  it("keeps the conversation insight snapshot stable across a follow-up", async () => {
    const run = chat.runAnalysis({
      stockCodes: ["BRPT"],
      question: "Bagaimana kinerjanya?",
      maxArticles: 4,
      threshold: 0.6,
    });
    await run;
    emit({
      type: "final",
      answer: "Jawaban awal",
      sources: [
        {
          source_id: "article:1",
          source_type: "news",
          title: "Berita BRPT",
          source_name: "Kontan",
          url: "https://example.com/brpt",
          publication_date: "2026-06-25",
          snippet: "Ringkasan",
          retrieved_text: "",
        },
      ],
    });
    const snapshot = chat.state.insightSnapshot;
    const firstAnswer = chat.state.messages.find(
      (message) => message.role === "assistant",
    );

    await chat.streamQuestion("[BRPT] Apa risikonya?");

    expect(chat.state.insightSnapshot).toBe(snapshot);
    expect(chat.state.insightSnapshot?.sentiment).toBe("positive");
    expect(chat.state.insightSnapshot?.source_snapshot_id).toBe("brpt-snapshot");
    expect(firstAnswer?.sourceSnapshotId).toBe("brpt-snapshot");
    expect(snapshot?.source_ids).toContain(firstAnswer?.sources?.[0]?.source_id);
  });

  it("prevents a stale pipeline response from replacing the latest insight", async () => {
    let resolvePipeline: ((value: PipelineResponse) => void) | undefined;
    apiHarness.runPipeline.mockImplementationOnce(
      () =>
        new Promise<PipelineResponse>((resolve) => {
          resolvePipeline = resolve;
        }),
    );
    const oldRun = chat.runAnalysis({
      stockCodes: ["BRPT"],
      question: "Analisis lama",
      maxArticles: 4,
      threshold: 0.6,
    });
    await Promise.resolve();
    await Promise.resolve();

    chat.newChat();
    resolvePipeline?.(pipeline("stale-snapshot"));
    await oldRun;

    expect(chat.state.insightSnapshot).toBeNull();
    expect(chat.state.lastPipeline).toBeNull();
  });
});
