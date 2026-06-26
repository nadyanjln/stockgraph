/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Lets the editor's plain TypeScript server resolve `*.vue` imports even when
// the Vue (Volar) language service is not in takeover mode. `vue-tsc` uses the
// real component types from each `.vue` file; this declaration is only a
// fallback so `@/views/*.vue` imports don't show as "Cannot find module".
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
