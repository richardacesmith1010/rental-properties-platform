import "server-only";
import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { getWebhookVerificationKey } from "@/lib/plaid";

type Key = Awaited<ReturnType<typeof getWebhookVerificationKey>>;
const keyCache = new Map<string, Key>();

function decodePart(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
}

export async function verifyPlaidWebhook(rawBody: string, jwt: string | null): Promise<boolean> {
  if (!jwt) return false;
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return false;
    const header = decodePart(parts[0]);
    if (header.alg !== "ES256" || typeof header.kid !== "string" || !header.kid) return false;
    let key = keyCache.get(header.kid);
    if (!key) {
      key = await getWebhookVerificationKey(header.kid);
      keyCache.set(header.kid, key);
    }
    const nowSeconds = Date.now() / 1000;
    if (key.kid !== header.kid || key.alg !== "ES256"
      || (key.expired_at !== null && key.expired_at <= nowSeconds)) return false;
    const valid = verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), {
      key: createPublicKey({ key: { kty: key.kty, crv: key.crv, x: key.x, y: key.y }, format: "jwk" }),
      dsaEncoding: "ieee-p1363"
    }, Buffer.from(parts[2], "base64url"));
    if (!valid) return false;
    const claims = decodePart(parts[1]);
    if (typeof claims.iat !== "number" || Math.abs(nowSeconds - claims.iat) > 300
      || typeof claims.request_body_sha256 !== "string") return false;
    const actual = createHash("sha256").update(rawBody).digest();
    const expected = Buffer.from(claims.request_body_sha256, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

