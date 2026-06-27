<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute } from "vue-router";
import AuthButton from "@/components/auth/AuthButton.vue";
import AuthCard from "@/components/auth/AuthCard.vue";
import AuthInput from "@/components/auth/AuthInput.vue";
import { useAuth } from "@/stores/useAuth";

const route = useRoute();
const { loginWithGoogle, loginWithMagicLink } = useAuth();
const email = ref("");
const isGoogleLoading = ref(false);
const isEmailLoading = ref(false);
const successMessage = ref("");
const errors = reactive({ email: "", general: "" });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function intendedRedirect(): string {
  return typeof route.query.redirect === "string" ? route.query.redirect : "/";
}

async function handleGoogleLogin() {
  errors.general = "";
  successMessage.value = "";
  isGoogleLoading.value = true;
  try {
    await loginWithGoogle(intendedRedirect());
  } catch (error) {
    errors.general = error instanceof Error ? error.message : "Google Sign-In gagal.";
    isGoogleLoading.value = false;
  }
}

async function handleEmailLogin() {
  errors.email = "";
  errors.general = "";
  successMessage.value = "";
  const normalizedEmail = email.value.trim().toLowerCase();

  if (!normalizedEmail) {
    errors.email = "Email wajib diisi.";
    return;
  }
  if (!emailPattern.test(normalizedEmail)) {
    errors.email = "Format email tidak valid.";
    return;
  }

  isEmailLoading.value = true;
  try {
    await loginWithMagicLink(normalizedEmail, intendedRedirect());
    successMessage.value =
      "Magic link sudah dikirim. Buka email Anda untuk melanjutkan ke StockGraph.";
  } catch (error) {
    errors.general =
      error instanceof Error ? error.message : "Magic link tidak dapat dikirim.";
  } finally {
    isEmailLoading.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <div class="auth-orb auth-orb--one" aria-hidden="true" />
    <div class="auth-orb auth-orb--two" aria-hidden="true" />

    <Transition name="auth-card" appear>
      <AuthCard title="Welcome back" subtitle="Sign in to continue to StockGraph.">
        <button
          type="button"
          class="google-button"
          :disabled="isGoogleLoading || isEmailLoading"
          @click="handleGoogleLogin"
        >
          <i v-if="isGoogleLoading" class="pi pi-spin pi-spinner" aria-hidden="true" />
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/>
            <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.62A10 10 0 0 0 12 22Z"/>
            <path fill="#FBBC05" d="M6.4 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.12-1.32.32-1.93V7.45H3.05A10 10 0 0 0 2 12c0 1.63.39 3.18 1.05 4.55l3.35-2.62Z"/>
            <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.45l3.35 2.62C7.19 7.7 9.4 5.94 12 5.94Z"/>
          </svg>
          <span>{{ isGoogleLoading ? "Connecting to Google…" : "Continue with Google" }}</span>
        </button>

        <div class="auth-divider"><span>OR</span></div>

        <form class="auth-form" novalidate @submit.prevent="handleEmailLogin">
          <p v-if="errors.general" class="form-message form-message--error" role="alert">
            <i class="pi pi-exclamation-circle" aria-hidden="true" />
            <span>{{ errors.general }}</span>
          </p>

          <p
            v-if="successMessage"
            class="form-message form-message--success"
            role="status"
          >
            <i class="pi pi-envelope" aria-hidden="true" />
            <span>{{ successMessage }}</span>
          </p>

          <AuthInput
            id="email"
            v-model="email"
            label="Email address"
            type="email"
            autocomplete="email"
            placeholder="Enter your email"
            icon="pi-envelope"
            :error="errors.email"
          />

          <AuthButton
            type="submit"
            label="Continue with Email"
            :loading="isEmailLoading"
            :disabled="isGoogleLoading"
          />
        </form>

        <template #footer>
          <p class="auth-note">
            New to StockGraph? Continue with email and your account will be created securely.
          </p>
        </template>
      </AuthCard>
    </Transition>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100dvh;
  padding: 24px 16px;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  background: #f7f7f5;
}
.auth-orb { position: absolute; border-radius: 50%; filter: blur(10px); opacity: .3; pointer-events: none; }
.auth-orb--one { width: min(50vw, 440px); aspect-ratio: 1; top: -180px; right: -110px; background: radial-gradient(circle, #8cc8ff, transparent 72%); }
.auth-orb--two { width: min(44vw, 400px); aspect-ratio: 1; bottom: -190px; left: -100px; background: radial-gradient(circle, #b8a6ff, transparent 74%); }
.google-button {
  width: 100%;
  min-height: 54px;
  padding: 0 18px;
  border: 1px solid #cfd2d8;
  border-radius: 14px;
  background: #fff;
  color: #202124;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  font: inherit;
  font-size: 15px;
  font-weight: 650;
  cursor: pointer;
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}
.google-button:hover:not(:disabled) { border-color: #aeb3bc; box-shadow: 0 8px 22px rgba(28,35,50,.09); transform: translateY(-1px); }
.google-button:focus-visible { outline: 3px solid rgba(52, 111, 238, .24); outline-offset: 2px; }
.google-button:disabled { cursor: not-allowed; opacity: .68; }
.google-button svg { display: block; width: 21px; height: 21px; flex: 0 0 21px; }
.auth-divider { margin: 22px 0; display: flex; align-items: center; gap: 13px; color: #8a8f98; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
.auth-divider::before, .auth-divider::after { content: ""; height: 1px; flex: 1; background: #dfe1e5; }
.auth-form { display: grid; gap: 16px; }
.form-message { margin: 0; border-radius: 12px; padding: 11px 12px; font-size: 13px; line-height: 1.5; display: flex; align-items: flex-start; gap: 9px; }
.form-message i { margin-top: 3px; }
.form-message--error { background: #ffe9ee; color: #a42a3e; }
.form-message--success { background: #e8f8ed; color: #226b3d; }
.auth-note { margin: 0 auto; max-width: 340px; text-align: center; color: #757b86; font-size: 12px; line-height: 1.55; }
.auth-card-enter-active { animation: card-in .42s ease both; }
@keyframes card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@media (prefers-color-scheme: dark) {
  .auth-page { background: #101114; }
  .google-button { border-color: #3b3d43; background: #202124; color: #f1f3f4; }
  .auth-divider::before, .auth-divider::after { background: #36383e; }
  .auth-note { color: #9fa4ad; }
}
@media (max-width: 520px) {
  .auth-page { padding: 16px 12px; align-items: center; }
  .google-button { min-height: 52px; }
}
</style>
