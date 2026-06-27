<script setup lang="ts">
import { computed } from "vue";
import type { AnalysisProgressStep } from "@/types/chat";
import { activeProgressNote, activeProgressStep } from "@/utils/analysisProgress";

const props = defineProps<{
  title: string;
  note?: string;
  steps: AnalysisProgressStep[];
}>();

const activeStep = computed(() => activeProgressStep(props.steps));
const statusText = computed(() => activeProgressNote(props.steps, props.note));
const isLoading = computed(() => Boolean(activeStep.value));
const isError = computed(() => props.steps.some((step) => step.status === "failed"));
const isComplete = computed(
  () => !isLoading.value && !isError.value && props.steps.every((step) => step.status === "completed"),
);
const statusIcon = computed(() => {
  if (isError.value) return "pi pi-exclamation-circle";
  if (isComplete.value) return "pi pi-check";
  return "pi pi-sparkles";
});
</script>

<template>
  <section
    class="analysis-progress"
    :class="{ 'is-error': isError, 'is-complete': isComplete }"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <header class="analysis-progress__header">
      <span
        class="analysis-progress__mark"
        :class="{ 'is-error': isError, 'is-complete': isComplete }"
        aria-hidden="true"
      >
        <i :class="statusIcon" />
      </span>
      <div>
        <h3>{{ title }}</h3>
        <Transition name="progress-copy" mode="out-in">
          <p :key="activeStep?.stage || statusText">
            {{ statusText || "Analisis siap." }}
          </p>
        </Transition>
      </div>
      <span v-if="isLoading" class="analysis-progress__dots" aria-hidden="true">
        <i /><i /><i />
      </span>
    </header>
  </section>
</template>

<style scoped>
.analysis-progress {
  width: min(100%, 560px);
  color: #26334a;
}
.analysis-progress__header {
  min-height: 44px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
.analysis-progress__mark {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: #2567df;
  background: #e7efff;
}
.analysis-progress__mark.is-error {
  color: #a53c49;
  background: #fde8eb;
}
.analysis-progress__mark.is-complete {
  color: #22754d;
  background: #dff5e9;
}
.analysis-progress__header h3 {
  margin: 0;
  color: #182238;
  font-size: 13px;
  line-height: 1.35;
  font-weight: 780;
}
.analysis-progress__header p {
  min-height: 1.45em;
  margin: 3px 0 0;
  color: #6c7890;
  font-size: 10px;
  line-height: 1.45;
}
.analysis-progress__dots {
  display: inline-flex;
  gap: 3px;
}
.analysis-progress__dots i {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #3478f6;
  animation: progress-pulse 1.2s ease-in-out infinite;
}
.analysis-progress__dots i:nth-child(2) { animation-delay: 0.14s; }
.analysis-progress__dots i:nth-child(3) { animation-delay: 0.28s; }
.analysis-progress.is-error .analysis-progress__header p {
  color: #8b4a52;
}
.progress-copy-enter-active,
.progress-copy-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.progress-copy-enter-from,
.progress-copy-leave-to {
  opacity: 0;
  transform: translateY(3px);
}
@keyframes progress-pulse {
  0%, 60%, 100% { opacity: 0.35; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}
@media (max-width: 640px) {
  .analysis-progress__header {
    grid-template-columns: 32px minmax(0, 1fr) auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .analysis-progress__dots i { animation: none; opacity: 0.7; }
  .progress-copy-enter-active,
  .progress-copy-leave-active { transition: none; }
}
</style>
