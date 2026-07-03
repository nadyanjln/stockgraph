<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppLeftSidebar from "@/components/common/AppLeftSidebar.vue";
import AppMessageComposer from "@/components/common/AppMessageComposer.vue";
import AnalysisProgress from "@/components/chat/AnalysisProgress.vue";
import CitationSourceCard from "@/components/citation/CitationSourceCard.vue";
import SourceDetailModal from "@/components/citation/SourceDetailModal.vue";
import KnowledgeGraphExplorer from "@/components/graph/KnowledgeGraphExplorer.vue";
import { useResultAnalysis } from "@/composables/useResultAnalysis";
import { apiClient } from "@/services/apiClient";
import { useSidebar } from "@/stores/useSidebar";
import type { KeyFinancialsResponse } from "@/types/api";
import type { SourceItem } from "@/types/chat";
import { renderMarkdownToHtml } from "@/utils/markdown";
import { isDisplayableInsightEntity } from "@/utils/insightSnapshot";

const { sidebarWidth } = useSidebar();
const sidebarDrawerOpen = ref(false);
const insightDrawerOpen = ref(false);
const {
  state,
  followUpQuestion,
  stockCodes,
  maxArticlesModel,
  thresholdSliderModel,
  defaultFollowUpPlaceholder,
  submitFollowUp,
  rerunAnalysis,
} = useResultAnalysis();

const markdown = (value: string, sourceCount = 0) =>
  renderMarkdownToHtml(value, sourceCount);

interface ActiveCitation {
  messageId: string;
  sourceIndex: number;
}

const activeCitation = ref<ActiveCitation | null>(null);

const activeCitationSource = computed<SourceItem | null>(() => {
  const active = activeCitation.value;
  if (!active) return null;
  const message = state.messages.find((item) => item.id === active.messageId);
  return message?.sources?.[active.sourceIndex - 1] ?? null;
});

function openCitation(messageId: string, sourceIndex: number) {
  activeCitation.value = { messageId, sourceIndex };
}

function handleCitationClick(event: MouseEvent, messageId: string) {
  const target = event.target as HTMLElement | null;
  const citation = target?.closest<HTMLElement>("[data-citation]");
  if (!citation) return;
  event.preventDefault();
  event.stopPropagation();
  openCitation(messageId, Number(citation.dataset.citation));
}

function openSourceFromList(messageId: string, sourceIndex: number) {
  openCitation(messageId, sourceIndex);
}

function closeCitation() {
  activeCitation.value = null;
}

function openSidebarDrawer() {
  sidebarDrawerOpen.value = true;
  insightDrawerOpen.value = false;
}

function closeSidebarDrawer() {
  sidebarDrawerOpen.value = false;
}

function openInsightDrawer() {
  insightDrawerOpen.value = true;
  sidebarDrawerOpen.value = false;
}

function closeInsightDrawer() {
  insightDrawerOpen.value = false;
}

function handleResponsiveEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  closeSidebarDrawer();
  closeInsightDrawer();
}

const sentimentLabel = computed(() => {
  const snapshot = state.insightSnapshot;
  if (!snapshot) return state.pipelineLoading ? "Memuat" : "Belum Tersedia";
  if (snapshot.news_source_count <= 0) return "Belum Tersedia";
  const labels = {
    positive: "Cenderung Positif",
    neutral: "Netral",
    negative: "Cenderung Negatif",
    mixed: "Sentimen Beragam",
    insufficient_data: "Belum Cukup Data",
  } as const;
  return labels[snapshot.sentiment];
});

const shouldShowSentimentBadge = computed(() => {
  const snapshot = state.insightSnapshot;
  if (!snapshot) return !state.pipelineLoading;
  if (snapshot.news_source_count <= 0 && snapshot.financial_report_count > 0) return false;
  return true;
});

const sentimentClass = computed(() => {
  const sentiment = state.insightSnapshot?.sentiment;
  if (sentiment === "positive") return "sentiment-pill positive";
  if (sentiment === "negative") return "sentiment-pill negative";
  if (sentiment === "mixed") return "sentiment-pill mixed";
  if (sentiment === "insufficient_data" || sentimentLabel.value === "Belum Tersedia") {
    return "sentiment-pill limited";
  }
  return "sentiment-pill neutral";
});

type SentimentBreakdown = {
  positive: number;
  neutral: number;
  negative: number;
};

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

const sentimentBreakdown = computed<SentimentBreakdown | null>(() => {
  const snapshot = state.insightSnapshot;
  if (!snapshot) return null;
  const source = snapshot.sentiment_breakdown ?? snapshot.sentiment_counts;
  const positive = finiteCount(source?.positive ?? snapshot.positive_news_count);
  const neutral = finiteCount(source?.neutral ?? snapshot.neutral_news_count);
  const negative = finiteCount(source?.negative ?? snapshot.negative_news_count);
  if (positive === null || neutral === null || negative === null) return null;
  return { positive, neutral, negative };
});

const sentimentTooltip =
  "Sentimen dihitung dari berita relevan. Laporan keuangan digunakan sebagai konteks fundamental.";

function uniqueByOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const cleaned = item.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }
  return output;
}

const topEntities = computed(() => {
  const entities = state.insightSnapshot?.entities ?? [];
  return uniqueByOrder(
    entities
      .filter(isDisplayableInsightEntity)
      .map((entity) => entity.label),
  ).slice(0, 6);
});

const topEntitiesText = computed(() => {
  if (!topEntities.value.length) return "-";
  return topEntities.value.join(", ");
});

const nodeGraphCount = computed(() => {
  return state.insightSnapshot?.graph_node_count ?? 0;
});

const relationGraphCount = computed(() => {
  return state.insightSnapshot?.graph_relation_count ?? 0;
});

const insightSourceBasis = computed(() => {
  const snapshot = state.insightSnapshot;
  if (!snapshot) return "Insight menunggu berita relevan yang tervalidasi.";
  const newsCount = snapshot.news_source_count;
  const reportCount = snapshot.financial_report_count;
  if (newsCount <= 0 && reportCount > 0) {
    return "Data berita belum tersedia. Laporan keuangan tetap digunakan sebagai konteks fundamental.";
  }
  if (newsCount <= 0) return "Belum ada berita relevan yang dapat dianalisis.";
  if (snapshot.sentiment === "insufficient_data") {
    return `${newsCount} berita relevan ditemukan, belum cukup untuk menyimpulkan sentimen berita.`;
  }
  if (snapshot.sentiment === "mixed") {
    return `Sinyal positif dan negatif dari ${newsCount} berita relevan relatif berimbang.`;
  }
  if (snapshot.sentiment === "positive") {
    return `Sinyal positif lebih dominan dari ${newsCount} berita relevan.`;
  }
  if (snapshot.sentiment === "negative") {
    return `Sinyal negatif lebih dominan dari ${newsCount} berita relevan.`;
  }
  return `Mayoritas dari ${newsCount} berita relevan bersifat faktual atau netral.`;
});

