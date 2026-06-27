<script setup lang="ts">
import { computed } from "vue";
import type { SourceItem } from "@/types/chat";

const props = defineProps<{
  source: SourceItem;
  citationIndex: number;
}>();

const emit = defineEmits<{
  preview: [];
}>();

const validUrl = computed(() => {
  const raw = props.source.url?.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
});

const sourceLabel = computed(() =>
  props.source.source_type === "financial_report"
    ? "Laporan Keuangan IDX"
    : props.source.source_type === "news"
      ? "Berita"
      : "Sumber",
);

const publisher = computed(() => {
  if (props.source.source_name) return props.source.source_name;
  try {
    return validUrl.value ? new URL(validUrl.value).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
});

const metadata = computed(
  () => publisher.value || props.source.reporting_period || props.source.publication_date || "",
);
</script>

<template>
  <article class="citation-card">
    <button
      type="button"
      class="citation-card__preview"
      :aria-label="`Lihat detail sumber ${citationIndex}: ${source.title || 'Sumber'}`"
      @click="emit('preview')"
    >
      <span class="citation-card__number">[{{ citationIndex }}]</span>
      <span class="citation-card__copy">
        <small class="citation-card__kind">{{ sourceLabel }}</small>
        <strong>{{ source.title || validUrl || "Detail sumber" }}</strong>
        <small v-if="metadata">{{ metadata }}</small>
        <small v-if="!validUrl" class="citation-card__unavailable">
          Tautan sumber tidak tersedia
        </small>
      </span>
      <i class="pi pi-chevron-right citation-card__chevron" aria-hidden="true" />
    </button>

    <a
      v-if="validUrl"
      class="citation-card__external"
      :href="validUrl"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buka sumber asli di tab baru"
      @click.stop
    >
      <i class="pi pi-external-link" aria-hidden="true" />
    </a>
  </article>
</template>

<style scoped>
.citation-card { position: relative; min-width: 0; border: 1px solid #d3dae7; border-radius: 12px; display: flex; align-items: stretch; background: rgba(255, 255, 255, 0.7); overflow: hidden; transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease; }
.citation-card:hover, .citation-card:focus-within { border-color: rgba(43, 122, 251, 0.58); background: #fff; transform: translateY(-1px); box-shadow: 0 8px 18px rgba(41, 70, 118, 0.08); }
.citation-card__preview { min-width: 0; flex: 1; border: 0; padding: 10px 8px 10px 11px; display: flex; align-items: center; gap: 9px; color: #26324a; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.citation-card__preview:focus-visible { outline: 3px solid rgba(43, 122, 251, 0.2); outline-offset: -3px; }
.citation-card__number { flex: 0 0 auto; color: #2563d8; font-size: 11px; font-weight: 800; }
.citation-card__copy { min-width: 0; flex: 1; display: grid; gap: 3px; }
.citation-card__copy strong { display: -webkit-box; overflow: hidden; color: #26324a; font-size: 11px; line-height: 1.35; font-weight: 750; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.citation-card__copy small { overflow: hidden; color: #6c7890; font-size: 9px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.citation-card__kind { width: fit-content; border-radius: 999px; padding: 1px 6px; color: #315fba !important; background: #e7efff; font-size: 8px !important; font-weight: 800; letter-spacing: 0.03em; }
.citation-card__unavailable { color: #8b94a2 !important; }
.citation-card__chevron { color: #8d98aa; font-size: 9px; }
.citation-card__external { width: 40px; flex: 0 0 40px; border-left: 1px solid #e0e5ee; display: grid; place-items: center; color: #56739f; text-decoration: none; transition: color 0.16s ease, background 0.16s ease; }
.citation-card__external:hover, .citation-card__external:focus-visible { color: #fff; background: #3478f6; outline: none; }
</style>
