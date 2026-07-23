<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

interface Props {
  modelValue: string;
  rows?: number;
  maxHeight?: number;
  placeholder?: string;
  disabled?: boolean;
  sendLabel?: string;
  loadingLabel?: string;
  showSendIcon?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  rows: 1,
  maxHeight: 180,
  placeholder: "Apa yang ingin kamu tanyakan tentang saham pilihanmu?",
  disabled: false,
  sendLabel: "Kirim",
  loadingLabel: "Memproses...",
  showSendIcon: true,
});

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
  (event: "send"): void;
  (event: "voice"): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function resizeTextarea() {
  const textarea = textareaRef.value;
  if (!textarea) return;

  textarea.style.height = "auto";
  const nextHeight = Math.min(textarea.scrollHeight, props.maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > props.maxHeight ? "auto" : "hidden";
}

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  emit("update:modelValue", target?.value ?? "");
  resizeTextarea();
}

function sendMessage() {
  if (props.disabled || !props.modelValue.trim()) return;
  emit("send");
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  sendMessage();
}

function focus() {
  textareaRef.value?.focus();
}

watch(
  () => props.modelValue,
  async (value, previousValue) => {
    await nextTick();
    resizeTextarea();
    if (!value && previousValue) focus();
  },
);

onMounted(resizeTextarea);
defineExpose({ focus });
</script>

<template>
  <section class="composer-box">
    <textarea
      ref="textareaRef"
      :value="props.modelValue"
      :rows="1"
      class="composer-input"
      :placeholder="props.placeholder"
      :aria-busy="props.disabled"
      @input="handleInput"
      @keydown="handleKeydown"
    />
    <div class="composer-actions">
      <button
        type="button"
        class="composer-send-btn"
        :disabled="props.disabled || !props.modelValue.trim()"
        aria-label="Kirim pesan"
        @click="sendMessage"
      >
        {{ props.disabled ? props.loadingLabel : props.sendLabel }}
        <i v-if="props.showSendIcon && !props.disabled" class="pi pi-send" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.composer-box {
  position: relative;
  margin-top: 5px;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.composer-input {
  width: 100%;
  border: 0;
  outline: 0;
  resize: none;
  height: 34px;
  min-height: 34px;
  max-height: 180px;
  overflow-y: hidden;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  font-family: inherit;
  color: #1d2028;
  padding: 6px 98px 6px 0;
  transition: height 0.12s ease;
  scrollbar-width: thin;
}

.composer-input::placeholder {
  color: #98a3b7;
}

.composer-actions {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.composer-send-btn {
  position: static;
  right: auto;
  bottom: auto;
  width: auto;
  border: 1px solid #2b7afb;
  background: #2b7afb;
  color: #fff;
  border-radius: 999px;
  min-width: 74px;
  height: 30px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transform: none;
  box-shadow: 0 8px 16px rgba(43, 122, 251, 0.18);
}

.composer-send-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

</style>