const sentimentContextLine = computed(() => {
  const snapshot = state.insightSnapshot;
  if (!snapshot) return "";
  const newsCount = snapshot.news_source_count;
  const reportCount = snapshot.financial_report_count;
  const parts: string[] = [];
  if (newsCount > 0) parts.push(`${newsCount} berita dianalisis`);
  if (reportCount > 0) {
    parts.push(`${reportCount} laporan keuangan digunakan sebagai konteks fundamental`);
  }
  return parts.join(" · ");
});

const insightUpdatedAt = computed(() => {
  const value = state.insightSnapshot?.updated_at;
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
});

type ThreeNode = {
  label: string;
  kind: "stock" | "entity" | "year";
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
};

type ThreeEdge = { a: number; b: number; relation: string };

function seeded(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

const graph3dData = computed<{ nodes: ThreeNode[]; edges: ThreeEdge[] }>(() => {
  const stockLabels = uniqueByOrder(stockCodes.value.map((code) => code.toUpperCase())).slice(0, 6);
  const entityLabels = uniqueByOrder(topEntities.value).slice(0, 8);
  const yearLabels = uniqueByOrder((state.lastPipeline?.graphs_built ?? []).map((g) => String(g.year))).slice(
    0,
    2,
  );

  const labels = uniqueByOrder([...stockLabels, ...entityLabels, ...yearLabels]).slice(0, 16);
  const stockSet = new Set(stockLabels.map((item) => item.toLowerCase()));
  const yearSet = new Set(yearLabels.map((item) => item.toLowerCase()));

  const nodeLabels = labels.length ? labels : ["StockGraph"];
  const nodes = nodeLabels.map((label) => {
    const theta = seeded(`${label}-theta`) * Math.PI * 2;
    const phi = seeded(`${label}-phi`) * Math.PI;
    const r = 95 + seeded(`${label}-radius`) * 35;
    const low = label.toLowerCase();
    const kind = stockSet.has(low) ? "stock" : yearSet.has(low) ? "year" : "entity";
    return {
      label,
      kind,
      x: Math.cos(theta) * Math.sin(phi) * r,
      y: Math.sin(theta) * Math.sin(phi) * r * 0.72,
      z: Math.cos(phi) * r,
      radius: 3.2 + seeded(`${label}-size`) * 2.6,
      color: kind === "stock" ? "#67b8ff" : kind === "year" ? "#7de1be" : "#c7d5ee",
    } satisfies ThreeNode;
  });

  const labelToIndex = new Map<string, number>();
  nodes.forEach((node, index) => labelToIndex.set(node.label, index));

  const stockIndices = stockLabels
    .map((label) => labelToIndex.get(label))
    .filter((value): value is number => typeof value === "number");
  const entityIndices = entityLabels
    .map((label) => labelToIndex.get(label))
    .filter((value): value is number => typeof value === "number");
  const yearIndices = yearLabels
    .map((label) => labelToIndex.get(label))
    .filter((value): value is number => typeof value === "number");

  const edges: ThreeEdge[] = [];
  const edgeSet = new Set<string>();

  function addEdge(a: number, b: number, relation: string) {
    if (a === b) return;
    const key = a < b ? `${a}-${b}-${relation}` : `${b}-${a}-${relation}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ a, b, relation });
  }

  if (stockIndices.length > 1) {
    for (let i = 1; i < stockIndices.length; i += 1) {
      addEdge(stockIndices[i - 1]!, stockIndices[i]!, "KORELASI");
    }
  }

  if (!stockIndices.length && nodes.length > 1) {
    for (let i = 1; i < nodes.length; i += 1) {
      addEdge(i - 1, i, "TERHUBUNG");
    }
  }

  if (stockIndices.length) {
    for (let i = 0; i < entityIndices.length; i += 1) {
      const stockTarget = stockIndices[i % stockIndices.length];
      addEdge(entityIndices[i]!, stockTarget!, "TERKAIT_DENGAN");
      if (i > 0) addEdge(entityIndices[i - 1]!, entityIndices[i]!, "KO_MENTION");
    }

    for (const yearIndex of yearIndices) {
      for (const stockIndex of stockIndices) {
        addEdge(yearIndex, stockIndex, "PERIODE");
      }
    }
  }

  return { nodes, edges };
});

const graphNodeLegend = computed(() => [
  { kind: "stock", label: "Emiten / Kode Saham", color: "#67b8ff" },
  { kind: "entity", label: "Entitas Utama (berita/isu)", color: "#c7d5ee" },
  { kind: "year", label: "Tahun Graph Pipeline", color: "#7de1be" },
]);

const graphRelationLegend = computed(() => {
  const freq = new Map<string, number>();
  for (const edge of graph3dData.value.edges) {
    freq.set(edge.relation, (freq.get(edge.relation) ?? 0) + 1);
  }
  return [...freq.entries()].map(([relation, count]) => ({ relation, count }));
});

const graphCanvasRef = ref<HTMLCanvasElement | null>(null);
let graphAnimationFrame = 0;
let isDraggingGraph = false;
let lastPointerX = 0;
let lastPointerY = 0;
let userRotationX = 0;
let userRotationY = 0;
let velocityX = 0;
let velocityY = 0;
let zoomScale = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resizeGraphCanvas() {
  const canvas = graphCanvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

function draw3dGraph(time: number) {
  const canvas = graphCanvasRef.value;
  if (!canvas) {
    graphAnimationFrame = window.requestAnimationFrame(draw3dGraph);
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    graphAnimationFrame = window.requestAnimationFrame(draw3dGraph);
    return;
  }

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const baseAngleY = time * 0.00022;
  const baseAngleX = time * 0.00012;
  if (!isDraggingGraph) {
    userRotationX += velocityX;
    userRotationY += velocityY;
    velocityX *= 0.93;
    velocityY *= 0.93;
  }
  userRotationX = clamp(userRotationX, -1.1, 1.1);

  const angleY = baseAngleY + userRotationY;
  const angleX = baseAngleX + userRotationX;
  const sinY = Math.sin(angleY);
  const cosY = Math.cos(angleY);
  const sinX = Math.sin(angleX);
  const cosX = Math.cos(angleX);
  const camera = 280 * zoomScale;

  const projected = graph3dData.value.nodes.map((node) => {
    const x1 = node.x * cosY - node.z * sinY;
    const z1 = node.x * sinY + node.z * cosY;
    const y1 = node.y * cosX - z1 * sinX;
    const z2 = node.y * sinX + z1 * cosX;
    const scale = camera / (camera + z2 + 180);

    return {
      ...node,
      px: width * 0.5 + x1 * scale,
      py: height * 0.52 + y1 * scale,
      scale,
      depth: z2,
    };
  });

  ctx.lineWidth = 1;
  for (const edge of graph3dData.value.edges) {
    const a = projected[edge.a];
    const b = projected[edge.b];
    if (!a || !b) continue;
    const alpha = Math.max(0.12, Math.min(0.36, (a.scale + b.scale) / 2.4));
    ctx.strokeStyle = `rgba(196, 214, 244, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();

    const midX = (a.px + b.px) * 0.5;
    const midY = (a.py + b.py) * 0.5;
    const labelAlpha = Math.max(0.18, Math.min(0.6, alpha + 0.08));
    ctx.font = "9px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const textW = ctx.measureText(edge.relation).width;
    ctx.fillStyle = `rgba(10, 14, 22, ${labelAlpha})`;
    ctx.fillRect(midX - textW * 0.5 - 3, midY - 6, textW + 6, 11);
    ctx.fillStyle = `rgba(214, 228, 252, ${Math.min(0.92, labelAlpha + 0.24)})`;
    ctx.fillText(edge.relation, midX, midY);
  }

  projected
    .slice()
    .sort((a, b) => a.depth - b.depth)
    .forEach((point) => {
      const r = point.radius * point.scale;
      ctx.beginPath();
      ctx.fillStyle = point.color;
      ctx.shadowColor = "rgba(103, 184, 255, 0.5)";
      ctx.shadowBlur = 5;
      ctx.arc(point.px, point.py, Math.max(1.6, r), 0, Math.PI * 2);
      ctx.fill();
    });

  for (const point of projected) {
    if (point.scale < 0.45) continue;
    const offsetX = point.radius * point.scale + 5;
    ctx.font = "10px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const text = point.label;
    const textW = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(12, 16, 24, 0.72)";
    ctx.fillRect(point.px + offsetX - 3, point.py - 7, textW + 6, 12);
    ctx.fillStyle = point.kind === "stock" ? "#b9ddff" : point.kind === "year" ? "#bff7e0" : "#e3ecff";
    ctx.fillText(text, point.px + offsetX, point.py);
  }

  ctx.shadowBlur = 0;
  graphAnimationFrame = window.requestAnimationFrame(draw3dGraph);
}

function onGraphPointerDown(event: PointerEvent) {
  const canvas = graphCanvasRef.value;
  if (!canvas) return;
  isDraggingGraph = true;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
}

function onGraphPointerMove(event: PointerEvent) {
  if (!isDraggingGraph) return;
  const dx = event.clientX - lastPointerX;
  const dy = event.clientY - lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;

  userRotationY += dx * 0.012;
  userRotationX += dy * 0.01;
  userRotationX = clamp(userRotationX, -1.1, 1.1);
  velocityY = dx * 0.0008;
  velocityX = dy * 0.0007;
}

function onGraphPointerUp(event: PointerEvent) {
  const canvas = graphCanvasRef.value;
  if (canvas?.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  isDraggingGraph = false;
}

function onGraphWheel(event: WheelEvent) {
  event.preventDefault();
  const delta = event.deltaY > 0 ? 0.95 : 1.05;
  zoomScale = clamp(zoomScale * delta, 0.68, 1.8);
}

const primaryStockCode = computed(() => stockCodes.value[0] ?? "");

const keyFinancials = ref<KeyFinancialsResponse | null>(null);
const keyFinancialLoading = ref(false);
const keyFinancialError = ref("");

async function fetchKeyFinancials() {
  if (!primaryStockCode.value) {
    keyFinancials.value = null;
    return;
  }
  keyFinancialLoading.value = true;
  keyFinancialError.value = "";
  try {
    keyFinancials.value = await apiClient.getKeyFinancials(primaryStockCode.value);
  } catch (error) {
    keyFinancials.value = null;
    keyFinancialError.value =
      error instanceof Error ? error.message : "Gagal mengambil data key financials.";
  } finally {
    keyFinancialLoading.value = false;
  }
}

const financialColumns = computed(() => keyFinancials.value?.columns ?? []);
const financialRows = computed(() => keyFinancials.value?.rows ?? []);

function latestFinite(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const item = values[i];
    if (typeof item === "number" && Number.isFinite(item)) return item;
  }
  return null;
}

function previousFinite(values: Array<number | null>): number | null {
  let seenLatest = false;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const item = values[i];
    if (typeof item !== "number" || !Number.isFinite(item)) continue;
    if (!seenLatest) {
      seenLatest = true;
      continue;
    }
    return item;
  }
  return null;
}

const financialInsightText = computed(() => {
  if (!keyFinancials.value || !financialRows.value.length) {
    return "Belum ada ringkasan finansial. Jalankan analisis untuk memuat data terbaru.";
  }

  const revenueRow = financialRows.value.find((row) => row.label.toLowerCase().includes("revenue"));
  const roeRow = financialRows.value.find((row) => row.label.toLowerCase().includes("roe"));
  const debtRow = financialRows.value.find((row) =>
    row.label.toLowerCase().includes("debt to equity"),
  );

  const revLatest = revenueRow ? latestFinite(revenueRow.values) : null;
  const revPrev = revenueRow ? previousFinite(revenueRow.values) : null;
  const debtLatest = debtRow ? latestFinite(debtRow.values) : null;
  const roeLatest = roeRow ? latestFinite(roeRow.values) : null;

  const growthSentence =
    revLatest !== null && revPrev !== null
      ? revLatest > revPrev
        ? "Revenue naik dibanding periode sebelumnya."
        : revLatest < revPrev
          ? "Revenue menurun dibanding periode sebelumnya."
          : "Revenue cenderung stabil pada periode terbaru."
      : "Pergerakan revenue belum bisa dibandingkan karena data terbatas.";

  const qualitySentence =
    roeLatest !== null && debtLatest !== null
      ? `ROE saat ini ${roeLatest.toFixed(2)}% dengan debt to equity ${debtLatest.toFixed(2)}.`
      : "Indikator ROE dan leverage sedang belum lengkap.";

  return `${growthSentence} ${qualitySentence}`;
});

const scrollRef = ref<HTMLElement | null>(null);
let scrollFrame = 0;

function scrollConversationToBottom(smooth = false) {
  if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
  scrollFrame = window.requestAnimationFrame(() => {
    const container = scrollRef.value;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  });
}

watch(
  () => state.messages.map((message) => `${message.id}:${message.status}:${message.content.length}`),
  async (current, previous) => {
    await nextTick();
    scrollConversationToBottom(current.length !== previous?.length);
  },
  { deep: true, flush: "post" },
);

watch(primaryStockCode, () => {
  void fetchKeyFinancials();
}, { immediate: true });

onMounted(() => {
  window.addEventListener("keydown", handleResponsiveEscape);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleResponsiveEscape);
  if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
});
</script>

<template>
  <main class="result-screen" :style="{ '--sidebar-w': sidebarWidth }">
    <button
      v-if="sidebarDrawerOpen"
      type="button"
      class="drawer-backdrop sidebar-backdrop"
      aria-label="Tutup riwayat percakapan"
      @click="closeSidebarDrawer"
    />
    <button
      v-if="insightDrawerOpen"
      type="button"
      class="drawer-backdrop insight-backdrop"
      aria-label="Tutup insight"
      @click="closeInsightDrawer"
    />

    <div id="conversation-sidebar" class="sidebar-shell" :class="{ 'is-open': sidebarDrawerOpen }">
      <button
        type="button"
        class="drawer-close sidebar-close"
        aria-label="Tutup riwayat percakapan"
        @click="closeSidebarDrawer"
      >
        <i class="pi pi-times" />
      </button>
      <AppLeftSidebar />
    </div>

    <section class="main-stage">
      <header class="mobile-result-toolbar" aria-label="Navigasi hasil analisis">
        <button
          type="button"
          aria-controls="conversation-sidebar"
          :aria-expanded="sidebarDrawerOpen"
          @click="openSidebarDrawer"
        >
          <i class="pi pi-bars" />
          Riwayat
        </button>
        <button
          type="button"
          aria-controls="insight-panel"
          :aria-expanded="insightDrawerOpen"
          @click="openInsightDrawer"
        >
          <i class="pi pi-chart-line" />
          Insight
        </button>
      </header>

      <div class="chat-canvas">
        <div ref="scrollRef" class="chat-scroll">
          <p v-if="!state.messages.length" class="empty-hint">
            Belum ada percakapan. Kirim pertanyaan untuk memulai analisis.
          </p>

          <template v-for="msg in state.messages" :key="msg.id">
            <div v-if="msg.role === 'user'" class="message-row user">
              <article class="bubble user-bubble">
                <p>{{ msg.content }}</p>
              </article>
            </div>
            <div v-else class="message-row assistant">
              <article
                class="bubble assistant-bubble"
                :data-message-id="msg.id"
                :class="{ 'is-thinking': msg.status === 'thinking', 'is-error': msg.status === 'error' }"
              >
                <AnalysisProgress
                  v-if="msg.progressVisible && msg.progressSteps?.length"
                  :title="msg.progressTitle || 'StockGraph sedang menganalisis'"
                  :note="msg.progressNote"
                  :steps="msg.progressSteps"
                />
                <div
                  v-else-if="msg.status === 'thinking'"
                  class="thinking"
                  role="status"
                  aria-live="polite"
                >
                  <span class="thinking-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>{{ msg.thinkingText || "Menganalisis..." }}</span>
                </div>
                <div
                  v-if="msg.status !== 'thinking'"
                  class="streaming-content"
                  :class="{ 'has-progress': msg.progressVisible }"
                >
                  <div
                    class="bubble-text markdown-body"
                    @click="handleCitationClick($event, msg.id)"
                    v-html="markdown(msg.content, msg.sources?.length ?? 0)"
                  />
                  <span v-if="msg.status === 'streaming'" class="cursor" aria-hidden="true" />
                </div>
              <div
                v-if="(msg.sources && msg.sources.length) || (msg.citations && msg.citations.length)"
                class="sources-section"
              >
                <h4><i class="pi pi-link" /> Sumber</h4>
                <ol v-if="msg.sources && msg.sources.length" class="source-list">
                  <li v-for="(source, sourceIndex) in msg.sources" :key="source.source_id || `${source.title}-${source.url}`">
                    <CitationSourceCard
                      :source="source"
                      :citation-index="sourceIndex + 1"
                      @preview="openSourceFromList(msg.id, sourceIndex + 1)"
                    />
                  </li>
                </ol>
                <ol v-else>
                  <li v-for="src in msg.citations" :key="src">{{ src }}</li>
                </ol>
              </div>
              </article>
            </div>
          </template>
        </div>

        <div class="composer-wrap">
          <AppMessageComposer
            v-model="followUpQuestion"
            :rows="1"
            :max-height="180"
            :placeholder="defaultFollowUpPlaceholder"
            :disabled="state.isStreaming || state.pipelineLoading"
            @send="submitFollowUp"
          />
        </div>
      </div>
    </section>

    <aside id="insight-panel" class="right-panel" :class="{ 'is-open': insightDrawerOpen }">
      <div class="right-panel-mobile-head">
        <strong>Insight & Graph</strong>
        <button type="button" aria-label="Tutup insight" @click="closeInsightDrawer">
          <i class="pi pi-times" />
        </button>
      </div>
      <section class="panel-card">
        <div class="insight-heading">
          <h3>Insight Cepat</h3>
          <span v-if="state.insightSnapshotIsNew" class="snapshot-badge">Snapshot baru</span>
        </div>
        <ul class="kv-list">
          <li>
            <span>
              <i class="pi pi-face-smile" />
              Sentimen Berita
              <i class="pi pi-info-circle sentiment-info" :title="sentimentTooltip" />
            </span>
            <b
              v-if="shouldShowSentimentBadge"
              :class="sentimentClass"
              :title="state.insightSnapshot?.sentiment_reason || insightSourceBasis"
            >
              {{ sentimentLabel }}
            </b>
          </li>
          <li class="insight-detail-row">
            <p>{{ insightSourceBasis }}</p>
            <div v-if="sentimentBreakdown" class="sentiment-breakdown">
              <span><b>{{ sentimentBreakdown.positive }}</b> Positif</span>
              <span><b>{{ sentimentBreakdown.neutral }}</b> Netral</span>
              <span><b>{{ sentimentBreakdown.negative }}</b> Negatif</span>
            </div>
            <small v-if="sentimentContextLine">{{ sentimentContextLine }}</small>
          </li>
          <li class="entity-row">
            <span><i class="pi pi-id-card" /> Entitas Utama</span>
            <b class="entity-value" :title="topEntitiesText">{{ topEntitiesText }}</b>
          </li>
          <li><span><i class="pi pi-share-alt" /> Node Graph</span><b>{{ nodeGraphCount }}</b></li>
          <li><span><i class="pi pi-sitemap" /> Relasi Utama</span><b>{{ relationGraphCount }}</b></li>
        </ul>
        <footer v-if="state.insightSnapshot" class="insight-snapshot-meta">
          <span>
            <i class="pi pi-clock" />
            Diperbarui {{ insightUpdatedAt }}
          </span>
          <small>{{ state.insightUpdateReason }}</small>
        </footer>
      </section>

      <section class="panel-card">
        <KnowledgeGraphExplorer
          :stock-codes="stockCodes"
          :refresh-key="state.graphRevision"
        />
      </section>

      <section class="panel-card">
        <h3>Key Financials</h3>
        <table class="mini-table">
          <thead>
            <tr>
              <th />
              <th v-for="col in financialColumns" :key="`${col.label}-${col.period}`">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="keyFinancialLoading">
              <td class="table-status" :colspan="Math.max(2, financialColumns.length + 1)">
                Memuat key financials...
              </td>
            </tr>
            <tr v-else-if="keyFinancialError">
              <td class="table-status error" :colspan="Math.max(2, financialColumns.length + 1)">
                {{ keyFinancialError }}
              </td>
            </tr>
            <tr v-else-if="!financialRows.length">
              <td class="table-status" :colspan="Math.max(2, financialColumns.length + 1)">
                Data key financials belum tersedia.
              </td>
            </tr>
            <template v-else>
              <tr v-for="row in financialRows" :key="row.label">
                <td>{{ row.label }}</td>
                <td v-for="(cell, idx) in row.formatted" :key="`${row.label}-${idx}`">{{ cell || "-" }}</td>
              </tr>
            </template>
          </tbody>
        </table>
        <p class="table-note" v-if="keyFinancials">
          {{ keyFinancials.stock_code }} - {{ keyFinancials.company_name }} - Sumber: {{ keyFinancials.source }}
        </p>

        <article class="insight-card">
          <h4><i class="pi pi-lightbulb" /> Insight</h4>
          <p>{{ financialInsightText }}</p>
        </article>
      </section>

      <section class="panel-card control-card">
        <div class="mini-filters">
          <div class="mini-filter">
            <label>Maksimal artikel</label>
            <input
              v-model.number="maxArticlesModel"
              type="number"
              min="1"
              max="10"
              step="1"
              class="mini-input"
            />
          </div>
          <div class="mini-filter">
            <label>Relevance threshold</label>
            <input
              v-model.number="thresholdSliderModel"
              type="number"
              min="0"
              max="10"
              step="1"
              class="mini-input"
            />
          </div>
        </div>
        <button type="button" class="update-btn" :disabled="state.pipelineLoading" @click="rerunAnalysis">
          {{ state.pipelineLoading ? "Memproses..." : "Ubah" }}
        </button>
      </section>
    </aside>

    <SourceDetailModal
      :source="activeCitationSource"
      :citation-index="activeCitation?.sourceIndex ?? 0"
      @close="closeCitation"
    />
  </main>
</template>

<style scoped>
.result-screen {
  --primary: var(--blue, #2f9ff5);
  --primary-strong: #2b7afb;
  --surface-base: #eef5ff;
  --surface-raised: rgba(255, 255, 255, 0.82);
  --surface-soft: rgba(255, 255, 255, 0.66);
  --border-soft: rgba(153, 174, 211, 0.36);
  --text-main: #171d2c;
  --text-muted: #6c7890;
  --sidebar-w: 280px;
  height: 100dvh;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr) 365px;
  gap: 12px;
  background: #181818;
  color: var(--text-main);
  overflow: hidden;
  transition: grid-template-columns 0.2s ease;
}

.sidebar-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.sidebar-shell :deep(.left-rail) {
  flex: 1;
  min-height: 0;
}

.drawer-backdrop,
.drawer-close,
.mobile-result-toolbar,
.right-panel-mobile-head {
  display: none;
}

.main-stage {
  position: relative;
  isolation: isolate;
  min-width: 0;
  height: calc(100dvh - 24px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 0;
  border-radius: 14px;
  background:
    radial-gradient(circle at 13% 16%, rgba(210, 224, 251, 0.58), transparent 24%),
    radial-gradient(circle at 87% 14%, rgba(218, 230, 255, 0.72), transparent 25%),
    linear-gradient(180deg, #fbfdff 0%, #f7faff 31%, #f2f6fd 55%, #eef2fb 100%);
  padding: 20px 24px 16px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.24);
  overflow: hidden;
}

.main-stage::after {
  content: "";
  position: absolute;
  z-index: 0;
  left: 8%;
  right: 8%;
  top: 220px;
  height: 150px;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(166, 190, 235, 0.18), transparent 68%);
  filter: blur(18px);
}

.chat-canvas {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  box-shadow: none;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding: 2px 4px 8px;
  scroll-padding-bottom: 96px;
  overflow-anchor: none;
}

.message-row {
  display: flex;
  width: 100%;
  animation: message-in 0.22s ease-out both;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.assistant {
  justify-content: flex-start;
}

.bubble {
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: var(--surface-soft);
  color: var(--text-main);
  padding: 12px 14px;
  max-width: min(88%, 760px);
  min-width: 0;
  overflow-wrap: anywhere;
  box-shadow: 0 12px 28px rgba(73, 96, 135, 0.12);
}

.bubble p {
  margin: 0;
}

.user-bubble {
  background: var(--primary-strong);
  border-color: rgba(129, 172, 255, 0.34);
  color: #f4f8ff;
  max-width: min(74%, 700px);
  border-bottom-right-radius: 5px;
  box-shadow: 0 12px 28px rgba(43, 122, 251, 0.18);
}

.user-bubble p {
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.msg-time {
  display: block;
  text-align: right;
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
}

.user-bubble .msg-time {
  color: rgba(240, 248, 255, 0.9);
}

.analysis-bubble h2 {
  margin: 0 0 10px;
  font-size: 16px;
}

.analysis-bubble ol {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}

.analysis-bubble li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
}

.analysis-bubble li p {
  font-size: 14px;
  line-height: 1.4;
}

.point {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  display: grid;
  place-items: center;
  margin-top: 6px;
}

.sources-section {
  margin-top: 20px;
  border-top: 1px solid #c6cedb;
  padding-top: 14px;
}

.sources-section h4 {
  margin: 0 0 10px;
  font-size: 13px;
  color: #26324a;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 7px;
}

.sources-section ol {
  margin: 0;
  padding: 0;
}

.sources-section li {
  margin-bottom: 6px;
  font-size: 12px;
  color: #2a3242;
  list-style: none;
}

.sources-section a {
  color: #1f66db;
  text-decoration: underline;
}

.source-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.audio-bubble {
  min-width: 40%;
  background: var(--primary);
  border-color: var(--primary);
  color: #f4f8ff;
}

.audio-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.play-btn {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--primary);
  display: grid;
  place-items: center;
}

.wave-line {
  flex: 1;
  height: 18px;
  border-radius: 8px;
  background: repeating-linear-gradient(
    to right,
    rgba(255, 255, 255, 0.94),
    rgba(255, 255, 255, 0.94) 2px,
    transparent 2px,
    transparent 5px
  );
}

.audio-time {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.assistant-bubble {
  border-bottom-left-radius: 6px;
  max-width: min(100%, 980px);
  padding: 16px 18px;
  border-color: rgba(154, 171, 205, 0.42);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(242, 247, 255, 0.82)),
    rgba(255, 255, 255, 0.78);
  box-shadow: 0 16px 34px rgba(73, 96, 135, 0.14);
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.assistant-bubble.is-thinking {
  min-width: 190px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(242, 247, 255, 0.84)),
    rgba(255, 255, 255, 0.78);
}

.assistant-bubble.is-error {
  border-color: rgba(211, 75, 75, 0.38);
  background:
    linear-gradient(135deg, rgba(255, 241, 241, 0.94), rgba(255, 247, 247, 0.86)),
    rgba(255, 255, 255, 0.78);
}

.assistant-bubble p {
  font-size: 14px;
  line-height: 1.55;
}

.streaming-content.has-progress {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(128, 145, 174, 0.22);
}

.bubble-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.streaming-content {
  min-width: 0;
}

.markdown-body {
  max-width: 860px;
  font-size: 16px;
  line-height: 1.74;
  color: #1d2534;
}

.markdown-body :deep(h1) {
  margin: 0 0 18px;
  font-size: 24px;
  line-height: 1.22;
  color: #101827;
}

.markdown-body :deep(h2) {
  margin: 28px 0 12px;
  font-size: 20px;
  line-height: 1.3;
  color: #121a2a;
  font-weight: 760;
}

.markdown-body :deep(h3) {
  margin: 22px 0 8px;
  font-size: 17px;
  line-height: 1.4;
  color: #1e2a3f;
  font-weight: 740;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(p) {
  margin: 0 0 14px;
  line-height: 1.74;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 12px 0 18px;
  padding-left: 1.55rem;
}

.markdown-body :deep(li) {
  margin: 8px 0;
  padding-left: 0.2rem;
  line-height: 1.68;
}

.markdown-body :deep(li::marker) {
  color: #4d73d9;
  font-weight: 650;
}

.markdown-body :deep(li > p) {
  margin: 0 0 6px;
}

.markdown-body :deep(li > p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(li > ul),
.markdown-body :deep(li > ol) {
  margin: 7px 0 10px;
  padding-left: 1.2rem;
}

.markdown-body :deep(strong) {
  color: #0f1726;
  font-weight: 700;
}

.markdown-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  background: rgba(15, 22, 35, 0.08);
  border-radius: 4px;
  padding: 1px 4px;
}

.markdown-body :deep(pre) {
  margin: 14px 0 18px;
  border-radius: 11px;
  padding: 14px 16px;
  overflow-x: auto;
  max-width: 100%;
  background: #111723;
  border: 1px solid rgba(15, 22, 35, 0.12);
  color: #d9e7ff;
  white-space: pre;
  scrollbar-width: thin;
}

.markdown-body :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

.markdown-body :deep(a) {
  color: #1f66db;
  text-decoration: underline;
}

.markdown-body :deep(blockquote) {
  margin: 14px 0 18px;
  padding: 9px 14px;
  border-left: 3px solid #8aa8de;
  color: #4d5c75;
  background: rgba(91, 125, 186, 0.08);
  border-radius: 0 8px 8px 0;
}

.markdown-body :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(.table-scroll) {
  width: 100%;
  overflow-x: auto;
  margin: 14px 0 20px;
  border: 1px solid #c6cedb;
  border-radius: 10px;
}

.markdown-body :deep(table) {
  width: 100%;
  min-width: 440px;
  border-collapse: collapse;
  font-size: 13px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #c6cedb;
  padding: 9px 11px;
  text-align: left;
  vertical-align: top;
}

.markdown-body :deep(th) {
  background: #e7ebf3;
  color: #172033;
  font-weight: 750;
}

.markdown-body :deep(tr:nth-child(even) td) {
  background: rgba(229, 234, 243, 0.45);
}

.markdown-body :deep(td:not(:first-child)) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.markdown-body :deep(hr) {
  height: 1px;
  margin: 22px 0;
  border: 0;
  background: #cbd3e0;
}

.markdown-body :deep(.inline-citation) {
  display: inline-flex;
  align-items: center;
  border: 0;
  border-radius: 5px;
  background: rgba(43, 122, 251, 0.12);
  color: #1f66db;
  padding: 1px 5px;
  margin: 0 2px 0 4px;
  font: inherit;
  font-size: 0.82em;
  font-weight: 800;
  line-height: 1.3;
  vertical-align: baseline;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.16s ease,
    color 0.16s ease;
}

.markdown-body :deep(.inline-citation:hover),
.markdown-body :deep(.inline-citation:focus-visible) {
  background: var(--primary-strong);
  color: #fff;
  outline: none;
}

.empty-hint {
  margin: auto;
  color: #6c7890;
  font-size: 14px;
  text-align: center;
}

.thinking {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 24px;
  font-size: 13px;
  color: #5f6d84;
}

.thinking-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.thinking-dots i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--primary);
  animation: thinking-bounce 1.15s ease-in-out infinite;
}

