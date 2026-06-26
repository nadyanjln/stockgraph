<script setup lang="ts">
import type { PropType } from "vue";

defineProps({
  label: {
    type: String,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String as PropType<"button" | "submit" | "reset">,
    default: "button",
  },
});
</script>

<template>
  <button class="auth-button" :type="type" :disabled="disabled || loading">
    <i v-if="loading" class="pi pi-spin pi-spinner" aria-hidden="true" />
    <span>{{ loading ? "Memproses..." : label }}</span>
  </button>
</template>

<style scoped>
.auth-button {
  width: 100%;
  min-height: 50px;
  border-radius: 14px;
  border: 0;
  background: linear-gradient(135deg, #1565ff, #3e8dff);
  color: #fff;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.auth-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(33, 99, 223, 0.35);
}

.auth-button:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}
</style>
