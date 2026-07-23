export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  email: string;
  avatar_url: string | null;
  provider: string;
  is_verified: boolean;
  created_at: string;
}

export interface ConversationDto {
  id: number;
  user_id: number;
  title: string | null;
  created_at: string;
}

export interface MessageDto {
  id: number;
  conversation_id: number;
  sender: "user" | "bot";
  message: string;
  citations: string[];
  sources: SourceItem[];
  created_at: string;
}

export interface PipelineRequest {
  stock_codes: string[];
  question: string;
  max_articles: number;
  threshold: number;
  try_idx_pdf: boolean;
}

export type InsightSentiment =
  | "positive"
  | "neutral"
  | "negative"
  | "mixed"
  | "insufficient_data";

export interface InsightEntity {
  id: string;
  label: string;
  type: string;
  source_ids: string[];
}

export interface ConversationInsightSnapshot {
  conversation_id: string;
  ticker: string;
  company_name?: string;
  sentiment: InsightSentiment;
  sentiment_score?: number | null;
  sentiment_reason: string;
  sentiment_breakdown?: {
    positive?: number;
    neutral?: number;
    negative?: number;
  };
  sentiment_counts?: {
    positive?: number;
    neutral?: number;
    negative?: number;
  };
  positive_news_count?: number;
  neutral_news_count?: number;
  negative_news_count?: number;
  source_snapshot_id: string;
  source_count: number;
  news_source_count: number;
  financial_report_count: number;
  source_ids: string[];
  entities: InsightEntity[];
  entity_ids: string[];
  graph_node_count: number;
  graph_relation_count: number;
  period_start?: string | null;
  period_end?: string | null;
  generated_at: string;
  updated_at: string;
}

export interface PipelineResponse {
  keywords: Record<string, string[]>;
  articles_count: Record<string, number>;
  financial_count: number;
  insight_snapshot: ConversationInsightSnapshot;
  graphs_built: Array<{
    year: number;
    graph_name: string;
    nodes_created: number;
    edges_created: number;
    errors: string[];
  }>;
}

export interface YearResponse {
  years: number[];
  default: number | null;
}

export interface QueryResponse {
  question: string;
  answer: string;
  answer_markdown?: string;
  sources?: SourceItem[];
  year: number;
  citations: string[];
  context: unknown;
}

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

export interface KeyFinancialColumnDto {
  label: string;
  period: string;
  year: number;
}

export interface KeyFinancialRowDto {
  label: string;
  values: Array<number | null>;
  formatted: string[];
}

export interface KeyFinancialsResponse {
  stock_code: string;
  company_name: string;
  source: string;
  generated_at: string;
  columns: KeyFinancialColumnDto[];
  rows: KeyFinancialRowDto[];
}

export type GraphNodeKind =
  | "stock"
  | "company"
  | "person"
  | "topic"
  | "financial"
  | "year"
  | "article";

export interface GraphArticleDto {
  id: string;
  title: string;
  publisher: string;
  publication_date: string;
  url: string;
  summary: string;
  stock_codes: string[];
  entity_ids: string[];
  relationship_ids: string[];
  year: number;
}

export interface GraphNodeDto {
  id: string;
  label: string;
  type: GraphNodeKind;
  description: string;
  stock_codes: string[];
  source_ids: string[];
  degree: number;
  source_count: number;
}

export interface GraphEdgeDto {
  id: string;
  source: string;
  target: string;
  type: string;
  description: string;
  source_ids: string[];
}

export interface GraphRankItemDto {
  id: string;
  label: string;
  count: number;
}

export interface GraphExploreResponse {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  articles: GraphArticleDto[];
  analytics: {
    node_count: number;
    relationship_count: number;
    article_count: number;
    most_connected: GraphRankItemDto[];
    most_cited: GraphRankItemDto[];
  };
}
