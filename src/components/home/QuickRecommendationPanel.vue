<script setup lang="ts">
import { computed } from "vue";
import type { QuickAction } from "@/types/recommendation";

interface Props {
  actions: QuickAction[];
  activeAction: string | null;
  recommendations: string[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (event: "activate", label: string): void;
  (event: "select", recommendation: string): void;
  (event: "clear"): void;
}>();

const activeActionData = computed(() =>
  props.actions.find((item) => item.label === props.activeAction),
);
</script>

<template>
  <section class="recommend-zone" @mouseleave="emit('clear')">
    <section class="quick-actions">
      <button
        v-for="action in props.actions"
        :key="action.label"
        type="button"
        class="quick-btn"
        @mouseenter="emit('activate', action.label)"
      >
        <i :class="action.icon" />
        {{ action.label }}
      </button>
    </section>

    <section v-if="props.activeAction" class="recommend-panel">
      <div class="recommend-head">
        <div class="recommend-title">
          <i :class="activeActionData?.icon ?? 'pi pi-book'" />
          <div>
            <strong>{{ activeActionData?.title ?? props.activeAction }}</strong>
            <span v-if="activeActionData?.description">{{ activeActionData.description }}</span>
          </div>
        </div>
      </div>
      <button
        v-for="item in props.recommendations"
        :key="item"
        type="button"
        class="recommend-item"
        @click="emit('select', item)"
      >
        {{ item }}
      </button>
    </section>
  </section>
</template>

<style scoped>
.recommend-zone {
  margin-top: 0;
  position: relative;
  z-index: 3;
}

.quick-actions {
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 0;
}

.quick-btn {
  border: 1px solid #d8deeb;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  min-height: 28px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.quick-btn i {
  color: #747b88;
  font-size: 13px;
}

.quick-btn:hover {
  border-color: #b9c8e6;
  color: #0866ff;
}

.quick-btn:hover i {
  color: #0866ff;
}

.recommend-panel {
  position: static;
  width: 100%;
  margin-top: 6px;
  border: 1px solid #d8deeb;
  border-radius: 10px;
  background: rgba(250, 252, 255, 0.98);
  box-shadow: none;
  padding: 7px 8px 5px;
}

.recommend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.recommend-title {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #243047;
  padding: 0 4px 4px;
}

.recommend-title > i {
  margin-top: 2px;
  color: #4772d8;
  font-size: 12px;
}

.recommend-title > div {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.recommend-title strong {
  font-size: 12px;
  line-height: 1.3;
  font-weight: 750;
}

.recommend-title span {
  color: #778297;
  font-size: 9.5px;
  line-height: 1.35;
  font-weight: 600;
}

.recommend-item {
  width: 100%;
  border: 0;
  border-top: 1px solid #e3e8f2;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  color: #191b22;
  font-size: 11px;
  line-height: 1.25;
  padding: 6px 8px;
  cursor: pointer;
}

.recommend-item:first-of-type {
  border-top: 0;
}

.recommend-item:hover {
  background: #eef4ff;
  color: #2b7afb;
}

@media (max-width: 1080px) {
  .quick-actions {
    flex-wrap: wrap;
  }

  .recommend-panel {
    padding: 12px 14px 8px;
  }

  .recommend-title {
    padding-bottom: 6px;
  }

  .recommend-title strong {
    font-size: 14px;
  }

  .recommend-title span {
    font-size: 11px;
  }

  .recommend-item {
    font-size: 14px;
  }
}
</style>
