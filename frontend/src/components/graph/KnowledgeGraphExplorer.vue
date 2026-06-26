<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { apiClient } from "@/services/apiClient";
import type {
  GraphArticleDto,
  GraphEdgeDto,
  GraphExploreResponse,
  GraphNodeDto,
  GraphNodeKind,
} from "@/types/api";

const props = defineProps<{ stockCodes: string[]; refreshKey?: number }>();

type SemanticKind = GraphNodeKind | "event" | "policy" | "all";
type GraphMode = "overview" | "focus";

type RankedEdge = GraphEdgeDto & {
  evidenceCount: number;
  strength: number;
  duplicateCount: number;
};

type SimNode = GraphNodeDto & {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  visibleScore: number;
};

type ProjectedNode = SimNode & {
  px: number;
  py: number;
  scale: number;
  radius: number;
  depth: number;
};

const OVERVIEW_NODE_LIMIT = 45;
const OVERVIEW_EDGE_LIMIT = 80;
const FOCUS_ONE_HOP_LIMIT = 36;
const FOCUS_TWO_HOP_LIMIT = 68;
const FOCUS_ARTICLE_LIMIT = 5;
const SHOW_MORE_STEP = 20;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const loading = ref(false);
const error = ref("");
const fullscreen = ref(false);
const graphMode = ref<GraphMode>("overview");
const graphDepth = ref<1 | 2>(1);
const activeTypeFilter = ref<SemanticKind>("all");
const hideArticleNodes = ref(true);
const showEvidenceNodes = ref(false);
const highConfidenceOnly = ref(false);
const hideLowEvidenceRelations = ref(true);
const legendCollapsed = ref(true);
const searchQuery = ref("");
const selectedNodeId = ref<string | null>(null);
const selectedEdgeId = ref<string | null>(null);
const hoveredNodeId = ref<string | null>(null);
const hoveredEdgeId = ref<string | null>(null);
const sourcePreview = ref<GraphArticleDto[] | null>(null);
const extraVisibleCount = ref(0);

const graph = ref<GraphExploreResponse>({
  nodes: [],
  edges: [],
  articles: [],
  analytics: {
    node_count: 0,
    relationship_count: 0,
    article_count: 0,
    most_connected: [],
    most_cited: [],
  },
});
const simNodes = ref<SimNode[]>([]);
const graphCache = new Map<string, GraphExploreResponse>();

let frame = 0;
let lastTime = 0;
let projectedNodes: ProjectedNode[] = [];
let rotationX = -0.12;
let rotationY = 0.22;
let zoom = 1;
let panX = 0;
let panY = 0;
let dragging = false;
let dragMode: "rotate" | "pan" = "rotate";
let pointerX = 0;
let pointerY = 0;
let moved = false;
let focusX = 0;
let focusY = 0;
let focusZ = 0;
let targetFocusX = 0;
let targetFocusY = 0;
let targetFocusZ = 0;

const palette: Record<GraphNodeKind, string> = {
  stock: "#4d9cff",
  company: "#43d7b4",
  person: "#e4d8ff",
  topic: "#a97bff",
  financial: "#ffae57",
  year: "#72dda8",
  article: "#ff6577",
};

const semanticLabels: Record<SemanticKind, string> = {
  all: "All",
  stock: "Stock",
  company: "Company",
  event: "Event",
  policy: "Policy",
  financial: "Financial Metric",
  person: "Person",
  topic: "Topic",
  year: "Year",
  article: "Article",
};

const filterOptions: SemanticKind[] = [
  "all",
  "stock",
  "company",
  "event",
  "policy",
  "financial",
  "person",
  "article",
];

const kindWeight: Record<GraphNodeKind, number> = {
  stock: 120,
  company: 105,
  topic: 82,
  financial: 74,
  person: 56,
  year: 45,
  article: 14,
};

const rawNodeMap = computed(() => new Map(graph.value.nodes.map((node) => [node.id, node])));
const simNodeMap = computed(() => new Map(simNodes.value.map((node) => [node.id, node])));
const articleMap = computed(() => new Map(graph.value.articles.map((item) => [item.id, item])));
const articleIdSet = computed(() => new Set(graph.value.articles.map((item) => item.id)));
const selectedNode = computed(() =>
  selectedNodeId.value ? simNodeMap.value.get(selectedNodeId.value) ?? null : null,
);
const selectedEdge = computed(() =>
  selectedEdgeId.value
    ? visibleEdges.value.find((edge) => edge.id === selectedEdgeId.value) ?? null
    : null,
);

function semanticKind(node: GraphNodeDto): SemanticKind {
  if (node.type !== "topic") return node.type;
  const text = `${node.label} ${node.description}`.toLowerCase();
  if (/\b(policy|regulasi|aturan|pemerintah|tarif|dividen|suku bunga)\b/.test(text)) {
    return "policy";
  }
  if (/\b(event|aksi|merger|akuisisi|rights issue|kerugian|gugatan|investasi|sentimen)\b/.test(text)) {
    return "event";
  }
  return "topic";
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nodeEvidence(node: GraphNodeDto): GraphArticleDto[] {
  const direct = node.source_ids
    .map((id) => articleMap.value.get(id))
    .filter(Boolean) as GraphArticleDto[];
  if (direct.length) return direct;
  return graph.value.articles.filter((article) => article.entity_ids.includes(node.id));
}

function latestYearScore(node: GraphNodeDto): number {
  const years = nodeEvidence(node).map((article) => article.year).filter(Number.isFinite);
  return years.length ? Math.max(...years) - 2000 : 0;
}

function scoreNode(node: GraphNodeDto): number {
  const tickerBoost = props.stockCodes.some((code) =>
    [node.label, node.id, ...node.stock_codes].some((value) =>
      String(value).toUpperCase().includes(code.toUpperCase()),
    ),
  )
    ? 42
    : 0;
  return (
    kindWeight[node.type] +
    tickerBoost +
    Math.min(42, node.degree * 4.4) +
    Math.min(36, node.source_count * 5.2) +
    latestYearScore(node)
  );
}

function edgeKey(edge: GraphEdgeDto): string {
  const pair = [edge.source, edge.target].sort().join("::");
  return `${pair}::${edge.type}`;
}

const rankedEdges = computed<RankedEdge[]>(() => {
  const grouped = new Map<string, RankedEdge>();
  for (const edge of graph.value.edges) {
    const key = edgeKey(edge);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        ...edge,
        source_ids: unique(edge.source_ids),
        evidenceCount: edge.source_ids.length,
        strength: Math.max(1, edge.source_ids.length),
        duplicateCount: 1,
      });
      continue;
    }
    current.source_ids = unique([...current.source_ids, ...edge.source_ids]);
    current.evidenceCount = current.source_ids.length;
    current.strength = Math.max(current.strength, current.evidenceCount);
    current.duplicateCount += 1;
  }
  return [...grouped.values()].sort((a, b) => edgeScore(b) - edgeScore(a));
});

