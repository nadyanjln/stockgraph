import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ restore: vi.fn<() => Promise<boolean>>() }));

vi.mock("@/stores/useAuth", () => ({
  restoreAuthSession: auth.restore,
}));

import router from "@/router";

describe("black-box authentication routing", () => {
  beforeEach(async () => {
    auth.restore.mockReset();
    auth.restore.mockResolvedValue(false);
    await router.replace("/login");
    auth.restore.mockClear();
  });

  it("BB-FE-001 redirects an unauthenticated result request to login", async () => {
    await router.push("/result?code=BBCA");
    expect(router.currentRoute.value.name).toBe("login");
    expect(router.currentRoute.value.query.redirect).toBe("/result?code=BBCA");
  });

  it("BB-FE-002 allows an authenticated user to open home", async () => {
    auth.restore.mockResolvedValue(true);
    await router.push("/");
    expect(router.currentRoute.value.name).toBe("home");
  });

  it("BB-FE-003 redirects an authenticated login request to home", async () => {
    auth.restore.mockResolvedValue(true);
    await router.push("/login?redirect=/result");
    expect(router.currentRoute.value.name).toBe("home");
  });

  it("BB-FE-004 permits the auth callback before a session exists", async () => {
    await router.push("/auth/callback?code=test-code");
    expect(router.currentRoute.value.name).toBe("auth-callback");
    expect(auth.restore).not.toHaveBeenCalled();
  });
});