.thinking-dots i:nth-child(2) {
  animation-delay: 0.14s;
}

.thinking-dots i:nth-child(3) {
  animation-delay: 0.28s;
}

.cursor {
  display: inline-block;
  width: 2px;
  height: 1.05em;
  margin-left: 3px;
  vertical-align: -0.12em;
  border-radius: 2px;
  background: var(--primary);
  animation: blink 0.85s steps(1) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

@keyframes thinking-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.42;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.composer-wrap {
  margin-top: auto;
  position: sticky;
  bottom: 0;
  z-index: 2;
  border: 1px solid rgba(154, 171, 205, 0.42);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  padding: 9px 12px;
  box-shadow: 0 -10px 24px rgba(73, 96, 135, 0.12);
  backdrop-filter: blur(10px);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.composer-wrap:focus-within {
  border-color: rgba(47, 159, 245, 0.72);
  box-shadow:
    0 -10px 24px rgba(73, 96, 135, 0.12),
    0 0 0 3px rgba(47, 159, 245, 0.12);
}

.composer-wrap :deep(.composer-box) {
  margin-top: 0;
}

.composer-wrap :deep(.composer-input) {
  color: #1d2433;
}

.composer-wrap :deep(.composer-input::placeholder) {
  color: #98a3b7;
}

.composer-wrap :deep(.composer-send-btn) {
  border-color: var(--primary-strong);
  background: var(--primary-strong);
  box-shadow: 0 8px 18px rgba(43, 122, 251, 0.24);
}

.right-panel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-auto-rows: max-content;
  gap: 12px;
  color: #f4f7fe;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
}

.right-panel-mobile-head {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #f4f7fe;
}

.right-panel-mobile-head button,
.drawer-close {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(185, 205, 241, 0.14);
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  place-items: center;
  color: #dce8fb;
  background: rgba(255, 255, 255, 0.07);
  cursor: pointer;
}

.chat-scroll,
.right-panel {
  scrollbar-width: thin;
}

.chat-scroll {
  scrollbar-color: rgba(90, 124, 207, 0.62) rgba(216, 226, 246, 0.72);
}

.right-panel {
  scrollbar-color: rgba(102, 163, 255, 0.75) rgba(255, 255, 255, 0.06);
}

.chat-scroll::-webkit-scrollbar,
.right-panel::-webkit-scrollbar {
  width: 10px;
}

.chat-scroll::-webkit-scrollbar-track,
.right-panel::-webkit-scrollbar-track {
  border-radius: 999px;
}

.chat-scroll::-webkit-scrollbar-track {
  background: rgba(216, 226, 246, 0.72);
}

.right-panel::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.06);
}

