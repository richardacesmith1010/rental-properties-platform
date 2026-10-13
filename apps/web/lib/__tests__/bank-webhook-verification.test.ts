import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPlaidWebhook } from "@/lib/bank-feed/webhook-verification";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/plaid", () => ({ getWebhookVerificationKey: vi.fn() }));
import { getWebhookVerificationKey } from "@/lib/plaid";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicJwk = pair.publicKey.export({ format: "jwk" });
let serial = 0;

function signed(raw: string, options: { alg?: string; kid?: string | null; iat?: number;
  hash?: string; expired?: boolean } = {}) {
  const kid = options.kid === undefined ? `key-${++serial}` : options.kid;
  const header = { alg: options.alg ?? "ES256", ...(kid ? { kid } : {}) };
  const claims = { iat: options.iat ?? Math.floor(Date.now() / 1000),
    request_body_sha256: options.hash ?? createHash("sha256").update(raw).digest("hex") };
  const body = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.`
    + Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = sign("sha256", Buffer.from(body), { key: pair.privateKey, dsaEncoding: "ieee-p1363" });
  vi.mocked(getWebhookVerificationKey).mockResolvedValue({ ...publicJwk, kid: kid || "",
    alg: "ES256", expired_at: options.expired ? 1 : null } as never);
  return `${body}.${signature.toString("base64url")}`;
}

beforeEach(() => vi.clearAllMocks());

describe("Sprint 224 Plaid webhook verification", () => {
  it("accepts a valid ES256 signature over the exact raw body", async () => {
    const raw = '{ "webhook_type": "TRANSACTIONS" }';
    expect(await verifyPlaidWebhook(raw, signed(raw))).toBe(true);
  });

  it("rejects tampering, stale iat, wrong algorithm, missing kid and expired key", async () => {
    const raw = '{"item_id":"item"}';
    const jwt = signed(raw);
    expect(await verifyPlaidWebhook(raw, jwt.slice(0, -4) + "AAAA")).toBe(false);
    expect(await verifyPlaidWebhook(raw, signed(raw, { iat: Math.floor(Date.now() / 1000) - 301 }))).toBe(false);
    expect(await verifyPlaidWebhook(raw, signed(raw, { alg: "HS256" }))).toBe(false);
    expect(await verifyPlaidWebhook(raw, signed(raw, { kid: null }))).toBe(false);
    expect(await verifyPlaidWebhook(raw, signed(raw, { expired: true }))).toBe(false);
  });

  it("rejects a body hash mismatch including whitespace changes", async () => {
    const raw = '{"item_id":"item"}';
    expect(await verifyPlaidWebhook(raw, signed(raw, { hash: "0".repeat(64) }))).toBe(false);
    expect(await verifyPlaidWebhook(`${raw} `, signed(raw))).toBe(false);
  });
});
