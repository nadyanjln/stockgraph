import { computed, reactive } from "vue";
import { ChatSocketClient } from "@/services/chatSocket";
import { apiClient } from "@/services/apiClient";
import { useAuth } from "@/stores/useAuth";
import type { AnalysisParams } from "@/types/analysis";
import type {
  ConversationDto,
  ConversationInsightSnapshot,
  PipelineResponse,
} from "@/types/api";
import type { ChatMessage, WsChatEvent } from "@/types/chat";
import {
  ANALYSIS_STAGE_ORDER,
  advanceProgressStep,
  applySafeProgressEvent,
  completeProgressSteps,
  createProgressSteps,
  detectTicker,
  setProgressStage,
} from "@/utils/analysisProgress";
import { mergeConversationInsightSnapshot } from "@/utils/insightSnapshot";

interface SessionState {
  sessionId: string;
  conversationId: number | null;
  messages: ChatMessage[];
  thinkingLog: string[];
  streamingText: string;
  citations: string[];
  isStreaming: boolean;
  pipelineLoading: boolean;
  articleCount: number;
  graphRevision: number;
  lastPipeline: PipelineResponse | null;
  insightSnapshot: ConversationInsightSnapshot | null;
  insightUpdateReason: string;
  insightSnapshotIsNew: boolean;
}

const STORAGE_KEY = "stockgraph_session_id";
const CONV_KEY = "stockgraph_conversation_id";
const URL_REGEX = /https?:\/\/[^\s)\]>\"']+/gi;
const SLOW_ANALYSIS_MS = 15_000;
const ANALYSIS_TIMEOUT_MS = 120_000;
const PIPELINE_ANALYSIS_TIMEOUT_MS = 10 * 60_000;
const PROGRESS_TRANSITION_MS = 900;
const PROGRESS_STEP_TRANSITION_MS = 260;

type TurnUiMode = "thinking" | "preparing-data";

function createSessionId() {
  return `st-${Math.random().toString(16).slice(2, 12)}`;
}

function sourceTitleFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    const firstPath = url.pathname.split("/").filter(Boolean)[0];
    return firstPath ? `${host} / ${firstPath}` : host;
  } catch {
    return rawUrl;
  }
}

function fallbackSourcesFromCitations(citations: string[]): ChatMessage["sources"] {
  const out: NonNullable<ChatMessage["sources"]> = [];
  const seen = new Set<string>();
  for (const citation of citations) {
    const text = String(citation || "");
    const urls = text.match(URL_REGEX) ?? [];
    for (const raw of urls) {
      const url = raw.replace(/[.,;:]+$/, "");
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        source_id: `source-${out.length + 1}`,
        title: sourceTitleFromUrl(url),
        source_name: new URL(url).hostname.replace(/^www\./, ""),
        url,
        publication_date: "",
        snippet: "",
        retrieved_text: "",
      });
    }
  }
  return out;
}

