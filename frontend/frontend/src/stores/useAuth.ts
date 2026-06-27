import { computed, reactive } from "vue";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { apiClient } from "@/services/apiClient";
import { supabase } from "@/services/supabase";
import type { AuthUser } from "@/types/api";

const AUTH_REDIRECT_KEY = "stockgraph_auth_redirect";

const state = reactive<{
  user: AuthUser | null;
  session: Session | null;
  restoring: boolean;
  restored: boolean;
}>({
  user: null,
  session: null,
  restoring: false,
  restored: false,
});

let restorePromise: Promise<boolean> | null = null;
let authListenerStarted = false;

function clearConversationState() {
  localStorage.removeItem("stockgraph_session_id");
  localStorage.removeItem("stockgraph_conversation_id");
}

async function syncLocalProfile(session: Session | null): Promise<boolean> {
  state.session = session;
  if (!session) {
    state.user = null;
    return false;
  }

  try {
    state.user = await apiClient.getMe();
    return true;
  } catch (error) {
    state.user = null;
    throw error;
  }
}

function startAuthListener() {
  if (authListenerStarted) return;
  authListenerStarted = true;
  supabase.auth.onAuthStateChange(
    (_event: AuthChangeEvent, session: Session | null) => {
      window.setTimeout(() => {
        void syncLocalProfile(session).catch(() => {
          state.user = null;
        });
      }, 0);
    },
  );
}

export async function restoreAuthSession(): Promise<boolean> {
  startAuthListener();
  if (state.restored) return state.user !== null;
  if (restorePromise) return restorePromise;

  state.restoring = true;
  restorePromise = (async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return await syncLocalProfile(data.session);
    } catch {
      state.session = null;
      state.user = null;
      return false;
    } finally {
      state.restoring = false;
      state.restored = true;
      restorePromise = null;
    }
  })();
  return restorePromise;
}

export async function completeAuthCallback(code: string): Promise<boolean> {
  startAuthListener();
  state.restoring = true;
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    const authenticated = await syncLocalProfile(data.session);
    state.restored = true;
    return authenticated;
  } finally {
    state.restoring = false;
  }
}

export function useAuth() {
  const isAuthenticated = computed(() => state.user !== null && state.session !== null);
  const username = computed(() => state.user?.name || state.user?.username || "");
  const email = computed(() => state.user?.email ?? "");
  const avatar = computed(() => state.user?.avatar_url ?? "");
  const provider = computed(() => state.user?.provider ?? "email");
  const userId = computed(() => state.session?.user.id ?? "");
  const createdAt = computed(
    () => state.session?.user.created_at ?? state.user?.created_at ?? "",
  );
  const initials = computed(() =>
    (state.user?.name || state.user?.username || "?").charAt(0).toUpperCase(),
  );

  async function loginWithGoogle(redirect = "/"): Promise<void> {
    localStorage.setItem(AUTH_REDIRECT_KEY, redirect);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
  }

  async function loginWithMagicLink(emailAddress: string, redirect = "/"): Promise<void> {
    localStorage.setItem(AUTH_REDIRECT_KEY, redirect);
    const { error } = await supabase.auth.signInWithOtp({
      email: emailAddress.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
  }

  async function updateDisplayName(name: string): Promise<AuthUser> {
    const normalized = name.trim().replace(/\s+/g, " ");
    if (normalized.length < 2) {
      throw new Error("Display name must contain at least 2 characters.");
    }

    const user = await apiClient.updateMe(normalized);
    state.user = user;

    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: normalized, name: normalized },
    });
    if (!error && state.session && data.user) {
      state.session.user = data.user;
    }
    return user;
  }

  async function logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } finally {
      clearConversationState();
      state.session = null;
      state.user = null;
    }
  }

  return {
    state,
    isAuthenticated,
    username,
    email,
    avatar,
    provider,
    userId,
    createdAt,
    initials,
    loginWithGoogle,
    loginWithMagicLink,
    updateDisplayName,
    logout,
    restoreSession: restoreAuthSession,
  };
}

export function consumeAuthRedirect(): string {
  const redirect = localStorage.getItem(AUTH_REDIRECT_KEY) || "/";
  localStorage.removeItem(AUTH_REDIRECT_KEY);
  return redirect.startsWith("/") ? redirect : "/";
}
