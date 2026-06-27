import type {
  ConversationInsightSnapshot,
  InsightEntity,
} from "@/types/api";

const VALID_ENTITY_TYPES = new Set([
  "stock",
  "organization",
  "company",
  "person",
  "policy",
  "event",
  "topic",
  "financial",
]);

export function isDisplayableInsightEntity(entity: InsightEntity): boolean {
  const label = entity.label.trim();
  if (!label || !entity.source_ids.length || !VALID_ENTITY_TYPES.has(entity.type)) {
    return false;
  }
  if (
    /(^|\s)(site:|inurl:|intitle:|filetype:|https?:\/\/|www\.)/i.test(label)
    || /\.(com|co\.id|id|net|org)(\/|\s|$)/i.test(label)
  ) {
    return false;
  }
  return ![
    "analisis",
    "berita terbaru",
    "risiko investasi",
  ].includes(label.toLocaleLowerCase("id-ID"));
}

export function mergeConversationInsightSnapshot(
  current: ConversationInsightSnapshot | null,
  incoming: ConversationInsightSnapshot,
  conversationId: string,
): {
  snapshot: ConversationInsightSnapshot;
  changed: boolean;
  isNew: boolean;
  reason: string;
} {
  const normalizedIncoming = {
    ...incoming,
    conversation_id: conversationId,
    entities: incoming.entities.filter(isDisplayableInsightEntity),
  };
  if (
    current
    && current.ticker === normalizedIncoming.ticker
    && current.source_snapshot_id === normalizedIncoming.source_snapshot_id
  ) {
    return {
      snapshot: current,
      changed: false,
      isNew: false,
      reason: "Menggunakan snapshot sumber yang sama untuk conversation ini",
    };
  }

  const newSourceCount = current
    ? normalizedIncoming.source_ids.filter(
        (sourceId) => !current.source_ids.includes(sourceId),
      ).length
    : normalizedIncoming.source_count;
  return {
    snapshot: normalizedIncoming,
    changed: true,
    isNew: Boolean(current),
    reason: current
      ? newSourceCount > 0
        ? `Diperbarui karena ${newSourceCount} sumber baru ditemukan`
        : "Diperbarui karena scope analisis berubah"
      : "Snapshot insight dibuat dari evidence tervalidasi",
  };
}
