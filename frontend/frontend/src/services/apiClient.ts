import type {
  ApiEnvelope,
  AuthUser,
  ConversationDto,
  GraphExploreResponse,
  KeyFinancialsResponse,
  MessageDto,
  PipelineRequest,
  PipelineResponse,
  QueryResponse,
  YearResponse,
} from "@/types/api";
import type { ChatMessage } from "@/types/chat";
import { getSupabaseAccessToken } from "@/services/supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getSupabaseAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    // Backend errors are JSON: { success, message, code }. Surface `message`.
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body?.message ?? body?.detail ?? message;
    } catch {
      /* non-JSON error body — keep statusText */
    }
    throw new Error(message || `API ${response.status}`);
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/** Unwrap the standard { success, message, data } envelope used by CRUD routes. */
async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  const env = await request<ApiEnvelope<T>>(path, init);
  if (!env.success || env.data === null || env.data === undefined) {
    throw new Error(env.message || "Permintaan gagal.");
  }
  return env.data;
}

export const apiClient = {
  // ── Auth (PostgreSQL) ──────────────────────────────────────────────────
  getMe: () => requestData<AuthUser>("/api/v1/users/me"),
  updateMe: (name: string) =>
    requestData<AuthUser>("/api/v1/users/me", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  // ── Conversations + messages (PostgreSQL) ──────────────────────────────
  createConversation: (_userId: number, title: string | null) =>
    requestData<ConversationDto>("/api/v1/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  listConversations: (userId: number) =>
    requestData<ConversationDto[]>(`/api/v1/conversations/users/${userId}`),
  listMessages: (conversationId: number) =>
    requestData<MessageDto[]>(`/api/v1/conversations/${conversationId}/messages`),
  logMessages: (conversationId: number, userMessage: string, botMessage: string) =>
    requestData<{ user_message: MessageDto; bot_message: MessageDto }>(
      `/api/v1/conversations/${conversationId}/messages/log`,
      {
        method: "POST",
        body: JSON.stringify({ user_message: userMessage, bot_message: botMessage }),
      },
    ),

  // ── GraphRAG engine ────────────────────────────────────────────────────
  getYears: () => request<YearResponse>("/api/years"),
  exploreGraph: (
    stockCodes: string[],
    options: { year?: number; nodeId?: string; depth?: number; limit?: number } = {},
  ) => {
    const params = new URLSearchParams();
    if (stockCodes.length) params.set("stock_codes", stockCodes.join(","));
    if (options.year) params.set("year", String(options.year));
    if (options.nodeId) params.set("node_id", options.nodeId);
    params.set("depth", String(options.depth ?? 2));
    params.set("limit", String(options.limit ?? 140));
    return request<GraphExploreResponse>(`/api/graph/explore?${params.toString()}`);
  },
  runPipeline: (payload: PipelineRequest) =>
    request<PipelineResponse>("/api/merger/pipeline", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  queryGraph: (question: string, year?: number) =>
    request<QueryResponse>("/api/query", {
      method: "POST",
      body: JSON.stringify({ question, year }),
    }),
  getKeyFinancials: (stockCode: string, useLlm = true) =>
    request<KeyFinancialsResponse>(
      `/api/key-financials/${encodeURIComponent(stockCode)}?use_llm=${useLlm ? "true" : "false"}`,
    ),
  getHistory: (sessionId: string) =>
    request<{ session_id: string; turns: ChatMessage[] }>(`/api/history/${sessionId}`),
  clearHistory: (sessionId: string) =>
    request<{ cleared: string }>(`/api/history/${sessionId}`, { method: "DELETE" }),
};
