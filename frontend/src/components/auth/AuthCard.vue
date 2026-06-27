<script setup lang="ts">
defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: "",
  },
});
</script>

<template>
  <article class="auth-card">
    <header class="auth-card__header">
      <h1>{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </header>
    <div class="auth-card__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="auth-card__footer">
      <slot name="footer" />
    </footer>
  </article>
</template>

<style scoped>
.auth-card {
  width: min(100%, 430px);
  border-radius: 20px;
  border: 1px solid #e1e2df;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px);
  box-shadow: 0 18px 52px rgba(25, 31, 43, 0.12);
  padding: clamp(24px, 3.2vw, 32px);
  color: #15203b;
}

.auth-card__header h1 {
  margin: 0;
  font-size: clamp(24px, 4vw, 30px);
  letter-spacing: -0.02em;
  text-align: center;
}

.auth-card__header p {
  margin: 8px 0 0;
  color: #4d5b7c;
  line-height: 1.45;
  text-align: center;
}

.auth-card__body {
  margin-top: 20px;
}

.auth-card__footer {
  margin-top: 18px;
  color: #445271;
}

@media (prefers-color-scheme: dark) {
  .auth-card {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(25, 26, 30, 0.96);
    color: #eef4ff;
    box-shadow: 0 24px 58px rgba(0, 0, 0, 0.44);
  }

  .auth-card__header p,
  .auth-card__footer {
    color: #aebbd1;
  }
}
</style>
