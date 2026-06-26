import { describe, expect, it } from "vitest";
import {
  buildFollowUpPrompt,
  extractBracketedStockCodes,
  resolveConversationStockCodes,
} from "@/composables/useResultAnalysis";

describe("useResultAnalysis ticker context", () => {
  it("extracts bracketed stock codes from a persisted user prompt", () => {
    expect(extractBracketedStockCodes("[UNVR] Apa risikonya?")).toEqual(["UNVR"]);
    expect(extractBracketedStockCodes("[BBCA, BBRI] Bandingkan")).toEqual(["BBCA", "BBRI"]);
  });

  it("keeps the original conversation ticker instead of falling back to a stale route code", () => {
    const messages = [
      { role: "user" as const, content: "[UNVR] Bagaimana perubahan laba bersihnya?" },
      { role: "assistant" as const, content: "Jawaban UNVR" },
      { role: "user" as const, content: "[BBCA] kalau mau beli, oke gak ya?" },
    ];

    expect(resolveConversationStockCodes(messages, ["BBCA"])).toEqual(["UNVR"]);
  });

  it("prefixes follow-up questions with the active conversation ticker only when needed", () => {
    expect(buildFollowUpPrompt("kalau mau beli, oke gak ya?", ["UNVR"])).toBe(
      "[UNVR] kalau mau beli, oke gak ya?",
    );
    expect(buildFollowUpPrompt("[BBCA] kalau mau beli, oke gak ya?", ["UNVR"])).toBe(
      "[BBCA] kalau mau beli, oke gak ya?",
    );
  });
});