.chat-scroll::-webkit-scrollbar-thumb,
.right-panel::-webkit-scrollbar-thumb {
  border-radius: 999px;
}

.chat-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(80, 136, 245, 0.7), rgba(102, 163, 255, 0.58));
  border: 2px solid rgba(240, 246, 255, 0.9);
}

.right-panel::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(80, 136, 245, 0.85), rgba(102, 163, 255, 0.75));
  border: 2px solid rgba(15, 17, 23, 0.45);
}

.chat-scroll::-webkit-scrollbar-thumb:hover,
.right-panel::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgba(95, 150, 255, 0.95), rgba(120, 175, 255, 0.9));
}

.panel-card {
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(41, 44, 54, 0.62), rgba(18, 21, 29, 0.95));
  padding: 14px;
  overflow-x: hidden;
}

.panel-card h3 {
  margin: 0 0 12px;
  font-size: 16px;
  color: #f4f7fe;
}

.kv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.kv-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #d8dff0;
}

.kv-list li span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.kv-list b {
  font-weight: 600;
  color: #f6f8fd;
}

.insight-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.snapshot-badge {
  border: 1px solid rgba(90, 153, 255, 0.35);
  border-radius: 999px;
  padding: 3px 7px;
  color: #bcd5ff;
  background: rgba(54, 113, 220, 0.18);
  font-size: 9px;
  font-weight: 750;
  white-space: nowrap;
}

