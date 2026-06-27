<script setup lang="ts">
import Slider from "primevue/slider";

interface Props {
  maxArticles: number;
  thresholdModel: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (event: "update:maxArticles", value: number): void;
  (event: "update:thresholdModel", value: number): void;
}>();
</script>

<template>
  <div class="filter-row">
    <div class="filter-box">
      <div class="filter-label">Maksimal artikel</div>
      <div class="slider-wrap">
        <Slider
          :model-value="props.maxArticles"
          :min="1"
          :max="10"
          class="home-slider"
          @update:model-value="emit('update:maxArticles', Number($event))"
        />
        <span class="slider-tooltip">{{ props.maxArticles }}</span>
      </div>
      <div class="filter-scale">
        <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
      </div>
    </div>

    <div class="filter-box">
      <div class="filter-label">Relevance threshold</div>
      <div class="slider-wrap">
        <Slider
          :model-value="props.thresholdModel"
          :min="0"
          :max="10"
          :step="1"
          class="home-slider"
          @update:model-value="emit('update:thresholdModel', Number($event))"
        />
        <span class="slider-tooltip">{{ props.thresholdModel }}</span>
      </div>
      <div class="filter-scale">
        <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-row {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.filter-box {
  border: 1px solid #c9ced8;
  border-radius: 14px;
  padding: 9px 12px 8px;
  background: #ececef;
}

.filter-label {
  color: #1f2129;
  font-size: 14px;
  margin-bottom: 10px;
}

.slider-wrap {
  position: relative;
}

.slider-tooltip {
  position: absolute;
  right: 0;
  top: -34px;
  border-radius: 8px;
  background: #2b7afb;
  color: #fff;
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.slider-wrap:hover .slider-tooltip,
.slider-wrap:focus-within .slider-tooltip {
  opacity: 1;
  transform: translateY(0);
}

.filter-scale {
  display: flex;
  justify-content: space-between;
  color: #8e93a2;
  font-size: 11px;
  margin-top: 6px;
}

:deep(.home-slider.p-slider) {
  background: #cdd5e4;
}

:deep(.home-slider .p-slider-range) {
  background: #2b7afb;
}

:deep(.home-slider .p-slider-handle) {
  border-color: #2b7afb;
  background: #fff;
}

@media (max-width: 1080px) {
  .filter-row {
    grid-template-columns: 1fr;
  }
}
</style>
