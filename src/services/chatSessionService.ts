import { apiClient } from "@/services/apiClient";
import type { PipelineRequest, PipelineResponse } from "@/types/api";
import type { ChatMessage } from "@/types/chat";

interface ChatHistoryResponse {
  session_id: string;
  turns: ChatMessage[];
}

export const chatSessionService = {
  runPipeline: (payload: PipelineRequest): Promise<PipelineResponse> => apiClient.runPipeline(payload),
  getHistory: (sessionId: string): Promise<ChatHistoryResponse> => apiClient.getHistory(sessionId),
  clearHistory: (sessionId: string): Promise<{ cleared: string }> => apiClient.clearHistory(sessionId),
};
