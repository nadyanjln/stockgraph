import { describe, expect, it } from "vitest";
import type { ConversationInsightSnapshot } from "@/types/api";
import {
  isDisplayableInsightEntity,
  mergeConversationInsightSnapshot,
} from "@/utils/insightSnapshot";

function snapshot(
  id: string,
  sentiment: ConversationInsightSnapshot["sentiment"] = "neutral",
): ConversationInsightSnapshot {
  return {
    conversation_id: "",
    ticker: "BRPT",
    sentiment,
    sentiment_score: 0,
    sentiment_reason: "Berdasarkan evidence tervalidasi.",
    source_snapshot_id: id,
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
    graph_node_count: 4,
    graph_relation_count: 3,
    generated_at: "2026-06-25T10:00:00Z",
    updated_at: "2026-06-25T10:00:00Z",
  };
}

describe("conversation insight snapshot", () => {
  it("keeps the existing sentiment when the source snapshot is unchanged", () => {
    const current = snapshot("same", "positive");
    const incoming = {
      ...snapshot("same", "negative"),
      updated_at: "2026-06-25T11:00:00Z",
    };
    const result = mergeConversationInsightSnapshot(current, incoming, "conversation-1");

    expect(result.changed).toBe(false);
    expect(result.snapshot.sentiment).toBe("positive");
    expect(result.snapshot.updated_at).toBe("2026-06-25T10:00:00Z");
    expect(result.reason).toContain("snapshot sumber yang sama");
  });

  it("updates sentiment and reason only when the source snapshot changes", () => {
    const current = snapshot("old", "positive");
    const incoming = {
      ...snapshot("new", "negative"),
      source_ids: ["article:1", "article:2", "article:3"],
      source_count: 3,
    };
    const result = mergeConversationInsightSnapshot(current, incoming, "conversation-1");

    expect(result.changed).toBe(true);
    expect(result.isNew).toBe(true);
    expect(result.snapshot.sentiment).toBe("negative");
    expect(result.reason).toBe("Diperbarui karena 1 sumber baru ditemukan");
  });

  it("creates a new conversation insight when ticker changes", () => {
    const result = mergeConversationInsightSnapshot(
      snapshot("brpt"),
      { ...snapshot("bbca"), ticker: "BBCA" },
      "conversation-2",
    );
    expect(result.changed).toBe(true);
    expect(result.snapshot.ticker).toBe("BBCA");
    expect(result.snapshot.conversation_id).toBe("conversation-2");
  });

  it("rejects search queries, URLs, domains, and entities without evidence", () => {
    const invalidLabels = [
      "site:kompas.com",
      "https://example.com/article",
      "cnnindonesia.com",
      "analisis",
      "berita terbaru",
    ];
    for (const label of invalidLabels) {
      expect(
        isDisplayableInsightEntity({
          id: label,
          label,
          type: "topic",
          source_ids: ["article:1"],
        }),
      ).toBe(false);
    }
    expect(
      isDisplayableInsightEntity({
        id: "brpt",
        label: "BRPT",
        type: "stock",
        source_ids: [],
      }),
    ).toBe(false);
  });
});
