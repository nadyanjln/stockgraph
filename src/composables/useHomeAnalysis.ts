import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { QUICK_ACTIONS, buildRecommendations } from "@/constants/quickActions";
import { useChatSession } from "@/stores/useChatSession";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function useHomeAnalysis() {
  const router = useRouter();
  const { state: sessionState, runAnalysis } = useChatSession();

  const selectedCodes = ref<string[]>([]);
  const maxArticles = ref(5);
  const threshold = ref(0.5);
  const question = ref("");
  const activeAction = ref<string | null>(null);

  const thresholdModel = computed({
    get: () => Math.round(threshold.value * 10),
    set: (value: number) => {
      threshold.value = Number((clamp(value, 0, 10) / 10).toFixed(2));
    },
  });

  const visibleRecommendations = computed(() => {
    if (!activeAction.value) return [];
    return buildRecommendations(activeAction.value, selectedCodes.value);
  });

  function applyRecommendation(text: string) {
    question.value = text;
  }

  function showRecommendations(label: string) {
    activeAction.value = label;
  }

  function hideRecommendations() {
    activeAction.value = null;
  }

  function submitQuestion() {
    if (!question.value.trim() || sessionState.pipelineLoading) return;

    const codes = selectedCodes.value.map((code) => code.trim().toUpperCase()).filter(Boolean);
    if (!codes.length) return;

    const params = {
      stockCodes: codes,
      question: question.value,
      maxArticles: maxArticles.value,
      threshold: threshold.value,
    };

    runAnalysis(params);

    router.push({
      name: "result",
      query: {
        code: codes.join(","),
        question: question.value,
        maxArticles: String(maxArticles.value),
        threshold: threshold.value.toFixed(2),
      },
    });
  }

  return {
    sessionState,
    selectedCodes,
    maxArticles,
    thresholdModel,
    question,
    quickActions: QUICK_ACTIONS,
    activeAction,
    visibleRecommendations,
    applyRecommendation,
    showRecommendations,
    hideRecommendations,
    submitQuestion,
  };
}
