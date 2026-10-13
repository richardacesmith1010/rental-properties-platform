import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptBankToken, encryptBankToken } from "@/lib/bank-feed/token-crypto";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

describe("Sprint 224 crypto", () => {
  it("round-trips with random ciphertext and rejects a tampered tag", () => {
    vi.stubEnv("BANK_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
    const first = encryptBankToken("access-sandbox-secret");
    const second = encryptBankToken("access-sandbox-secret");
    expect(first).toMatch(/^v1:/);
    expect(first).not.toContain("access-sandbox-secret");
    expect(first).not.toBe(second);
    expect(decryptBankToken(first)).toBe("access-sandbox-secret");
    const parts = first.split(":");
    parts[2] = Buffer.alloc(16, 0).toString("base64");
    expect(() => decryptBankToken(parts.join(":"))).toThrow();
  });

  it("fails closed with the exact copy when the key is missing", () => {
    vi.stubEnv("BANK_TOKEN_KEY", "");
    expect(() => encryptBankToken("token")).toThrow("Bank connection is not set up yet.");
    expect(() => decryptBankToken("v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:AA=="))
      .toThrow("Bank connection is not set up yet.");
  });
});