function edgeScore(edge: RankedEdge): number {
  const source = rawNodeMap.value.get(edge.source);
  const target = rawNodeMap.value.get(edge.target);
  return (
    Math.min(50, edge.evidenceCount * 8) +
    Math.min(26, edge.duplicateCount * 4) +
    (source ? scoreNode(source) * 0.12 : 0) +
    (target ? scoreNode(target) * 0.12 : 0)
  );
}

const adjacency = computed(() => {
  const map = new Map<string, RankedEdge[]>();
  for (const edge of rankedEdges.value) {
    if (!map.has(edge.source)) map.set(edge.source, []);
    if (!map.has(edge.target)) map.set(edge.target, []);
    map.get(edge.source)!.push(edge);
    map.get(edge.target)!.push(edge);
  }
  for (const edges of map.values()) edges.sort((a, b) => edgeScore(b) - edgeScore(a));
  return map;
});

const canonicalNodes = computed(() => {
  const seen = new Set<string>();
  return graph.value.nodes
    .slice()
    .sort((a, b) => scoreNode(b) - scoreNode(a))
    .filter((node) => {
      const key = normalizeLabel(node.label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
});

function passesTypeFilter(node: GraphNodeDto): boolean {
  if (activeTypeFilter.value === "all") return true;
  return semanticKind(node) === activeTypeFilter.value;
}

function shouldShowArticleNode(node: GraphNodeDto): boolean {
  if (node.type !== "article") return true;
  if (showEvidenceNodes.value) return true;
  return !hideArticleNodes.value;
}

function neighborId(edge: RankedEdge, nodeId: string): string {
  return edge.source === nodeId ? edge.target : edge.source;
}

function rankedFocusIds(rootId: string, depth: 1 | 2): string[] {
  const limit = depth === 1 ? FOCUS_ONE_HOP_LIMIT : FOCUS_TWO_HOP_LIMIT;
  const firstHop = (adjacency.value.get(rootId) ?? [])
    .map((edge) => neighborId(edge, rootId))
    .filter((id) => rawNodeMap.value.has(id));
  const candidates = new Set<string>([rootId, ...firstHop]);

  if (depth === 2) {
    for (const id of firstHop.slice(0, 24)) {
      for (const edge of adjacency.value.get(id) ?? []) {
        candidates.add(neighborId(edge, id));
      }
    }
  }

  return [...candidates]
    .map((id) => rawNodeMap.value.get(id))
    .filter(Boolean)
    .sort((a, b) => {
      if (a!.id === rootId) return -1;
      if (b!.id === rootId) return 1;
      return scoreNode(b!) - scoreNode(a!);
    })
    .slice(0, limit + extraVisibleCount.value)
    .map((node) => node!.id);
}

const focusNodeIds = computed(() => {
  if (!selectedNodeId.value) return [];
  return rankedFocusIds(selectedNodeId.value, graphDepth.value);
});

const visibleNodeDtos = computed(() => {
  const base =
    graphMode.value === "focus" && selectedNodeId.value
      ? focusNodeIds.value.map((id) => rawNodeMap.value.get(id)).filter(Boolean)
      : canonicalNodes.value.slice(0, OVERVIEW_NODE_LIMIT + extraVisibleCount.value);

  let articleCount = 0;
  return (base as GraphNodeDto[])
    .filter((node) => {
      if (selectedNodeId.value === node.id) return true;
      if (!passesTypeFilter(node)) return false;
      if (!shouldShowArticleNode(node)) return false;
      if (node.type === "article") {
        articleCount += 1;
        return graphMode.value === "focus" ? articleCount <= FOCUS_ARTICLE_LIMIT : showEvidenceNodes.value;
      }
      return true;
    })
    .map((node) => ({ ...node, visibleScore: scoreNode(node) }));
});

const visibleNodeIdSet = computed(() => new Set(visibleNodeDtos.value.map((node) => node.id)));
const hiddenEvidenceCount = computed(() => {
  const visibleArticles = visibleNodeDtos.value.filter((node) => node.type === "article").length;
  return Math.max(0, graph.value.articles.length - visibleArticles);
});

const visibleEdges = computed<RankedEdge[]>(() => {
  const selected = selectedNodeId.value;
  const maxEdges = graphMode.value === "focus" ? (graphDepth.value === 1 ? 52 : 96) : OVERVIEW_EDGE_LIMIT;
  return rankedEdges.value
    .filter((edge) => visibleNodeIdSet.value.has(edge.source) && visibleNodeIdSet.value.has(edge.target))
    .filter((edge) => !highConfidenceOnly.value || edge.evidenceCount > 0 || edge.duplicateCount > 1)
    .filter((edge) => !hideLowEvidenceRelations.value || edge.evidenceCount > 0 || graphMode.value === "focus")
    .sort((a, b) => {
      if (!selected) return edgeScore(b) - edgeScore(a);
      const aFocused = a.source === selected || a.target === selected ? 1 : 0;
      const bFocused = b.source === selected || b.target === selected ? 1 : 0;
      return bFocused - aFocused || edgeScore(b) - edgeScore(a);
    })
    .slice(0, maxEdges + extraVisibleCount.value);
});

const evidenceSummary = computed(() => {
  const news = graph.value.articles.filter((article) => article.url || article.publisher).length;
  const reports = graph.value.articles.filter((article) =>
    `${article.publisher} ${article.title}`.toLowerCase().includes("laporan"),
  ).length;
  return {
    total: graph.value.articles.length,
    news,
    reports,
    hidden: hiddenEvidenceCount.value,
  };
});

const selectedSources = computed(() => {
  const ids = selectedNode.value?.source_ids ?? selectedEdge.value?.source_ids ?? [];
  const direct = ids.map((id) => articleMap.value.get(id)).filter(Boolean) as GraphArticleDto[];
  if (direct.length) return direct;
  if (selectedNode.value) return nodeEvidence(selectedNode.value);
  return [];
});

const hoveredNode = computed(() =>
  hoveredNodeId.value ? simNodeMap.value.get(hoveredNodeId.value) ?? null : null,
);
const hoveredSources = computed(() => (hoveredNode.value ? nodeEvidence(hoveredNode.value) : []));

const relatedGroups = computed(() => {
  const node = selectedNode.value;
  if (!node) return [];
  const related = (adjacency.value.get(node.id) ?? [])
    .map((edge) => rawNodeMap.value.get(neighborId(edge, node.id)))
    .filter(Boolean) as GraphNodeDto[];
  const grouped = new Map<SemanticKind, GraphNodeDto[]>();
  for (const item of related.sort((a, b) => scoreNode(b) - scoreNode(a))) {
    const kind = semanticKind(item);
    if (!grouped.has(kind)) grouped.set(kind, []);
    grouped.get(kind)!.push(item);
  }
  return [...grouped.entries()].map(([kind, items]) => ({
    kind,
    label: semanticLabels[kind],
    items: items.slice(0, 8),
  }));
});

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];
  return canonicalNodes.value
    .filter((node) =>
      `${node.label} ${node.id} ${node.description} ${node.stock_codes.join(" ")}`
        .toLowerCase()
        .includes(query),
    )
    .slice(0, 8);
});

