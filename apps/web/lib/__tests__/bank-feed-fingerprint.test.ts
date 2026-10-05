import { describe, expect, it, vi } from "vitest";
import { bankFingerprint, createRowToken, verifyRowToken } from "@/lib/bank-feed/fingerprint";

vi.mock("server-only", () => ({}));

const row = { bankAccountId: "bank", profileId: "owner", postedOn: "2026-10-02", amountCents: 235000,
  direction: "in" as const, description: "DIRECT DEPOSIT JANE Q TENANT", occurrenceIndex: 0 };

describe("bank row signatures", () => {
  it("keys equal rows with the secret and occurrence index", () => {
    vi.stubEnv("BANK_FEED_SECRET", "a".repeat(32));
    const first = bankFingerprint(row);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(bankFingerprint({ ...row, occurrenceIndex: 1 })).not.toBe(first);
    vi.stubEnv("BANK_FEED_SECRET", "b".repeat(32));
    expect(bankFingerprint(row)).not.toBe(first);
    vi.unstubAllEnvs();
  });

  it("rejects changed, foreign, and expired tokens", () => {
    vi.stubEnv("BANK_FEED_SECRET", "c".repeat(32));
    const token = createRowToken(row, 1_000);
    expect(verifyRowToken(token, { bankAccountId: "bank", profileId: "owner" }, 2_000)?.amountCents).toBe(235000);
    expect(verifyRowToken(token, { bankAccountId: "other", profileId: "owner" }, 2_000)).toBeNull();
    expect(verifyRowToken(token, { bankAccountId: "bank", profileId: "other" }, 2_000)).toBeNull();
    expect(verifyRowToken(token, { bankAccountId: "bank", profileId: "owner" }, 90_000_000)).toBeNull();
    const [body, signature] = token.split(".");
    const changed = Buffer.from(JSON.stringify({ ...row, v: 1, exp: 1_000 + 86_400_000,
      amountCents: 1, occurrenceIndex: 5 })).toString("base64url");
    expect(verifyRowToken(`${changed}.${signature}`, { bankAccountId: "bank", profileId: "owner" }, 2_000)).toBeNull();
    expect(body).not.toBe(changed);
    vi.unstubAllEnvs();
  });
});