.kv-list .insight-detail-row {
  margin-top: -5px;
  padding: 0 0 3px 28px;
  display: block;
}

.insight-detail-row p {
  margin: 0;
  color: #8f9bb0;
  font-size: 10px;
  line-height: 1.45;
}

.insight-detail-row small {
  display: block;
  margin-top: 6px;
  color: #738198;
  font-size: 9px;
  line-height: 1.4;
}

.sentiment-info {
  color: #8f9bb0;
  font-size: 11px;
  cursor: help;
}

.sentiment-breakdown {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sentiment-breakdown span {
  border: 1px solid rgba(185, 205, 241, 0.13);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.045);
  color: #c9d3e6;
  padding: 3px 7px;
  font-size: 9px;
  line-height: 1.2;
}

.sentiment-breakdown b {
  margin-right: 3px;
  color: #f4f7fe;
  font-weight: 800;
}

.entity-row {
  align-items: flex-start !important;
}

.entity-value {
  text-align: right;
  max-width: 58%;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.sentiment-pill {
  font-size: 12px;
  border-radius: 999px;
  padding: 4px 8px;
  line-height: 1.15;
  white-space: nowrap;
}

.sentiment-pill.positive {
  background: rgba(76, 184, 130, 0.26);
  color: #b9ffd8;
  border: 1px solid rgba(86, 204, 144, 0.35);
}

.sentiment-pill.negative {
  background: rgba(255, 110, 110, 0.2);
  color: #ffd1d1;
  border: 1px solid rgba(255, 135, 135, 0.35);
}

.sentiment-pill.neutral {
  background: rgba(155, 175, 210, 0.2);
  color: #d7e2f8;
  border: 1px solid rgba(185, 205, 241, 0.3);
}

.sentiment-pill.mixed {
  background: rgba(221, 165, 77, 0.13);
  color: #f4d69b;
  border: 1px solid rgba(230, 178, 94, 0.24);
}

.sentiment-pill.limited {
  background: rgba(142, 149, 164, 0.15);
  color: #c8cfda;
  border: 1px solid rgba(173, 181, 196, 0.24);
}

.insight-snapshot-meta {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: grid;
  gap: 4px;
  color: #9eabc0;
}

.insight-snapshot-meta span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
}

