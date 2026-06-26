import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { DEFAULT_STOCK_CODE } from "@/constants/stocks";
import {
  ANALYSIS_PLACEHOLDER,
  DEFAULT_FOLLOW_UP_PLACEHOLDER,
  SOURCE_BADGES,
} from "@/constants/result";
import { useChatSession } from "@/stores/useChatSession";
import type { ChatMessage } from "@/types/chat";

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseNumberQuery(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStockCodes(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2,6}$/.test(code));
}

export function extractBracketedStockCodes(value: string): string[] {
  const match = value.match(/^\s*\[([A-Z,\s]{2,64})\]/i);
  return match?.[1] ? normalizeStockCodes(match[1]) : [];
}

export function resolveConversationStockCodes(
  messages: Pick<ChatMessage, "role" | "content">[],
  fallback: string[],
): string[] {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const codes = extractBracketedStockCodes(message.content);
    if (codes.length) return codes;
  }
  return fallback;
}

export function buildFollowUpPrompt(question: string, stockCodes: string[]): string {
  const cleaned = question.trim();
  if (!cleaned || extractBracketedStockCodes(cleaned).length) return cleaned;
  if (!stockCodes.length) return cleaned;
  return `[${stockCodes.join(", ")}] ${cleaned}`;
}

export function useResultAnalysis() {
  const route = useRoute();
  const followUpQuestion = ref("");
  const { state, streamQuestion, runAnalysis } = useChatSession();

  const routeStockCodes = computed(() =>
    normalizeStockCodes(String(route.query.code ?? DEFAULT_STOCK_CODE)),
  );
  const stockCodes = computed(() =>
    resolveConversationStockCodes(state.messages, routeStockCodes.value),
  );
  const question = computed(() => String(route.query.question ?? ""));
  const maxArticles = ref(parseNumberQuery(route.query.maxArticles, 5));
  const threshold = ref(parseNumberQuery(route.query.threshold, 0.5));

  const latestAnswer = computed(() => {
    if (state.isStreaming && state.streamingText) return `${state.streamingText}|`;
    if (state.streamingText) return state.streamingText;
    const assistant = [...state.messages].reverse().find((message) => message.role === "assistant");
    return assistant?.content ?? ANALYSIS_PLACEHOLDER;
  });

  const analysisPoints = computed(() => {
    const cleaned = latestAnswer.value.replace(/\|$/, "").trim();
    if (!cleaned) return [ANALYSIS_PLACEHOLDER];

    const numberedParts = cleaned
      .split(/(?=\d+\.\s+)/)
      .map((part) => part.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);

    if (numberedParts.length > 1) return numberedParts;

    const lines = cleaned
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.length ? lines : [cleaned];
  });

  const maxArticlesModel = computed({
    get: () => maxArticles.value,
    set: (value: number) => {
      maxArticles.value = clampInt(value, 1, 10, 1);
    },
  });

  const thresholdSliderModel = computed({
    get: () => Math.round(threshold.value * 10),
    set: (value: number) => {
      const clamped = clampInt(value, 0, 10, 0);
      threshold.value = Number((clamped / 10).toFixed(2));
    },
  });

  async function rerunAnalysis() {
    await runAnalysis({
      stockCodes: stockCodes.value,
      question: question.value,
      maxArticles: maxArticles.value,
      threshold: threshold.value,
    });
  }

  async function submitFollowUp() {
    if (!followUpQuestion.value.trim() || state.pipelineLoading || state.isStreaming) return;
    const nextQuestion = followUpQuestion.value;
    followUpQuestion.value = "";
    await streamQuestion(buildFollowUpPrompt(nextQuestion, stockCodes.value));
  }

  async function initializeResult() {
    // Coming from Home (or a refresh while busy): a run is already in flight or
    // messages are present — don't kick off a duplicate analysis.
    if (state.pipelineLoading || state.isStreaming || state.messages.length) return;
    // Direct navigation / hard refresh with a question in the URL: run it.
    if (question.value) {
      await rerunAnalysis();
    }
  }

  onMounted(initializeResult);

  return {
    state,
    sourceBadges: SOURCE_BADGES,
    followUpQuestion,
    stockCodes,
    question,
    analysisPoints,
    maxArticlesModel,
    thresholdSliderModel,
    defaultFollowUpPlaceholder: DEFAULT_FOLLOW_UP_PLACEHOLDER,
    submitFollowUp,
    rerunAnalysis,
  };
}
