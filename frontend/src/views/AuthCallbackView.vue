<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AuthCard from "@/components/auth/AuthCard.vue";
import {
  completeAuthCallback,
  consumeAuthRedirect,
  restoreAuthSession,
} from "@/stores/useAuth";

const router = useRouter();
const route = useRoute();
const errorMessage = ref("");

onMounted(async () => {
  try {
    const providerError =
      typeof route.query.error_description === "string"
        ? route.query.error_description
        : typeof route.query.error === "string"
          ? route.query.error
          : "";
    if (providerError) {
      throw new Error(providerError);
    }

    const code = typeof route.query.code === "string" ? route.query.code : "";
    const authenticated = code
      ? await completeAuthCallback(code)
      : await restoreAuthSession();
    if (authenticated) {
      await router.replace(consumeAuthRedirect());
      return;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Proses autentikasi tidak dapat diselesaikan.";
    return;
  }
  errorMessage.value =
    "Tautan autentikasi tidak valid atau sudah kedaluwarsa. Silakan coba masuk kembali.";
});
</script>

<template>
  <main class="callback-page">
    <AuthCard
      title="Finishing sign in"
      subtitle="StockGraph is securely restoring your session."
    >
      <div v-if="!errorMessage" class="callback-status" role="status">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        <span>Please wait a moment…</span>
      </div>
      <div v-else class="callback-error" role="alert">
        <i class="pi pi-exclamation-circle" aria-hidden="true" />
        <span>{{ errorMessage }}</span>
        <RouterLink to="/login">Back to sign in</RouterLink>
      </div>
    </AuthCard>
  </main>
</template>

<style scoped>
.callback-page {
  min-height: 100dvh;
  padding: 24px 16px;
  display: grid;
  place-items: center;
  background: #f7f7f5;
}
.callback-status, .callback-error {
  min-height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #667085;
  text-align: center;
}
.callback-error { flex-direction: column; color: #a42a3e; line-height: 1.5; }
.callback-error a { color: #1e61d6; font-weight: 700; text-decoration: none; }
@media (prefers-color-scheme: dark) {
  .callback-page { background: #101114; }
  .callback-status { color: #aeb3be; }
}
</style>