.insight-snapshot-meta small {
  color: #738198;
  font-size: 9px;
  line-height: 1.4;
}

.graph-box {
  height: 180px;
  border-radius: 10px;
  background: #1a1e28;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px;
}

.graph-canvas {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 8px;
  cursor: grab;
  touch-action: none;
}

.graph-canvas:active {
  cursor: grabbing;
}

.graph-caption {
  margin: 8px 0 0;
  font-size: 11px;
  color: #b9c7e4;
  line-height: 1.35;
}

.graph-legend,
.graph-relations {
  margin-top: 10px;
  border: 1px solid rgba(185, 205, 241, 0.14);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 10px;
}

.graph-legend h4,
.graph-relations h4 {
  margin: 0 0 6px;
  font-size: 11px;
  color: #d6e2f8;
}

.graph-legend ul,
.graph-relations ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.graph-legend li,
.graph-relations li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #c5d3ef;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  flex: 0 0 auto;
}

.graph-legend li span:last-child {
  flex: 1;
}

.graph-relations code {
  font-size: 10px;
  color: #e4eeff;
  background: rgba(43, 122, 251, 0.18);
  border: 1px solid rgba(122, 176, 255, 0.36);
  border-radius: 6px;
  padding: 1px 5px;
}

.graph-relations p {
  margin: 0;
  font-size: 11px;
  color: #afbfdb;
}

