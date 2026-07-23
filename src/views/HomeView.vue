<script setup lang="ts">
import { ref } from "vue";
import MultiSelect from "primevue/multiselect";
import AppLeftSidebar from "@/components/common/AppLeftSidebar.vue";
import AppMessageComposer from "@/components/common/AppMessageComposer.vue";
import AnalysisFilters from "@/components/home/AnalysisFilters.vue";
import QuickRecommendationPanel from "@/components/home/QuickRecommendationPanel.vue";
import { AVAILABLE_STOCK_CODES } from "@/constants/stocks";
import { useHomeAnalysis } from "@/composables/useHomeAnalysis";
import { useSidebar } from "@/stores/useSidebar";

const { sidebarWidth } = useSidebar();
const filtersOpen = ref(false);

const {
  sessionState,
  selectedCodes,
  maxArticles,
  thresholdModel,
  question,
  quickActions,
  activeAction,
  visibleRecommendations,
  applyRecommendation,
  showRecommendations,
  hideRecommendations,
  submitQuestion,
} = useHomeAnalysis();

const draftMaxArticles = ref(maxArticles.value);
const draftThresholdModel = ref(thresholdModel.value);

function openAnalysisModal() {
  draftMaxArticles.value = maxArticles.value;
  draftThresholdModel.value = thresholdModel.value;
  filtersOpen.value = true;
}

function closeAnalysisModal() {
  filtersOpen.value = false;
}

function saveAnalysisSettings() {
  maxArticles.value = draftMaxArticles.value;
  thresholdModel.value = draftThresholdModel.value;
  filtersOpen.value = false;
}
</script>

<template>
  <main class="home-screen" :style="{ '--sidebar-w': sidebarWidth }">
    <AppLeftSidebar />

    <section class="home-stage">
      <section class="canvas-card">
        <section class="hero-panel" aria-labelledby="home-title">
          <div class="hero-glow hero-glow-left" />
          <div class="hero-glow hero-glow-right" />
          <div class="hero-chart-card" aria-hidden="true">
            <div class="chart-line" />
            <div class="chart-bars">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div class="hero-network" aria-hidden="true">
            <span class="node node-a" />
            <span class="node node-b" />
            <span class="node node-c" />
            <span class="node node-d" />
            <span class="node node-e" />
            <span class="node node-f" />
            <span class="hub" />
          </div>

          <button type="button" class="hero-adjust-btn" @click="openAnalysisModal">
            <i class="pi pi-sliders-h" />
            Sesuaikan Analisis
          </button>

          <div class="hero-copy">
            <p class="eyebrow"><i class="pi pi-sparkles" /> Asisten AI untuk Analisis Saham</p>
            <h1 id="home-title">Analisis saham dengan <span>GraphRAG</span></h1>
            <p class="hero-subtitle">
              StockGraph menganalisis berita relevan dan laporan keuangan IDX untuk memberikan jawaban
              dan insight yang lebih mendalam.
            </p>
          </div>

          <div class="step-card" aria-label="Alur analisis StockGraph">
            <div class="step-item">
              <span class="step-icon"><i class="pi pi-chart-bar" /></span>
              <div>
                <strong>Pilih kode saham</strong>
                <p>Tentukan saham yang ingin Anda analisis</p>
              </div>
            </div>
            <i class="pi pi-angle-right step-separator" />
            <div class="step-item">
              <span class="step-icon"><i class="pi pi-database" /></span>
              <div>
                <strong>Atur sumber analisis</strong>
                <p>Sesuaikan jumlah artikel dan ambang relevansi</p>
              </div>
            </div>
            <i class="pi pi-angle-right step-separator" />
            <div class="step-item">
              <span class="step-icon"><i class="pi pi-comment" /></span>
              <div>
                <strong>Tulis pertanyaan</strong>
                <p>Ajukan pertanyaan spesifik untuk analisis mendalam</p>
              </div>
            </div>
            <i class="pi pi-angle-right step-separator" />
            <div class="step-item">
              <span class="step-icon"><i class="pi pi-send" /></span>
              <div>
                <strong>Kirim</strong>
                <p>Dapatkan jawaban dan insight berbasis data</p>
              </div>
            </div>
          </div>
        </section>

        <div class="canvas-center">
          <label for="ticker" class="sr-only">Tambahkan kode saham</label>
          <div class="stock-select-wrap">
            <i class="pi pi-search" />
            <MultiSelect
              id="ticker"
              v-model="selectedCodes"
              :options="AVAILABLE_STOCK_CODES"
              optionLabel="label"
              optionValue="value"
              :selection-limit="2"
              :show-toggle-all="false"
              filter
              placeholder="Tambahkan kode saham...."
              class="stock-select"
            />
          </div>

          <div class="composer-shell">
            <QuickRecommendationPanel
              :actions="quickActions"
              :active-action="activeAction"
              :recommendations="visibleRecommendations"
              @activate="showRecommendations"
              @select="applyRecommendation"
              @clear="hideRecommendations"
            />

            <AppMessageComposer
              v-model="question"
              :rows="3"
              :disabled="sessionState.pipelineLoading"
              @send="submitQuestion"
            />
          </div>

        </div>
      </section>
    </section>

    <section v-if="filtersOpen" class="analysis-modal-backdrop" @click.self="closeAnalysisModal">
      <div class="analysis-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-modal-title">
        <div class="analysis-modal-head">
          <div>
            <h2 id="analysis-modal-title">Sesuaikan Analisis</h2>
            <p>Atur jumlah artikel dan ambang relevansi yang akan digunakan StockGraph.</p>
          </div>
          <button type="button" class="modal-close-btn" aria-label="Tutup" @click="closeAnalysisModal">
            <i class="pi pi-times" />
          </button>
        </div>

        <AnalysisFilters
          v-model:max-articles="draftMaxArticles"
          v-model:threshold-model="draftThresholdModel"
          class="analysis-modal-filters"
        />

        <div class="analysis-modal-actions">
          <button type="button" class="modal-ghost-btn" @click="closeAnalysisModal">Batal</button>
          <button type="button" class="modal-save-btn" @click="saveAnalysisSettings">
            <i class="pi pi-check" />
            Save
          </button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home-screen {
  --primary: #2b7afb;
  --primary-soft: #4d8dff;
  --primary-pill-bg: #dbe9ff;
  --primary-pill-text: #1f4fa8;
  --sidebar-w: 280px;
  height: 100dvh;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  gap: 12px;
  background: #181818;
  overflow: hidden;
  transition: grid-template-columns 0.2s ease;
}

