import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/supabase", () => ({
  getSupabaseAccessToken: vi.fn().mockResolvedValue("test-token"),
}));

import { apiClient } from "@/services/apiClient";

describe("black-box API client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("BB-FE-009 sends the bearer token and unwraps a successful envelope", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, message: "OK", data: { id: 7, name: "User" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = await apiClient.getMe();
    expect(user.id).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/users/me",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }),
    );
  });

  it("BB-FE-010 surfaces a controlled backend message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: "Sesi tidak valid" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(apiClient.getMe()).rejects.toThrow("Sesi tidak valid");
  });

  it("BB-FE-011 handles a non-JSON provider failure without exposing internals", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream stack", { status: 502, statusText: "Bad Gateway" }),
    );
    await expect(apiClient.getYears()).rejects.toThrow("Bad Gateway");
  });
});