.mini-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  color: #dbe1ed;
  margin-bottom: 10px;
}

.mini-table th,
.mini-table td {
  border: 1px solid #5f697f;
  padding: 5px 6px;
  font-size: 11px;
  text-align: center;
  white-space: normal;
  word-break: break-word;
}

.mini-table td:first-child {
  text-align: left;
}

.table-status {
  text-align: center !important;
  color: #cbd7ef;
  font-size: 12px !important;
}

.table-status.error {
  color: #ffb6b6;
}

.table-note {
  margin: 0 0 10px;
  color: #b6c4de;
  font-size: 11px;
}

.insight-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  padding: 10px;
}

.insight-card h4 {
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #f4f7fe;
}

.insight-card p {
  margin: 0;
  line-height: 1.45;
  color: #d8deea;
  font-size: 12px;
}

.mini-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mini-filter {
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px 10px;
}

.mini-filter label {
  display: block;
  font-size: 12px;
  margin-bottom: 8px;
  color: #f4f7fe;
}

.mini-input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #f4f7fe;
  padding: 6px 10px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.18s ease, background 0.18s ease;
  -moz-appearance: textfield;
}

.mini-input::-webkit-outer-spin-button,
.mini-input::-webkit-inner-spin-button {
  -webkit-appearance: auto;
  margin: 0;
}