const breadcrumb = computed(() => {
  const trail = ["Overview"];
  if (selectedNode.value) trail.push(selectedNode.value.label);
  return trail;
});

function mergeResponse(next: GraphExploreResponse, replace = false) {
  const nodes = replace ? new Map<string, GraphNodeDto>() : new Map(graph.value.nodes.map((n) => [n.id, n]));
  const edges = replace ? new Map<string, GraphEdgeDto>() : new Map(graph.value.edges.map((e) => [e.id, e]));
  const articles = replace
    ? new Map<string, GraphArticleDto>()
    : new Map(graph.value.articles.map((a) => [a.id, a]));
  next.nodes.forEach((item) => nodes.set(item.id, item));
  next.edges.forEach((item) => edges.set(item.id, item));
  next.articles.forEach((item) => articles.set(item.id, item));
  graph.value = {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    articles: [...articles.values()],
    analytics: next.analytics,
  };
}

async function loadGraph(nodeId?: string) {
  const key = `${props.stockCodes.join(",")}:${nodeId ?? "overview"}:${nodeId ? graphDepth.value : 2}`;
  const cached = graphCache.get(key);
  if (cached) {
    mergeResponse(cached, !nodeId);
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    const response = await apiClient.exploreGraph(props.stockCodes, {
      nodeId,
      depth: nodeId ? graphDepth.value : 2,
      limit: nodeId ? 120 : 160,
    });
    graphCache.set(key, response);
    mergeResponse(response, !nodeId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Gagal memuat knowledge graph.";
  } finally {
    loading.value = false;
  }
}

function syncSimulationNodes() {
  const previous = new Map(simNodes.value.map((node) => [node.id, node]));
  const next = visibleNodeDtos.value.map((node) => {
    const existing = previous.get(node.id);
    if (existing) return Object.assign(existing, node);
    const theta = hashSeed(`${node.id}:theta`) * Math.PI * 2;
    const phi = hashSeed(`${node.id}:phi`) * Math.PI;
    const radius = graphMode.value === "focus" ? 80 + hashSeed(`${node.id}:radius`) * 80 : 90 + hashSeed(`${node.id}:radius`) * 100;
    return {
      ...node,
      x: Math.cos(theta) * Math.sin(phi) * radius,
      y: Math.sin(theta) * Math.sin(phi) * radius,
      z: Math.cos(phi) * radius,
      vx: 0,
      vy: 0,
      vz: 0,
    };
  });
  simNodes.value = next;
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

function simulate(dt: number) {
  const nodes = simNodes.value;
  const index = simNodeMap.value;
  const step = Math.min(dt, 32) / 16.67;

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const distSq = Math.max(42, dx * dx + dy * dy + dz * dz);
      const dist = Math.sqrt(distSq);
      const minDistance = 32 + Math.min(24, a.degree + b.degree);
      const strength = dist < minDistance ? -3.2 : -520 / distSq;
      const fx = (dx / dist) * strength * step;
      const fy = (dy / dist) * strength * step;
      const fz = (dz / dist) * strength * step;
      a.vx += fx;
      a.vy += fy;
      a.vz += fz;
      b.vx -= fx;
      b.vy -= fy;
      b.vz -= fz;
    }
  }

  visibleEdges.value.forEach((edge) => {
    const a = index.get(edge.source);
    const b = index.get(edge.target);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const ideal = edge.source_ids.length > 2 ? 58 : 74;
    const pull = (dist - ideal) * 0.0024 * step;
    a.vx += (dx / dist) * pull;
    a.vy += (dy / dist) * pull;
    a.vz += (dz / dist) * pull;
    b.vx -= (dx / dist) * pull;
    b.vy -= (dy / dist) * pull;
    b.vz -= (dz / dist) * pull;
  });

  nodes.forEach((node) => {
    const selectedPull = selectedNodeId.value === node.id ? 0.0015 : 0;
    const articleOffset = node.type === "article" ? 44 : node.type === "financial" ? -24 : 0;
    node.vx += (-node.x + articleOffset) * (0.00028 + selectedPull) * step;
    node.vy += -node.y * (0.00028 + selectedPull) * step;
    node.vz += -node.z * 0.00028 * step;
    node.vx *= 0.9;
    node.vy *= 0.9;
    node.vz *= 0.9;
    node.x += node.vx * step;
    node.y += node.vy * step;
    node.z += node.vz * step;
  });
}