.home-stage {
  min-width: 0;
  height: calc(100dvh - 24px);
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.canvas-card {
  position: relative;
  isolation: isolate;
  flex: 1;
  min-height: 0;
  border-radius: 14px;
  background:
    radial-gradient(circle at 13% 16%, rgba(210, 224, 251, 0.58), transparent 24%),
    radial-gradient(circle at 87% 14%, rgba(218, 230, 255, 0.72), transparent 25%),
    linear-gradient(180deg, #fbfdff 0%, #f7faff 31%, #f2f6fd 55%, #eef2fb 100%);
  padding: 0 0 14px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow: hidden;
}

.canvas-card::after {
  content: "";
  position: absolute;
  z-index: 0;
  left: 8%;
  right: 8%;
  top: 282px;
  height: 150px;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(166, 190, 235, 0.18), transparent 68%);
  filter: blur(18px);
}

.hero-panel {
  position: relative;
  z-index: 1;
  min-height: 334px;
  margin: 0;
  padding: 56px 32px 104px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: visible;
  background: transparent;
}

.hero-panel::before,
.hero-panel::after {
  content: "";
  position: absolute;
  inset: auto;
  pointer-events: none;
}

.hero-panel::before {
  left: 72px;
  top: 34px;
  width: 214px;
  height: 214px;
  border-radius: 50%;
  border: 1px solid rgba(122, 158, 226, 0.09);
  box-shadow:
    0 0 0 16px rgba(122, 158, 226, 0.04),
    0 0 0 34px rgba(122, 158, 226, 0.03),
    0 0 0 54px rgba(122, 158, 226, 0.025);
}

.hero-panel::after {
  right: 10px;
  top: 4px;
  width: min(30vw, 340px);
  height: 260px;
  background:
    linear-gradient(124deg, transparent 12%, rgba(95, 135, 218, 0.13) 12% 13%, transparent 13% 46%, rgba(95, 135, 218, 0.12) 46% 47%, transparent 47%),
    linear-gradient(42deg, transparent 30%, rgba(95, 135, 218, 0.1) 30% 31%, transparent 31% 70%, rgba(95, 135, 218, 0.1) 70% 71%, transparent 71%);
  opacity: 0.78;
}

.hero-glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(34px);
  opacity: 0.78;
}

