<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { SourceItem } from "@/types/chat";

const props = defineProps<{
  source: SourceItem | null;
  citationIndex: number;
}>();

const emit = defineEmits<{
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
let previousActiveElement: HTMLElement | null = null;
let previousBodyOverflow = "";
let isModalOpen = false;

const sourceUrl = computed(() => {
  const raw = props.source?.url?.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
});

const sourceLabel = computed(() =>
  props.source?.source_type === "financial_report"
    ? "Laporan Keuangan IDX"
    : props.source?.source_type === "news"
      ? "Berita"
      : "Sumber",
);

const sourcePublisher = computed(() => {
  if (props.source?.source_name) return props.source.source_name;
  try {
    return sourceUrl.value ? new URL(sourceUrl.value).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
});

const sourcePeriod = computed(() => {
  if (props.source?.reporting_period) return props.source.reporting_period;
  const rawDate = props.source?.publication_date;
  if (!rawDate) return "";
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return rawDate;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
});

const excerpt = computed(
  () => props.source?.snippet || props.source?.retrieved_text || "",
);

const ctaLabel = computed(() =>
  props.source?.source_type === "financial_report"
    ? "Buka laporan IDX"
    : "Buka artikel asli",
);

function close() {
  emit("close");
}

function focusableElements(): HTMLElement[] {
  if (!dialogRef.value) return [];
  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = focusableElements();
  if (!focusable.length) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.source,
  async (source) => {
    if (source && !isModalOpen) {
      isModalOpen = true;
      previousActiveElement = document.activeElement as HTMLElement | null;
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeydown);
      await nextTick();
      closeButtonRef.value?.focus();
    } else if (!source && isModalOpen) {
      isModalOpen = false;
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeydown);
      previousActiveElement?.focus();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (isModalOpen) document.body.style.overflow = previousBodyOverflow;
  document.removeEventListener("keydown", handleKeydown);
  if (isModalOpen) previousActiveElement?.focus();
  isModalOpen = false;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="source-modal">
      <div
        v-if="source"
        class="source-modal-layer"
        data-testid="source-modal-layer"
        @mousedown.self="close"
      >
        <section
          ref="dialogRef"
          class="source-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-modal-title"
          aria-describedby="source-modal-excerpt"
        >
          <header class="source-modal__header">
            <div class="source-modal__identity">
              <span class="source-modal__citation">[{{ citationIndex }}]</span>
              <span class="source-modal__kind">{{ sourceLabel }}</span>
            </div>
            <button
              ref="closeButtonRef"
              type="button"
              class="source-modal__close"
              aria-label="Tutup detail sumber"
              @click="close"
            >
              <i class="pi pi-times" aria-hidden="true" />
            </button>
          </header>

          <div class="source-modal__scroll">
            <a
              v-if="sourceUrl"
              id="source-modal-title"
              class="source-modal__title source-modal__title--link"
              :href="sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ source.title || sourceUrl }}
            </a>
            <h2 v-else id="source-modal-title" class="source-modal__title">
              {{ source.title || "Detail sumber" }}
            </h2>

            <div class="source-modal__meta">
              <span v-if="sourcePublisher">
                <i class="pi pi-building" aria-hidden="true" />
                {{ sourcePublisher }}
              </span>
              <span v-if="sourcePeriod">
                <i class="pi pi-calendar" aria-hidden="true" />
                {{ sourcePeriod }}
              </span>
            </div>

            <blockquote v-if="excerpt" id="source-modal-excerpt">
              {{ excerpt }}
            </blockquote>
            <p v-else id="source-modal-excerpt" class="source-modal__empty">
              Ringkasan sumber belum tersedia.
            </p>
          </div>

          <footer class="source-modal__footer">
            <a
              v-if="sourceUrl"
              class="source-modal__cta"
              :href="sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ ctaLabel }}
              <i class="pi pi-external-link" aria-hidden="true" />
            </a>
            <span v-else class="source-modal__unavailable">
              <i class="pi pi-link" aria-hidden="true" />
              Tautan sumber tidak tersedia
            </span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.source-modal-layer {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(7, 10, 16, 0.74);
  backdrop-filter: blur(8px);
}
.source-modal {
  width: min(640px, calc(100vw - 48px));
  max-height: calc(100dvh - 48px);
  border: 1px solid rgba(153, 178, 222, 0.24);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #eef3fc;
  background: linear-gradient(155deg, rgba(35, 39, 50, 0.99), rgba(19, 22, 30, 0.995));
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.58);
}
.source-modal__header,
.source-modal__footer {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  background: rgba(27, 31, 41, 0.97);
}
.source-modal__header {
  min-height: 64px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.source-modal__identity { display: flex; align-items: center; gap: 9px; }
.source-modal__citation { color: #89b2ff; font-size: 13px; font-weight: 800; }
.source-modal__kind { border-radius: 999px; padding: 4px 9px; color: #cfe0ff; background: rgba(65, 124, 234, 0.18); font-size: 10px; font-weight: 800; }
.source-modal__close { width: 36px; height: 36px; border: 0; border-radius: 10px; display: grid; place-items: center; color: #c3ccdc; background: rgba(255, 255, 255, 0.055); cursor: pointer; }
.source-modal__close:hover, .source-modal__close:focus-visible { color: #fff; background: rgba(255, 255, 255, 0.1); outline: 3px solid rgba(89, 145, 250, 0.18); }
.source-modal__scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 22px 22px 26px; }
.source-modal__title { margin: 0; color: #f5f7fc; font-size: clamp(18px, 2.5vw, 23px); line-height: 1.38; font-weight: 750; letter-spacing: -0.02em; }
.source-modal__title--link { display: block; text-decoration: none; }
.source-modal__title--link:hover { color: #91b7ff; }
.source-modal__meta { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px 16px; color: #aeb9cc; font-size: 12px; }
.source-modal__meta span { display: inline-flex; align-items: center; gap: 6px; }
.source-modal blockquote { margin: 22px 0 0; border-left: 3px solid #5b91f2; border-radius: 0 12px 12px 0; padding: 14px 16px; color: #d4ddeb; background: rgba(255, 255, 255, 0.045); font-size: 13px; line-height: 1.68; white-space: pre-wrap; overflow-wrap: anywhere; }
.source-modal__empty { margin: 22px 0 0; color: #929dad; font-size: 13px; }
.source-modal__footer { min-height: 70px; padding: 13px 18px; border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: flex-end; }
.source-modal__cta { min-height: 42px; padding: 0 16px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; color: #fff; background: #3478f6; font-size: 12px; font-weight: 750; text-decoration: none; box-shadow: 0 9px 20px rgba(41, 108, 230, 0.25); }
.source-modal__cta:hover { background: #4386ff; }
.source-modal__cta:focus-visible { outline: 3px solid rgba(91, 145, 242, 0.28); outline-offset: 2px; }
.source-modal__unavailable { color: #9ca6b5; font-size: 12px; display: inline-flex; align-items: center; gap: 7px; }
.source-modal-enter-active, .source-modal-leave-active { transition: opacity 0.18s ease; }
.source-modal-enter-active .source-modal, .source-modal-leave-active .source-modal { transition: opacity 0.18s ease, transform 0.18s ease; }
.source-modal-enter-from, .source-modal-leave-to { opacity: 0; }
.source-modal-enter-from .source-modal, .source-modal-leave-to .source-modal { opacity: 0; transform: translateY(8px) scale(0.975); }
@media (max-width: 640px) {
  .source-modal-layer { place-items: end center; padding: 12px; }
  .source-modal { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); border-radius: 20px; }
  .source-modal__header { padding: 12px 14px; }
  .source-modal__scroll { padding: 19px 16px 22px; }
  .source-modal__footer { padding: 12px 14px max(12px, env(safe-area-inset-bottom)); }
  .source-modal__cta { width: 100%; min-height: 46px; }
}
@media (prefers-reduced-motion: reduce) {
  .source-modal-enter-active,
  .source-modal-leave-active,
  .source-modal-enter-active .source-modal,
  .source-modal-leave-active .source-modal { transition: none; }
}
</style>