function loadConversationId(): number | null {
  const raw = localStorage.getItem(CONV_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

const state = reactive<SessionState>({
  sessionId: localStorage.getItem(STORAGE_KEY) ?? createSessionId(),
  conversationId: loadConversationId(),
  messages: [],
  thinkingLog: [],
  streamingText: "",
  citations: [],
  isStreaming: false,
  pipelineLoading: false,
  articleCount: 0,
  graphRevision: 0,
  lastPipeline: null,
  insightSnapshot: null,
  insightUpdateReason: "",
  insightSnapshotIsNew: false,
});

localStorage.setItem(STORAGE_KEY, state.sessionId);

const socketClient = new ChatSocketClient();
let isConnected = false;
// Raw user text awaiting persistence once the bot's final answer arrives.
let pendingUserText = "";
let activeAssistantMessageId: string | null = null;
let activeTurnId = 0;
let slowAnalysisTimer: ReturnType<typeof setTimeout> | null = null;
let analysisTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let progressTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let progressStepTimer: ReturnType<typeof setTimeout> | null = null;

function createMessageId(role: ChatMessage["role"]): string {
  return `${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function activeAssistantMessage(): ChatMessage | undefined {
  if (!activeAssistantMessageId) return undefined;
  return state.messages.find((message) => message.id === activeAssistantMessageId);
}

function updateThinkingText(text: string) {
  const message = activeAssistantMessage();
  if (message && message.status === "thinking") message.thinkingText = text;
}

function clearTurnTimers() {
  if (slowAnalysisTimer) clearTimeout(slowAnalysisTimer);
  if (analysisTimeoutTimer) clearTimeout(analysisTimeoutTimer);
  if (progressTransitionTimer) clearTimeout(progressTransitionTimer);
  if (progressStepTimer) clearTimeout(progressStepTimer);
  slowAnalysisTimer = null;
  analysisTimeoutTimer = null;
  progressTransitionTimer = null;
  progressStepTimer = null;
}

function scheduleProgressStepAdvance() {
  if (progressStepTimer) clearTimeout(progressStepTimer);
  const message = activeAssistantMessage();
  const active = message?.progressSteps?.find((step) => step.status === "running");
  if (!message?.progressSteps || active?.reportedStatus !== "completed") return;

  progressStepTimer = setTimeout(() => {
    progressStepTimer = null;
    const currentMessage = activeAssistantMessage();
    if (!currentMessage?.progressSteps) return;
    currentMessage.progressSteps = advanceProgressStep(currentMessage.progressSteps);
    scheduleProgressStepAdvance();
  }, PROGRESS_STEP_TRANSITION_MS);
}

function updateProgress(event: WsChatEvent) {
  const message = activeAssistantMessage();
  if (!message?.progressSteps) return;
  message.progressSteps = applySafeProgressEvent(
    message.progressSteps,
    event,
    detectTicker(pendingUserText),
  );
  scheduleProgressStepAdvance();
}

function setStage(
  stage: Parameters<typeof setProgressStage>[1],
  status: Parameters<typeof setProgressStage>[2],
) {
  const message = activeAssistantMessage();
  if (!message?.progressSteps) return;
  message.progressSteps = setProgressStage(
    message.progressSteps,
    stage,
    status,
    detectTicker(pendingUserText),
  );
  scheduleProgressStepAdvance();
}

function completeThrough(stage: Parameters<typeof setProgressStage>[1]) {
  const target = ANALYSIS_STAGE_ORDER.indexOf(stage);
  if (target < 0) return;
  const message = activeAssistantMessage();
  if (!message?.progressSteps) return;
  if (progressStepTimer) clearTimeout(progressStepTimer);
  progressStepTimer = null;
  for (let index = 0; index < target; index += 1) {
    message.progressSteps = setProgressStage(
      message.progressSteps,
      ANALYSIS_STAGE_ORDER[index]!,
      "completed",
      detectTicker(pendingUserText),
    );
    message.progressSteps = advanceProgressStep(message.progressSteps);
  }
}

function armTurnTimers(turnId: number, timeoutMs = ANALYSIS_TIMEOUT_MS) {
  slowAnalysisTimer = setTimeout(() => {
    if (activeTurnId !== turnId || !state.isStreaming) return;
    const message = activeAssistantMessage();
    if (message) {
      message.progressNote =
        "Analisis membutuhkan waktu lebih lama karena sedang menelusuri beberapa sumber.";
    }
  }, SLOW_ANALYSIS_MS);

  analysisTimeoutTimer = setTimeout(() => {
    if (activeTurnId !== turnId || !state.isStreaming) return;
    socketClient.close();
    isConnected = false;
    state.pipelineLoading = false;
    finishTurn(
      "Analisis belum dapat diselesaikan. Silakan coba lagi.",
      "error",
    );
  }, timeoutMs);
}

function beginTurn(
  question: string,
  timeoutMs = ANALYSIS_TIMEOUT_MS,
  uiMode: TurnUiMode = "thinking",
): number {
  state.messages.forEach((message) => {
    if (message.role === "assistant" && message.status === "complete") {
      message.progressVisible = false;
    }
  });
  clearTurnTimers();
  activeTurnId += 1;
  const turnId = activeTurnId;
  state.messages.push({
    id: createMessageId("user"),
    role: "user",
    content: question,
    status: "complete",
  });

  const assistantId = createMessageId("assistant");
  const ticker = detectTicker(question);
  const isPreparingData = uiMode === "preparing-data";
  state.messages.push({
    id: assistantId,
    role: "assistant",
    content: "",
    status: "thinking",
    thinkingText: isPreparingData
      ? "Menyiapkan data laporan keuangan, berita, dan graph..."
      : "StockGraph sedang berpikir...",
    progressTitle: isPreparingData
      ? ticker
        ? `Menyiapkan data ${ticker}`
        : "Menyiapkan data analisis"
      : ticker
        ? `StockGraph sedang menganalisis ${ticker}`
        : "StockGraph sedang menganalisis",
    progressNote: isPreparingData
      ? "StockGraph sedang mengunduh dan memvalidasi sumber sebelum menyusun jawaban."
      : "Menyiapkan konteks dan sumber analisis.",
    progressVisible: isPreparingData,
    progressBarVisible: isPreparingData,
    progressSteps: createProgressSteps(question),
  });

  activeAssistantMessageId = assistantId;
  pendingUserText = question;
  state.thinkingLog = isPreparingData
    ? [
        "Menyiapkan kode saham dan cakupan analisis.",
        "Mengunduh laporan keuangan dan berita relevan satu per satu.",
        "Memvalidasi sumber sebelum data digunakan untuk jawaban.",
      ]
    : [
        "Membaca pertanyaan lanjutan Anda.",
        "Mengambil konteks dari data yang sudah tersedia.",
        "Menyiapkan jawaban berbasis evidence.",
      ];
  state.streamingText = "";
  state.citations = [];
  state.isStreaming = true;
  armTurnTimers(turnId, timeoutMs);
  return turnId;
}

function finishTurn(content: string, status: "complete" | "error", event?: WsChatEvent) {
  const message = activeAssistantMessage();
  if (message) {
    const hadStartedAnswer = message.status === "streaming";
    message.content = content;
    message.status = status;
    message.thinkingText = undefined;

    if (event) {
      const citationFromSources = (event.sources ?? [])
        .map((source) => source.url || source.title)
        .filter(Boolean);
      state.citations = event.citations?.length ? event.citations : citationFromSources;
      const eventSources = event.sources ?? [];
      message.citations = state.citations;
      message.sources = eventSources.length
        ? eventSources
        : fallbackSourcesFromCitations(state.citations);
      message.sourceSnapshotId = state.insightSnapshot?.source_snapshot_id;
    }

    if (status === "complete") {
      message.progressSteps = completeProgressSteps(message.progressSteps ?? []);
      message.progressTitle = "Analisis siap";
      message.progressBarVisible = false;
      message.progressNote = message.sources?.length
        ? "Jawaban telah disusun dari evidence dan sumber yang ditemukan."
        : "Sumber terbatas ditemukan, jawaban disusun berdasarkan evidence yang tersedia.";
      message.progressVisible = true;
      progressTransitionTimer = setTimeout(() => {
        message.progressVisible = false;
      }, hadStartedAnswer ? PROGRESS_TRANSITION_MS : PROGRESS_TRANSITION_MS + 300);
    } else {
      message.progressTitle = "Analisis belum dapat diselesaikan";
      message.progressNote = "Silakan coba kembali setelah beberapa saat.";
      message.progressSteps = (message.progressSteps ?? []).map((step) =>
        step.status === "running" ? { ...step, status: "failed" } : step,
      );
      message.progressVisible = true;
    }
  }

  if (slowAnalysisTimer) clearTimeout(slowAnalysisTimer);
  if (analysisTimeoutTimer) clearTimeout(analysisTimeoutTimer);
  if (progressStepTimer) clearTimeout(progressStepTimer);
  slowAnalysisTimer = null;
  analysisTimeoutTimer = null;
  progressStepTimer = null;
  state.streamingText = content;
  state.isStreaming = false;
  activeAssistantMessageId = null;
  void persistTurn(
    pendingUserText,
    content,
    message?.citations ?? [],
    message?.sources ?? [],
  );
  pendingUserText = "";
}

function setConversationId(id: number | null) {
  state.conversationId = id;
  if (id === null) {
    localStorage.removeItem(CONV_KEY);
  } else {
    localStorage.setItem(CONV_KEY, String(id));
  }
}

async function persistTurn(
  userText: string,
  botText: string,
  citations: string[],
  sources: ChatMessage["sources"],
) {
  if (state.conversationId === null || !userText || !botText) return;
  try {
    await apiClient.logMessages(
      state.conversationId,
      userText,
      botText,
      citations,
      sources,
    );
  } catch (error) {
    console.warn("Gagal menyimpan percakapan ke database:", error);
  }
}

function handleEvent(event: WsChatEvent) {
  if (event.type === "progress") {
    updateProgress(event);
    return;
  }

  if (event.type === "plan") {
    updateProgress(event);
    const text = "Pertanyaan dan konteks analisis berhasil dipahami.";
    state.thinkingLog.push(text);
    updateThinkingText(text);
    return;
  }

  if (event.type === "agent_start") {
    updateProgress(event);
    const text =
      event.agent === "financial"
        ? "Menelusuri laporan keuangan."
        : "Mencari berita yang relevan.";
    state.thinkingLog.push(text);
    updateThinkingText(text);
    return;
  }

  if (event.type === "agent_done") {
    updateProgress(event);
    const text =
      event.agent === "financial"
        ? "Penelusuran laporan keuangan selesai."
        : "Penelusuran berita selesai.";
    state.thinkingLog.push(text);
    updateThinkingText(text);
    return;
  }

  if (event.type === "token") {
    const delta = event.delta ?? "";
    const message = activeAssistantMessage();
    if (message) {
      const isFirstToken = message.status === "thinking";
      completeThrough("answer_generation");
      updateProgress(event);
      message.status = "streaming";
      message.thinkingText = undefined;
      message.content += delta;
      state.streamingText = message.content;
      if (isFirstToken) {
        message.progressTitle = "Analisis siap";
        message.progressNote = "Jawaban mulai ditampilkan.";
        progressTransitionTimer = setTimeout(() => {
          message.progressVisible = false;
        }, PROGRESS_TRANSITION_MS);
      }
    }
    return;
  }

  if (event.type === "final") {
    const finalAnswer = event.answer_markdown ?? event.answer ?? state.streamingText;
    finishTurn(finalAnswer, "complete", event);
    return;
  }

  if (event.type === "error") {
    console.warn("Stream analisis gagal:", event.message);
    finishTurn("Analisis belum dapat diselesaikan. Silakan coba lagi.", "error");
  }
}

function handleSocketError(errorMessage: string) {
  console.warn("Koneksi chat gagal:", errorMessage);
  if (state.isStreaming) {
    finishTurn("Analisis belum dapat diselesaikan. Silakan coba lagi.", "error");
  }
  isConnected = false;
}

async function ensureSocket() {
  if (isConnected && socketClient.isOpen()) return;
  await socketClient.connect(handleEvent, handleSocketError);
  isConnected = true;
}

export function useChatSession() {
  const { state: authState } = useAuth();
  const hasHistory = computed(() => state.messages.length > 0);

  async function ensureConversation(title: string) {
    if (state.conversationId !== null || authState.user === null) return;
    try {
      const convo = await apiClient.createConversation(
        authState.user.id,
        title.slice(0, 255),
      );
      setConversationId(convo.id);
    } catch (error) {
      console.warn("Gagal membuat percakapan:", error);
    }
  }

  async function listConversations(): Promise<ConversationDto[]> {
    if (authState.user === null) return [];
    try {
      return await apiClient.listConversations(authState.user.id);
    } catch {
      return [];
    }
  }

  async function loadConversation(id: number) {
    setConversationId(id);
    state.streamingText = "";
    state.citations = [];
    state.thinkingLog = [];
    state.isStreaming = false;
    state.lastPipeline = null;
    state.insightSnapshot = null;
    state.insightUpdateReason = "";
    state.insightSnapshotIsNew = false;
    state.articleCount = 0;
    state.graphRevision = 0;
    activeAssistantMessageId = null;
    pendingUserText = "";
    activeTurnId += 1;
    clearTurnTimers();
    try {
      const rows = await apiClient.listMessages(id);
      state.messages = rows.map((row) => ({
        id: `persisted-${row.id}`,
        role: row.sender === "user" ? "user" : "assistant",
        content: row.message,
        status: "complete",
        citations: row.citations ?? [],
        sources: row.sources ?? [],
      }));
    } catch (error) {
      console.warn("Gagal memuat pesan percakapan:", error);
      state.messages = [];
    }
  }

  function newChat() {
    setConversationId(null);
    state.messages = [];
    state.thinkingLog = [];
    state.streamingText = "";
    state.citations = [];
    state.isStreaming = false;
    state.lastPipeline = null;
    state.insightSnapshot = null;
    state.insightUpdateReason = "";
    state.insightSnapshotIsNew = false;
    state.articleCount = 0;
    state.graphRevision = 0;
    activeAssistantMessageId = null;
    pendingUserText = "";
    activeTurnId += 1;
    clearTurnTimers();
    if (isConnected) {
      try {
        socketClient.send({ session_id: state.sessionId, reset: true });
      } catch {
        /* socket not ready — nothing to reset */
      }
    }
  }

  async function streamQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || state.isStreaming) return;
    const turnId = beginTurn(trimmed);

    try {
      await ensureSocket();
      if (activeTurnId !== turnId || !state.isStreaming) return;
      socketClient.send({ session_id: state.sessionId, question: trimmed });
    } catch (error) {
      if (state.isStreaming) {
        console.warn("Gagal memulai stream chat:", error);
        finishTurn("Analisis belum dapat diselesaikan. Silakan coba lagi.", "error");
      }
    }
  }

  async function resetChat() {
    try {
      await apiClient.clearHistory(state.sessionId);
    } catch {
      /* ignore — engine history is best-effort */
    }
    newChat();
  }

  async function runAnalysis(params: AnalysisParams) {
    const cleanedQuestion = params.question.trim();
    if (!cleanedQuestion || !params.stockCodes.length || state.isStreaming) return;

    const fullQuestion = `[${params.stockCodes.join(", ")}] ${cleanedQuestion}`;
    const turnId = beginTurn(fullQuestion, PIPELINE_ANALYSIS_TIMEOUT_MS, "preparing-data");
    state.pipelineLoading = true;
    state.streamingText = "";
    setStage("question_understanding", "completed");
    setStage("entity_resolution", "completed");
    setStage("financial_retrieval", "running");
    setStage("news_retrieval", "running");
    try {
      await ensureConversation(fullQuestion);
      if (activeTurnId !== turnId || !state.isStreaming) return;
      // Building/refreshing the graph is best-effort: when FalkorDB or the
      // crawler is unavailable we still proceed to stream an answer.
      try {
        const pipeline = await apiClient.runPipeline({
          stock_codes: params.stockCodes,
          question: cleanedQuestion,
          max_articles: params.maxArticles,
          threshold: params.threshold,
          try_idx_pdf: true,
        });
        if (activeTurnId !== turnId || !state.isStreaming) return;
        state.lastPipeline = pipeline;
        const incomingSnapshot = pipeline.insight_snapshot;
        const insightUpdate = mergeConversationInsightSnapshot(
          state.insightSnapshot,
          incomingSnapshot,
          String(state.conversationId ?? state.sessionId),
        );
        state.insightSnapshot = insightUpdate.snapshot;
        state.insightSnapshotIsNew = insightUpdate.isNew;
        state.insightUpdateReason = insightUpdate.reason;
        state.articleCount = params.stockCodes.reduce(
          (total, code) => total + (pipeline.articles_count?.[code] ?? 0),
          0,
        );
        state.graphRevision += 1;
        setStage("financial_retrieval", "completed");
        setStage("news_retrieval", "completed");
        setStage("graph_traversal", "completed");
        setStage("relevance_validation", "completed");
      } catch (error) {
        console.warn("Pipeline gagal (lanjut ke streaming):", error);
        state.lastPipeline = null;
        const message = activeAssistantMessage();
        if (message) {
          message.progressNote =
            "Sumber awal terbatas, melanjutkan penelusuran melalui GraphRAG.";
        }
      }
      if (activeTurnId !== turnId || !state.isStreaming) return;
      updateThinkingText("StockGraph sedang berpikir...");
      await ensureSocket();
      if (activeTurnId !== turnId || !state.isStreaming) return;
      socketClient.send({ session_id: state.sessionId, question: fullQuestion });
    } catch (error) {
      if (state.isStreaming) {
        console.warn("Gagal memulai analisis:", error);
        finishTurn("Analisis belum dapat diselesaikan. Silakan coba lagi.", "error");
      }
    } finally {
      if (activeTurnId === turnId) state.pipelineLoading = false;
    }
  }

  return {
    state,
    hasHistory,
    listConversations,
    loadConversation,
    newChat,
    streamQuestion,
    resetChat,
    runAnalysis,
  };
}