.hero-glow-left {
  left: 128px;
  top: 112px;
  width: 190px;
  height: 130px;
  background: rgba(177, 200, 249, 0.4);
}

.hero-glow-right {
  right: 72px;
  top: 68px;
  width: 230px;
  height: 160px;
  background: rgba(218, 230, 255, 0.72);
}

.hero-adjust-btn {
  position: absolute;
  z-index: 3;
  right: 32px;
  top: 18px;
  min-height: 46px;
  padding: 0 18px;
  border: 1px solid rgba(101, 149, 225, 0.2);
  border-radius: 14px;
  background: #fff;
  color: #4164f5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(72, 113, 180, 0.14);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.hero-adjust-btn i {
  font-size: 16px;
}

.hero-adjust-btn:hover {
  border-color: rgba(66, 125, 219, 0.5);
  box-shadow: 0 10px 24px rgba(72, 113, 180, 0.2);
  transform: translateY(-1px);
}

.hero-adjust-btn:focus-visible {
  outline: 3px solid rgba(43, 122, 251, 0.2);
  outline-offset: 2px;
}

.hero-copy {
  position: relative;
  z-index: 2;
  isolation: isolate;
  width: min(100%, 880px);
  margin: 0 auto;
  text-align: center;
}

.hero-copy::before {
  content: "";
  position: absolute;
  z-index: -1;
  inset: -22px -48px;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    rgba(248, 251, 255, 0.98) 0%,
    rgba(248, 251, 255, 0.88) 52%,
    rgba(248, 251, 255, 0) 78%
  );
}

.eyebrow {
  width: fit-content;
  margin: 0 auto 22px;
  border-radius: 999px;
  padding: 6px 14px;
  background: rgba(224, 233, 255, 0.74);
  color: #6177da;
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero-copy h1 {
  margin: 0;
  color: #172033;
  font-size: clamp(34px, 3.8vw, 46px);
  line-height: 1.08;
  font-weight: 800;
}

.hero-copy h1 span {
  color: #2563d8;
}

.hero-subtitle {
  width: min(100%, 760px);
  margin: 10px auto 0;
  padding: 7px 24px;
  color: #344054;
  background: radial-gradient(
    ellipse at center,
    rgba(248, 251, 255, 0.82) 0%,
    rgba(248, 251, 255, 0.58) 58%,
    rgba(248, 251, 255, 0) 100%
  );
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9),
    0 0 16px rgba(255, 255, 255, 0.9);
}

.hero-chart-card {
  position: absolute;
  left: clamp(28px, 6vw, 76px);
  top: 112px;
  width: 168px;
  height: 132px;
  border-radius: 10px;
  background: rgba(252, 254, 255, 0.54);
  box-shadow: 0 18px 45px rgba(94, 121, 174, 0.08);
  opacity: 0.68;
  transform: rotate(-7deg);
}

.hero-chart-card::before,
.hero-chart-card::after {
  content: "";
  position: absolute;
  left: 18px;
  height: 5px;
  border-radius: 999px;
  background: rgba(219, 227, 245, 0.78);
}

.hero-chart-card::before {
  top: 22px;
  width: 42px;
}

.hero-chart-card::after {
  top: 38px;
  width: 70px;
}