.mini-input:hover {
  border-color: rgba(43, 122, 251, 0.6);
}

.mini-input:focus {
  border-color: var(--primary);
  background: rgba(255, 255, 255, 0.1);
}

.update-btn {
  margin-top: 10px;
  width: 100%;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-size: 16px;
}

.update-btn:disabled {
  opacity: 0.7;
}

@media (max-width: 1279px) {
  .result-screen {
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  }

  .right-panel {
    grid-column: 1 / -1;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
  }
}

@media (max-width: 1023px) {
  .result-screen {
    grid-template-columns: 1fr;
    padding: 12px;
    overflow: hidden;
  }

  .sidebar-shell {
    position: fixed;
    z-index: 260;
    inset: 12px auto 12px 12px;
    width: min(360px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    transform: translateX(calc(-100% - 18px));
    transition: transform 0.22s ease;
    filter: drop-shadow(18px 0 40px rgba(0, 0, 0, 0.42));
  }

  .sidebar-shell.is-open {
    transform: translateX(0);
  }

  .sidebar-shell :deep(.left-rail) {
    border-radius: 18px;
    width: 100%;
    min-height: 100%;
  }

  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 250;
    display: block;
    border: 0;
    padding: 0;
    background: rgba(7, 10, 16, 0.56);
    backdrop-filter: blur(4px);
    cursor: default;
  }

  .drawer-close {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 3;
  }

  .sidebar-close {
    display: grid;
  }

  .mobile-result-toolbar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .mobile-result-toolbar button {
    min-width: 0;
    min-height: 42px;
    border: 1px solid rgba(153, 174, 211, 0.42);
    border-radius: 12px;
    padding: 0 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #1f2a44;
    background: rgba(255, 255, 255, 0.82);
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 10px 22px rgba(73, 96, 135, 0.12);
  }

  .main-stage {
    height: calc(100dvh - 24px);
    padding: 14px;
    border-radius: 18px;
  }

  .chat-canvas {
    min-height: 0;
    border-radius: 12px;
  }

  .chat-scroll {
    gap: 12px;
    padding: 0 2px 8px;
  }

  .bubble {
    max-width: 100%;
  }

  .user-bubble {
    max-width: 88%;
  }

  .assistant-bubble {
    max-width: 100%;
    padding: 14px;
  }

  .composer-wrap {
    border-radius: 12px;
  }

  .analysis-bubble h2,
  .analysis-bubble li p,
  .assistant-bubble p,
  .user-bubble p,
  .audio-time,
  .msg-time,
  .kv-list li,
  .panel-card h3 {
    font-size: 16px;
  }

  .markdown-body {
    max-width: 100%;
    font-size: 15px;
    line-height: 1.68;
  }

  .markdown-body :deep(h1) {
    font-size: 21px;
  }

  .markdown-body :deep(h2) {
    font-size: 18px;
    margin-top: 24px;
  }

  .markdown-body :deep(h3) {
    font-size: 16px;
  }

  .markdown-body :deep(ul),
  .markdown-body :deep(ol) {
    padding-left: 1.25rem;
  }

  .right-panel {
    position: fixed;
    z-index: 260;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: min(430px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    display: grid;
    grid-template-columns: 1fr;
    grid-auto-rows: max-content;
    transform: translateX(calc(100% + 18px));
    transition: transform 0.22s ease;
    padding: 12px;
    border: 1px solid rgba(145, 174, 226, 0.18);
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(23, 26, 34, 0.98), rgba(14, 17, 24, 0.995));
    box-shadow: -18px 0 40px rgba(0, 0, 0, 0.42);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .right-panel.is-open {
    transform: translateX(0);
  }

  .right-panel-mobile-head {
    display: flex;
    position: sticky;
    top: -12px;
    z-index: 2;
    margin: -12px -12px 0;
    padding: 12px;
    background: rgba(18, 21, 29, 0.96);
    backdrop-filter: blur(10px);
  }

  .right-panel-mobile-head button {
    display: grid;
  }

  .source-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .result-screen {
    padding: 8px;
  }

  .main-stage {
    height: calc(100dvh - 16px);
    padding: 10px;
    border-radius: 16px;
  }

  .mobile-result-toolbar {
    gap: 8px;
  }

  .mobile-result-toolbar button {
    flex: 1;
    min-height: 40px;
    padding: 0 10px;
    font-size: 12px;
  }

  .chat-scroll {
    scroll-padding-bottom: 110px;
  }

  .assistant-bubble {
    padding: 12px;
  }

  .user-bubble {
    max-width: 94%;
  }

  .composer-wrap {
    margin-inline: -2px;
    padding: 8px 10px;
    border-radius: 14px;
  }

  .right-panel,
  .sidebar-shell {
    inset-block: 8px;
  }

  .sidebar-shell {
    left: 8px;
    width: min(340px, calc(100vw - 16px));
    max-width: calc(100vw - 16px);
  }

  .right-panel {
    right: 8px;
    width: calc(100vw - 16px);
    max-width: calc(100vw - 16px);
    border-radius: 16px;
  }

  .mini-filters {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 420px) {
  .markdown-body {
    font-size: 14px;
  }

  .markdown-body :deep(table) {
    min-width: 360px;
  }

  .kv-list li {
    align-items: flex-start;
  }

  .sentiment-pill {
    white-space: normal;
    text-align: right;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-row,
  .thinking-dots i,
  .cursor,
  .sidebar-shell,
  .right-panel {
    animation: none;
    transition: none;
  }

}
</style>
