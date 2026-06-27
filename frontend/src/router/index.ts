import { createRouter, createWebHistory } from "vue-router";
import { restoreAuthSession } from "@/stores/useAuth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/views/HomeView.vue"),
    },
    {
      path: "/result",
      name: "result",
      component: () => import("@/views/ResultView.vue"),
    },
    {
      path: "/hasil",
      redirect: { name: "result" },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/auth/callback",
      name: "auth-callback",
      component: () => import("@/views/AuthCallbackView.vue"),
      meta: { public: true },
    },
    { path: "/register", redirect: { name: "login" } },
    { path: "/verify-email", redirect: { name: "login" } },
    { path: "/forgot-password", redirect: { name: "login" } },
    { path: "/reset-password", redirect: { name: "login" } },
  ],
});

router.beforeEach(async (to) => {
  // The PKCE callback must exchange its `code` before a session can exist.
  if (to.name === "auth-callback") return true;

  const authed = await restoreAuthSession();
  if (!authed && !to.meta.public) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (authed && to.name === "login") {
    return { name: "home" };
  }
  return true;
});

export default router;