.chart-line {
  position: absolute;
  left: 26px;
  right: 22px;
  top: 56px;
  height: 44px;
  background:
    radial-gradient(circle at 12% 68%, #7fa1f7 0 4px, transparent 5px),
    radial-gradient(circle at 44% 38%, #7fa1f7 0 4px, transparent 5px),
    radial-gradient(circle at 72% 12%, #7fa1f7 0 4px, transparent 5px),
    linear-gradient(140deg, transparent 0 15%, #7fa1f7 15% 17%, transparent 17% 42%, #7fa1f7 42% 45%, transparent 45% 70%, #7fa1f7 70% 73%, transparent 73%);
}

.chart-bars {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
  display: grid;
  gap: 8px;
}

.chart-bars span {
  height: 5px;
  border-radius: 999px;
  background: rgba(219, 227, 245, 0.78);
}

.chart-bars span:nth-child(2) {
  width: 72%;
}

.chart-bars span:nth-child(3) {
  width: 48%;
}

.hero-network {
  position: absolute;
  right: clamp(24px, 3.5vw, 56px);
  top: 88px;
  width: 240px;
  height: 160px;
  z-index: 1;
  opacity: 0.62;
}

.hero-network::before,
.hero-network::after {
  content: "";
  position: absolute;
  inset: 16px 18px;
  background:
    linear-gradient(28deg, transparent 0 34%, rgba(94, 132, 219, 0.36) 34% 35%, transparent 35%),
    linear-gradient(118deg, transparent 0 42%, rgba(94, 132, 219, 0.32) 42% 43%, transparent 43%),
    linear-gradient(160deg, transparent 0 55%, rgba(94, 132, 219, 0.26) 55% 56%, transparent 56%);
}

.node,
.hub {
  position: absolute;
  border-radius: 999px;
  background: #7fa1f7;
  box-shadow: 0 0 0 4px rgba(127, 161, 247, 0.14);
}

.hub {
  left: 112px;
  top: 62px;
  width: 26px;
  height: 26px;
  background: #496df0;
  box-shadow: 0 0 0 8px rgba(73, 109, 240, 0.14);
}

.node-a {
  left: 22px;
  top: 44px;
  width: 14px;
  height: 14px;
  background: #4d70ed;
}

.node-b {
  left: 64px;
  top: 18px;
  width: 13px;
  height: 13px;
  background: #6688f2;
}

.node-c {
  right: 44px;
  top: 20px;
  width: 12px;
  height: 12px;
  background: #6285f3;
}

.node-d {
  right: 18px;
  top: 74px;
  width: 10px;
  height: 10px;
}

.node-e {
  left: 54px;
  bottom: 20px;
  width: 12px;
  height: 12px;
  background: #dce7ff;
  border: 1px solid #98b5ff;
}

.node-f {
  right: 72px;
  bottom: 26px;
  width: 14px;
  height: 14px;
  background: #dce7ff;
  border: 1px solid #98b5ff;
}

.step-card {
  position: absolute;
  left: 50%;
  bottom: 8px;
  z-index: 3;
  width: min(86%, 920px);
  min-height: 82px;
  padding: 14px 18px;
  border-radius: 12px;
  border: 1px solid rgba(212, 225, 249, 0.62);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(247, 250, 255, 0.74));
  box-shadow: 0 12px 30px rgba(96, 122, 172, 0.1);
  backdrop-filter: blur(14px);
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
  gap: 10px;
  align-items: center;
  transform: translateX(-50%);
}

.step-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.step-icon {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(193, 210, 246, 0.8);
  border-radius: 999px;
  color: #4772d8;
  display: grid;
  place-items: center;
  font-size: 17px;
  background: rgba(239, 245, 255, 0.66);
}

.step-item strong {
  display: block;
  color: #243047;
  font-size: 12px;
  font-weight: 800;
}

.step-item p {
  margin: 4px 0 0;
  color: #768197;
  font-size: 10px;
  line-height: 1.35;
  font-weight: 600;
}

.step-separator {
  color: rgba(164, 178, 207, 0.68);
  font-size: 16px;
}

.canvas-center {
  position: relative;
  z-index: 4;
  width: min(86%, 920px);
  max-width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.stock-select-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 46px;
  border: 1px solid #d8deeb;
  border-radius: 10px;
  background: #fff;
}

.stock-select-wrap > i {
  position: absolute;
  left: 18px;
  z-index: 2;
  color: #8994a8;
  font-size: 17px;
}

.stock-select {
  width: 100%;
}

:deep(.stock-select.p-multiselect) {
  border: 0;
  border-radius: 10px;
  background: transparent;
  min-height: 44px;
  box-shadow: none;
}

:deep(.stock-select.p-multiselect:hover),
:deep(.stock-select.p-multiselect.p-focus) {
  border-color: transparent !important;
  box-shadow: none !important;
}

:deep(.stock-select .p-multiselect-label) {
  padding: 12px 42px 12px 48px;
  color: #1e2129;
  font-size: 13px;
}

:deep(.stock-select .p-multiselect-label.p-placeholder) {
  color: #98a3b7;
  font-size: 13px;
}

:deep(.stock-select .p-multiselect-token) {
  background: var(--primary-pill-bg);
  color: var(--primary-pill-text);
  border-radius: 999px;
}

:deep(.stock-select .p-multiselect-dropdown) {
  margin-right: 16px;
  color: #111827;
}

.composer-shell {
  margin-top: 6px;
  border: 1px solid #d8deeb;
  border-radius: 10px;
  background: #fff;
  padding: 9px 12px 8px;
  position: relative;
  overflow: visible;
}

:global(.p-multiselect-panel .p-checkbox .p-checkbox-box) {
  border-color: #2b7afb !important;
}

:global(.p-multiselect-panel .p-checkbox.p-checkbox-checked .p-checkbox-box) {
  background: #2b7afb !important;
  border-color: #2b7afb !important;
}

:global(.p-multiselect-panel .p-checkbox.p-checkbox-checked .p-checkbox-icon) {
  color: #fff !important;
}

:global(.p-multiselect-panel .p-checkbox.p-highlight .p-checkbox-box) {
  background: #2b7afb !important;
  border-color: #2b7afb !important;
}

:global(.p-multiselect-panel .p-multiselect-option.p-multiselect-option-selected) {
  background: rgba(43, 122, 251, 0.18) !important;
  color: #eef4ff;
}

.analysis-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(9, 15, 26, 0.42);
  backdrop-filter: blur(8px);
}

.analysis-modal {
  width: min(100%, 680px);
  border: 1px solid rgba(204, 216, 239, 0.9);
  border-radius: 14px;
  background: #f8fbff;
  box-shadow: 0 28px 70px rgba(24, 38, 66, 0.24);
  padding: 18px;
  color: #111827;
}

.analysis-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.analysis-modal-head h2 {
  margin: 0;
  color: #172033;
  font-size: 17px;
  font-weight: 800;
}

.analysis-modal-head p {
  margin: 5px 0 0;
  color: #687489;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 600;
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #d7dfed;
  border-radius: 9px;
  background: #fff;
  color: #64708a;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.analysis-modal-filters {
  margin-top: 0;
}

.analysis-modal-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-ghost-btn,
.modal-save-btn {
  border-radius: 9px;
  min-height: 36px;
  padding: 0 15px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.modal-ghost-btn {
  border: 1px solid #d7dfed;
  background: #fff;
  color: #4f5c70;
}

.modal-save-btn {
  border: 1px solid #2b76f6;
  background: #2b76f6;
  color: #fff;
  box-shadow: 0 10px 20px rgba(43, 118, 246, 0.2);
}

@media (max-width: 1080px) {
  .home-screen {
    grid-template-columns: 1fr;
    padding: 14px;
  }

  .home-stage {
    order: 1;
  }

  .canvas-card {
    min-height: 0;
  }

  .hero-panel {
    min-height: auto;
    padding: 72px 18px 20px;
    overflow: hidden;
  }

  .hero-adjust-btn {
    right: 18px;
  }

  .hero-copy h1 {
    white-space: normal;
  }

  .hero-chart-card,
  .hero-network {
    display: none;
  }

  .step-card {
    position: relative;
    left: auto;
    bottom: auto;
    width: 100%;
    margin: 28px auto 0;
    grid-template-columns: 1fr;
    transform: none;
  }

  .step-separator {
    display: none;
  }

  .canvas-center {
    width: min(100% - 28px, 746px);
    margin-top: 18px;
  }

}

@media (max-width: 680px) {
  .hero-adjust-btn {
    right: 14px;
    top: 14px;
  }
}
</style>
