export interface SourceItem {
  source_id: string;
  source_type?: "news" | "financial_report" | string;
  title: string;
  source_name: string;
  url: string;
  publication_date: string;
  reporting_period?: string;
  snippet: string;
  retrieved_text: string;
}

export type AnalysisStage =
  | "question_understanding"
  | "entity_resolution"
  | "financial_retrieval"
  | "news_retrieval"
  | "graph_traversal"
  | "relevance_validation"
  | "answer_generation"
  | "citation_preparation"
  | "completed"
  | "failed";

export type AnalysisProgressStatus = "pending" | "running" | "completed" | "failed";

export interface AnalysisProgressStep {
  stage: AnalysisStage;
  status: AnalysisProgressStatus;
  reportedStatus?: AnalysisProgressStatus;
  label: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "thinking" | "streaming" | "complete" | "error";
  thinkingText?: string;
  progressTitle?: string;
  progressNote?: string;
  progressVisible?: boolean;
  progressSteps?: AnalysisProgressStep[];
  sourceSnapshotId?: string;
  citations?: string[];
  sources?: SourceItem[];
}

export interface WsChatEvent {
  type:
    | "progress"
    | "plan"
    | "agent_start"
    | "agent_done"
    | "token"
    | "final"
    | "error"
    | "history_cleared";
  stage?: AnalysisStage;
  status?: AnalysisProgressStatus;
  label?: string;
  agents?: string[];
  year?: number;
  agent?: string;
  preview?: string;
  delta?: string;
  answer?: string;
  answer_markdown?: string;
  citations?: string[];
  sources?: SourceItem[];
  message?: string;
}