function truncate(value: string, max = 26) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function project(node: SimNode, width: number, height: number): ProjectedNode {
  const x0 = node.x - focusX;
  const y0 = node.y - focusY;
  const z0 = node.z - focusZ;
  const sinY = Math.sin(rotationY);
  const cosY = Math.cos(rotationY);
  const sinX = Math.sin(rotationX);
  const cosX = Math.cos(rotationX);
  const x1 = x0 * cosY - z0 * sinY;
  const z1 = x0 * sinY + z0 * cosY;
  const y1 = y0 * cosX - z1 * sinX;
  const z2 = y0 * sinX + z1 * cosX;
  const camera = 370;
  const scale = (camera / Math.max(130, camera + z2 + 140)) * zoom;
  const baseRadius =
    node.type === "stock" ? 10 : node.type === "company" ? 8 : node.type === "article" ? 4.5 : node.type === "person" ? 5 : 6.4;
  const selectedBoost = selectedNodeId.value === node.id ? 4 : 0;
  return {
    ...node,
    px: width / 2 + panX + x1 * scale,
    py: height / 2 + panY + y1 * scale,
    scale,
    radius: Math.max(3, (baseRadius + selectedBoost + Math.min(5, node.degree * 0.34)) * scale),
    depth: z2,
  };
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  if (!dx && !dy) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function shouldShowLabel(node: ProjectedNode): boolean {
  if (selectedNodeId.value === node.id || hoveredNodeId.value === node.id) return true;
  if (node.type === "stock" || node.type === "company") return true;
  if (graphMode.value === "focus" && node.degree >= 4) return true;
  return zoom > 1.55 && node.radius > 6.5;
}

function draw(time: number) {
  const canvas = canvasRef.value;
  if (!canvas) {
    frame = requestAnimationFrame(draw);
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const dt = lastTime ? time - lastTime : 16;
  lastTime = time;
  simulate(dt);
  focusX += (targetFocusX - focusX) * 0.08;
  focusY += (targetFocusY - focusY) * 0.08;
  focusZ += (targetFocusZ - focusZ) * 0.08;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  projectedNodes = simNodes.value.map((node) => project(node, width, height));
  const projectedMap = new Map(projectedNodes.map((node) => [node.id, node]));
  const selected = selectedNodeId.value;

  visibleEdges.value.forEach((edge) => {
    const a = projectedMap.get(edge.source);
    const b = projectedMap.get(edge.target);
    if (!a || !b) return;
    const active = selectedEdgeId.value === edge.id || hoveredEdgeId.value === edge.id;
    const focused = selected === edge.source || selected === edge.target;
    ctx.strokeStyle = active
      ? "rgba(120, 173, 255, .96)"
      : focused
        ? "rgba(115, 160, 238, .76)"
        : selected
          ? "rgba(162, 184, 222, .16)"
          : "rgba(162, 184, 222, .28)";
    ctx.lineWidth = Math.min(3.4, (active ? 1.8 : focused ? 1.3 : 0.7) + edge.evidenceCount * 0.22);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    if (edge.evidenceCount > 1 && (active || focused)) {
      const mx = (a.px + b.px) / 2;
      const my = (a.py + b.py) / 2;
      ctx.fillStyle = "rgba(8, 13, 22, .9)";
      ctx.beginPath();
      ctx.arc(mx, my, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d9e8ff";
      ctx.font = "700 8px Plus Jakarta Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(edge.evidenceCount), mx, my + 3);
    }
    if (active || (focused && zoom > 1.08)) {
      const mx = (a.px + b.px) / 2;
      const my = (a.py + b.py) / 2 - 12;
      ctx.font = "10px Plus Jakarta Sans, sans-serif";
      ctx.textAlign = "center";
      const label = truncate(edge.type, 18);
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(10, 15, 25, .86)";
      ctx.fillRect(mx - textWidth / 2 - 4, my - 7, textWidth + 8, 14);
      ctx.fillStyle = "#cfddf7";
      ctx.fillText(label, mx, my + 3);
    }
  });

  projectedNodes
    .slice()
    .sort((a, b) => a.depth - b.depth)
    .forEach((node) => {
      const active = selectedNodeId.value === node.id;
      const hovered = hoveredNodeId.value === node.id;
      const connected =
        !selectedNodeId.value ||
        active ||
        visibleEdges.value.some((edge) =>
          (edge.source === selectedNodeId.value && edge.target === node.id) ||
          (edge.target === selectedNodeId.value && edge.source === node.id),
        );
      ctx.globalAlpha = selectedNodeId.value && !connected ? 0.34 : 1;
      ctx.beginPath();
      ctx.shadowColor = palette[node.type];
      ctx.shadowBlur = active ? 20 : hovered ? 13 : node.type === "stock" || node.type === "company" ? 7 : 4;
      ctx.fillStyle = palette[node.type];
      ctx.arc(node.px, node.py, node.radius + (active ? 2 : hovered ? 1 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (active) {
        ctx.strokeStyle = "rgba(235, 246, 255, .96)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (node.source_count > 0 && node.type !== "article") {
        ctx.beginPath();
        ctx.fillStyle = "#0f1726";
        ctx.strokeStyle = "#dbe8ff";
        ctx.lineWidth = 1;
        ctx.arc(node.px + node.radius, node.py - node.radius, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = "700 7px Plus Jakarta Sans, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.fillText(String(node.source_count), node.px + node.radius, node.py - node.radius + 2.5);
      }
      if (shouldShowLabel(node)) {
        const label = active || hovered ? node.label : truncate(node.label);
        ctx.font = `${active ? "800" : "650"} 10px Plus Jakarta Sans, sans-serif`;
        ctx.textAlign = "left";
        const x = node.px + node.radius + 7;
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(10, 15, 25, .88)";
        ctx.fillRect(x - 3, node.py - 8, textWidth + 7, 16);
        ctx.fillStyle = "#edf4ff";
        ctx.fillText(label, x, node.py + 3);
      }
      ctx.globalAlpha = 1;
    });
  frame = requestAnimationFrame(draw);
}

function pickNode(x: number, y: number): ProjectedNode | null {
  return (
    projectedNodes
      .slice()
      .sort((a, b) => b.depth - a.depth)
      .find((node) => Math.hypot(x - node.px, y - node.py) <= node.radius + 7) ?? null
  );
}

function pickEdge(x: number, y: number): RankedEdge | null {
  const map = new Map(projectedNodes.map((node) => [node.id, node]));
  return (
    visibleEdges.value.find((edge) => {
      const a = map.get(edge.source);
      const b = map.get(edge.target);
      return a && b && distanceToSegment(x, y, a.px, a.py, b.px, b.py) < 6;
    }) ?? null
  );
}

function localPointer(event: PointerEvent | MouseEvent) {
  const rect = canvasRef.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function focusNode(node: SimNode | GraphNodeDto) {
  const simNode = simNodeMap.value.get(node.id);
  if (!simNode) return;
  targetFocusX = simNode.x;
  targetFocusY = simNode.y;
  targetFocusZ = simNode.z;
  zoom = Math.max(1.25, zoom);
}

async function selectNode(node: SimNode | GraphNodeDto | null) {
  if (!node) return;
  selectedNodeId.value = node.id;
  selectedEdgeId.value = null;
  graphMode.value = "focus";
  sourcePreview.value = null;
  extraVisibleCount.value = 0;
  await nextTick();
  focusNode(node);
}

function resetOverview() {
  graphMode.value = "overview";
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  searchQuery.value = "";
  sourcePreview.value = null;
  extraVisibleCount.value = 0;
  targetFocusX = 0;
  targetFocusY = 0;
  targetFocusZ = 0;
  panX = 0;
  panY = 0;
  zoom = 1;
}

function clearSelection() {
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  sourcePreview.value = null;
}

function setDepth(depth: 1 | 2) {
  graphDepth.value = depth;
  graphMode.value = selectedNodeId.value ? "focus" : graphMode.value;
  extraVisibleCount.value = 0;
}

function showMore() {
  extraVisibleCount.value += SHOW_MORE_STEP;
}

function onPointerDown(event: PointerEvent) {
  dragging = true;
  moved = false;
  pointerX = event.clientX;
  pointerY = event.clientY;
  dragMode = event.shiftKey || event.button === 2 ? "pan" : "rotate";
  canvasRef.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  const point = localPointer(event);
  if (!dragging) {
    hoveredNodeId.value = pickNode(point.x, point.y)?.id ?? null;
    hoveredEdgeId.value = hoveredNodeId.value ? null : pickEdge(point.x, point.y)?.id ?? null;
    return;
  }
  const dx = event.clientX - pointerX;
  const dy = event.clientY - pointerY;
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
  if (dragMode === "pan") {
    panX += dx;
    panY += dy;
  } else {
    rotationY += dx * 0.009;
    rotationX = Math.max(-1.2, Math.min(1.2, rotationX + dy * 0.008));
  }
}

function onPointerUp(event: PointerEvent) {
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId);
  }
  dragging = false;
  if (moved) return;
  const point = localPointer(event);
  const node = pickNode(point.x, point.y);
  const edge = node ? null : pickEdge(point.x, point.y);
  if (node) void selectNode(node);
  selectedEdgeId.value = edge?.id ?? null;
}

async function onDoubleClick(event: MouseEvent) {
  const point = localPointer(event);
  const node = pickNode(point.x, point.y);
  if (node) {
    await selectNode(node);
    await loadGraph(node.id);
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  zoom = Math.max(0.55, Math.min(3.2, zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
}

async function toggleFullscreen() {
  fullscreen.value = !fullscreen.value;
  await nextTick();
  resizeCanvas();
}

function showSources(items: GraphArticleDto[]) {
  sourcePreview.value = items;
}

function previewSource(article: GraphArticleDto) {
  sourcePreview.value = [article];
}

watch(visibleNodeDtos, () => {
  syncSimulationNodes();
  void nextTick(resizeCanvas);
}, { immediate: true });

watch(
  () => `${props.stockCodes.join(",")}:${props.refreshKey ?? 0}`,
  () => {
    graphCache.clear();
    resetOverview();
    void loadGraph();
  },
  { immediate: true },
);

onMounted(() => {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  frame = requestAnimationFrame(draw);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvas);
  cancelAnimationFrame(frame);
});
</script>

<template>
  <section class="graph-explorer" :class="{ fullscreen }">
    <header class="graph-toolbar">
      <div>
        <strong>Knowledge Graph Explorer</strong>
        <span>
          {{ visibleNodeDtos.length }}/{{ graph.analytics.node_count }} node visible ·
          {{ visibleEdges.length }}/{{ graph.analytics.relationship_count }} relasi
        </span>
      </div>
      <div class="toolbar-actions">
        <button type="button" title="Reset to overview" @click="resetOverview"><i class="pi pi-refresh" /></button>
        <button type="button" :title="fullscreen ? 'Tutup fullscreen' : 'Buka fullscreen'" @click="toggleFullscreen">
          <i :class="fullscreen ? 'pi pi-window-minimize' : 'pi pi-window-maximize'" />
        </button>
      </div>
    </header>

    <div class="graph-breadcrumb">
      <button
        v-for="(item, index) in breadcrumb"
        :key="`${item}-${index}`"
        type="button"
        :disabled="index === breadcrumb.length - 1"
        @click="index === 0 && resetOverview()"
      >
        {{ truncate(item, 18) }}
      </button>
    </div>

    <div class="graph-layout">
      <div class="canvas-shell">
        <canvas
          ref="canvasRef"
          class="graph-canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dblclick="onDoubleClick"
          @wheel="onWheel"
          @contextmenu.prevent
        />
        <div v-if="loading" class="graph-state"><i class="pi pi-spin pi-spinner" /> Memuat graph...</div>
        <div v-else-if="error" class="graph-state error">{{ error }}</div>
        <div v-else-if="!graph.nodes.length" class="graph-state">
          Belum ada provenance graph. Jalankan analisis untuk membangun artikel dan relasi.
        </div>

        <div class="graph-chip-row">
          <span>{{ graphMode === "focus" ? "Focus graph" : "Overview" }}</span>
          <span v-if="evidenceSummary.hidden > 0">
            {{ evidenceSummary.hidden }} evidence tersembunyi
          </span>
        </div>

        <div class="graph-help">Drag: rotate · Shift/right drag: pan · Scroll: zoom · Double-click: expand</div>

        <div v-if="hoveredNode && !dragging" class="node-tooltip">
          <strong>{{ hoveredNode.label }}</strong>
          <span>{{ semanticLabels[semanticKind(hoveredNode)] }} · degree {{ hoveredNode.degree }}</span>
          <span>{{ hoveredNode.source_count }} evidence · {{ adjacency.get(hoveredNode.id)?.length ?? 0 }} relasi</span>
          <p v-if="hoveredNode.description">{{ truncate(hoveredNode.description, 96) }}</p>
        </div>

        <div class="graph-legend" :class="{ collapsed: legendCollapsed }">
          <button type="button" class="legend-toggle" @click="legendCollapsed = !legendCollapsed">
            <span>Legend</span>
            <i :class="legendCollapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'" />
          </button>
          <div class="legend-panel">
            <span v-for="kind in Object.keys(palette) as GraphNodeKind[]" :key="kind" class="legend-item">
              <i :style="{ background: palette[kind] }" />
              <span class="legend-label">{{ semanticLabels[kind] }}</span>
            </span>
          </div>
        </div>
      </div>

      <aside class="graph-focus-panel">
        <label class="entity-search">
          <span>Search Entity</span>
          <input v-model="searchQuery" type="search" placeholder="Search stock, company, event, policy..." />
        </label>
        <div v-if="searchQuery" class="search-results">
          <button
            v-for="item in searchResults"
            :key="item.id"
            type="button"
            @click="selectNode(item); searchQuery = ''"
          >
            <i :style="{ background: palette[item.type] }" />
            <span>{{ item.label }}</span>
            <small>{{ semanticLabels[semanticKind(item)] }}</small>
          </button>
          <p v-if="!searchResults.length">Entitas tidak ditemukan.</p>
        </div>

        <section class="panel-section">
          <small>Focused Entity</small>
          <h4>{{ selectedNode?.label ?? "Overview" }}</h4>
          <p v-if="selectedNode?.description">{{ selectedNode.description }}</p>
          <p v-else>{{ evidenceSummary.total }} sumber tersedia sebagai evidence pendukung.</p>
          <div class="panel-actions">
            <button type="button" :disabled="!selectedNode" @click="selectedNode && selectNode(selectedNode)">
              Focus Graph
            </button>
            <button type="button" @click="resetOverview">Reset</button>
            <button type="button" :disabled="!selectedNode && !selectedEdge" @click="clearSelection">Clear</button>
          </div>
        </section>

        <section class="panel-section compact">
          <small>Graph Depth</small>
          <div class="segmented">
            <button type="button" :class="{ active: graphDepth === 1 }" @click="setDepth(1)">1 Hop</button>
            <button type="button" :class="{ active: graphDepth === 2 }" @click="setDepth(2)">2 Hops</button>
          </div>
        </section>

        <section class="panel-section">
          <small>Entity Type Filters</small>
          <div class="filter-grid">
            <button
              v-for="kind in filterOptions"
              :key="kind"
              type="button"
              :class="{ active: activeTypeFilter === kind }"
              @click="activeTypeFilter = kind"
            >
              {{ semanticLabels[kind] }}
            </button>
          </div>
          <div class="toggle-list">
            <label><input v-model="hideArticleNodes" type="checkbox" /> Hide article nodes</label>
            <label><input v-model="showEvidenceNodes" type="checkbox" /> Show evidence</label>
            <label><input v-model="highConfidenceOnly" type="checkbox" /> High confidence only</label>
            <label><input v-model="hideLowEvidenceRelations" type="checkbox" /> Hide low-evidence relations</label>
          </div>
        </section>

        <section v-if="selectedNode && relatedGroups.length" class="panel-section">
          <small>Related Entities</small>
          <div v-for="group in relatedGroups" :key="group.kind" class="related-group">
            <h5>{{ group.label }}</h5>
            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              @click="selectNode(item)"
            >
              <i :style="{ background: palette[item.type] }" />
              <span>{{ item.label }}</span>
              <b>{{ item.source_count || item.degree }}</b>
            </button>
          </div>
        </section>

        <section class="panel-section">
          <small>Evidence / Sources</small>
          <button
            v-if="selectedSources.length"
            type="button"
            class="source-badge"
            @click="showSources(selectedSources)"
          >
            <i class="pi pi-link" /> {{ selectedSources.length }} sumber untuk selection
          </button>
          <div class="evidence-summary">
            <span>{{ evidenceSummary.total }} sumber</span>
            <span>{{ evidenceSummary.news }} berita terkait</span>
            <span>{{ evidenceSummary.reports }} laporan keuangan</span>
          </div>
          <div class="evidence-list">
            <button
              v-for="article in (selectedSources.length ? selectedSources : graph.articles).slice(0, 5)"
              :key="article.id"
              type="button"
              @click="previewSource(article)"
            >
              <span>{{ article.title }}</span>
              <small>{{ article.publisher || "Sumber" }} · {{ article.publication_date || article.year }}</small>
            </button>
          </div>
        </section>

        <button
          v-if="visibleNodeDtos.length < graph.nodes.length"
          type="button"
          class="show-more-btn"
          @click="showMore"
        >
          Show more
        </button>
      </aside>
    </div>

    <div v-if="sourcePreview" class="source-drawer">
      <header>
        <div><strong>Supporting Evidence</strong><span>{{ sourcePreview.length }} sumber</span></div>
        <button type="button" @click="sourcePreview = null"><i class="pi pi-times" /></button>
      </header>
      <article v-for="article in sourcePreview" :key="article.id">
        <a :href="article.url" target="_blank" rel="noopener noreferrer">
          {{ article.title }} <i class="pi pi-arrow-up-right" />
        </a>
        <p>{{ article.publisher || "Sumber" }} · {{ article.publication_date || article.year }}</p>
        <blockquote>{{ article.summary }}</blockquote>
      </article>
    </div>
  </section>
</template>

<style scoped>
.graph-explorer {
  position: relative;
  min-width: 0;
  color: #dfe9fa;
}

.graph-explorer.fullscreen {
  position: fixed;
  inset: 16px;
  z-index: 150;
  border: 1px solid rgba(145, 174, 226, 0.24);
  border-radius: 18px;
  background: #10151f;
  padding: 14px;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.62);
}

.graph-toolbar,
.source-drawer header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.graph-toolbar {
  margin-bottom: 8px;
}

.graph-toolbar > div:first-child {
  display: grid;
  gap: 2px;
}

.graph-toolbar strong {
  font-size: 12px;
  color: #eef4ff;
}

.graph-toolbar span,
.graph-breadcrumb button {
  font-size: 10px;
  color: #94a5c2;
}

.toolbar-actions {
  display: flex;
  gap: 6px;
}

.toolbar-actions button,
.source-drawer header button,
.graph-legend button {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #dce8fb;
  cursor: pointer;
}

.graph-breadcrumb {
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.graph-breadcrumb button {
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.graph-breadcrumb button:not(:last-child)::after {
  content: ">";
  margin-left: 6px;
  color: #5f718f;
}

.graph-breadcrumb button:disabled {
  color: #dce8fb;
  cursor: default;
}

.graph-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.fullscreen .graph-layout {
  grid-template-columns: minmax(0, 1fr) 340px;
  height: calc(100% - 70px);
}

.canvas-shell {
  position: relative;
  min-width: 0;
  height: 300px;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(174, 199, 240, 0.14);
  background: radial-gradient(circle at 50% 42%, #1e2a3d 0%, #151b27 48%, #0d1119 100%);
}

.fullscreen .canvas-shell {
  height: 100%;
  min-height: 520px;
}

.graph-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  touch-action: none;
}

.graph-canvas:active {
  cursor: grabbing;
}

.graph-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 30px;
  color: #aebbd1;
  font-size: 12px;
  text-align: center;
  pointer-events: none;
}

.graph-state.error {
  color: #ffb4ba;
}

.graph-chip-row {
  position: absolute;
  left: 8px;
  top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  pointer-events: none;
}

.graph-chip-row span {
  border: 1px solid rgba(141, 176, 235, 0.22);
  border-radius: 999px;
  background: rgba(5, 9, 15, 0.68);
  color: #c9d8ee;
  padding: 3px 7px;
  font-size: 8px;
  font-weight: 700;
}

.graph-help {
  position: absolute;
  left: 9px;
  bottom: 8px;
  padding: 4px 7px;
  border-radius: 6px;
  background: rgba(5, 9, 15, 0.72);
  color: #8798b6;
  font-size: 8px;
  pointer-events: none;
}

.node-tooltip {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: min(270px, calc(100% - 16px));
  border: 1px solid rgba(141, 176, 235, 0.22);
  border-radius: 9px;
  background: rgba(8, 13, 22, 0.92);
  padding: 9px;
  display: grid;
  gap: 4px;
  pointer-events: none;
}

.node-tooltip strong {
  color: #e9f2ff;
  font-size: 10px;
}

.node-tooltip span,
.node-tooltip p {
  margin: 0;
  color: #aebdd3;
  font-size: 9px;
  line-height: 1.4;
}

.graph-legend {
  position: absolute;
  top: 8px;
  right: 8px;
  width: min(260px, calc(100% - 16px));
  display: grid;
  justify-items: end;
  gap: 6px;
}

.graph-legend .legend-toggle {
  width: 118px;
  height: 32px;
  padding: 0 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px;
  align-items: center;
  justify-items: start;
  gap: 8px;
  font-size: 10px;
  font-weight: 750;
}

.graph-legend .legend-toggle span {
  min-width: 0;
  color: #dce8fb;
  white-space: nowrap;
}

.graph-legend .legend-toggle i {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  color: #dce8fb;
  font-size: 12px;
}

.legend-panel {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 10px;
  padding: 9px 10px;
  border: 1px solid rgba(141, 176, 235, 0.22);
  border-radius: 10px;
  background: rgba(8, 13, 22, 0.86);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.26);
}

.graph-legend.collapsed .legend-panel {
  display: none;
}

.legend-item,
.related-group button,
.search-results button {
  min-width: 0;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 8px;
  color: #b5c4dc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-panel i,
.related-group i,
.search-results i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}

.graph-focus-panel {
  min-width: 0;
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid rgba(172, 198, 240, 0.14);
  border-radius: 12px;
  background: rgba(20, 26, 38, 0.96);
  padding: 12px;
  color: #dfe9fa;
  display: grid;
  gap: 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(102, 163, 255, 0.75) rgba(255, 255, 255, 0.06);
}

.fullscreen .graph-focus-panel {
  position: sticky;
  top: 0;
  max-height: 100%;
}

.entity-search {
  display: grid;
  gap: 6px;
}

.entity-search span,
.panel-section small {
  color: #9eabc0;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.entity-search input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
  color: #f4f7fe;
  padding: 8px 9px;
  font: inherit;
  font-size: 11px;
  outline: none;
}

.search-results,
.panel-section,
.related-group,
.evidence-list {
  display: grid;
  gap: 6px;
}

.search-results {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.035);
}

.search-results p {
  margin: 0;
  color: #9eabc0;
  font-size: 10px;
}

.search-results button,
.related-group button,
.evidence-list button,
.panel-actions button,
.filter-grid button,
.segmented button,
.show-more-btn {
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
  color: #dce8fb;
  cursor: pointer;
  font: inherit;
}

.search-results button,
.related-group button {
  width: 100%;
  padding: 7px 8px;
  display: flex;
  align-items: center;
  gap: 7px;
  text-align: left;
  font-size: 10px;
}

.search-results button span,
.related-group button span,
.evidence-list button span {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-results small {
  color: #8fa2c0;
  font-size: 8px;
}

.panel-section {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 10px;
}

.panel-section:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.panel-section h4 {
  margin: 3px 0 0;
  font-size: 14px;
  line-height: 1.35;
  color: #f4f7fe;
}

.panel-section h5 {
  margin: 4px 0 0;
  color: #aebdd6;
  font-size: 10px;
}

.panel-section p {
  margin: 0;
  color: #aebdd3;
  font-size: 10px;
  line-height: 1.45;
}

.panel-actions,
.segmented,
.filter-grid,
.toggle-list,
.evidence-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.panel-actions button,
.segmented button,
.filter-grid button,
.show-more-btn {
  padding: 6px 8px;
  font-size: 10px;
  font-weight: 750;
}

.panel-actions button:first-child,
.segmented button.active,
.filter-grid button.active,
.show-more-btn {
  background: #2b76f6;
  color: #fff;
}

.panel-actions button:disabled {
  opacity: 0.45;
  cursor: default;
}

.toggle-list {
  display: grid;
  gap: 6px;
}

.toggle-list label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #cbd8ed;
  font-size: 10px;
}

.toggle-list input {
  accent-color: #2b76f6;
}

.related-group button b {
  color: #7eb0ff;
  font-size: 9px;
}

.source-badge {
  width: fit-content;
  border: 1px solid rgba(93, 153, 255, 0.35);
  border-radius: 8px;
  background: rgba(43, 122, 251, 0.13);
  color: #a9ceff;
  padding: 7px 9px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.evidence-summary span {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.055);
  color: #c9d8ee;
  padding: 4px 7px;
  font-size: 9px;
}

.evidence-list button {
  padding: 7px 8px;
  display: grid;
  gap: 3px;
  text-align: left;
}

.evidence-list small {
  color: #8fa2c0;
  font-size: 8px;
}

.source-drawer {
  position: absolute;
  inset: 42px 8px 8px auto;
  z-index: 5;
  width: min(380px, calc(100% - 16px));
  overflow-y: auto;
  border: 1px solid rgba(162, 190, 238, 0.24);
  border-radius: 12px;
  background: rgba(13, 18, 27, 0.98);
  padding: 12px;
  box-shadow: -16px 18px 40px rgba(0, 0, 0, 0.38);
}

.source-drawer header {
  margin-bottom: 8px;
}

.source-drawer header > div {
  display: grid;
}

.source-drawer header strong {
  font-size: 12px;
}

.source-drawer header span {
  color: #8798b4;
  font-size: 9px;
}

.source-drawer article {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 10px 0;
}

.source-drawer article a {
  color: #8bb9ff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.45;
  text-decoration: none;
}

.source-drawer article p {
  margin: 4px 0;
  color: #8d9db8;
  font-size: 9px;
}

.source-drawer blockquote {
  margin: 7px 0 0;
  padding-left: 9px;
  border-left: 2px solid #477ed7;
  color: #b4c1d6;
  font-size: 10px;
  line-height: 1.5;
}

@media (max-width: 760px) {
  .graph-explorer.fullscreen {
    inset: 0;
    border-radius: 0;
  }

  .fullscreen .graph-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(360px, 1fr) auto;
  }

  .fullscreen .canvas-shell {
    min-height: 360px;
  }

  .graph-focus-panel {
    max-height: 300px;
  }
}
</style>
