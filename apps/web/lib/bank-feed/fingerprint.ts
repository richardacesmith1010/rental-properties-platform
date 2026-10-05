import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeDescription } from "./match";
import type { Direction } from "./types";

export interface RowPayload {
  v: 1; bankAccountId: string; profileId: string; postedOn: string; amountCents: number;
  direction: Direction; description: string; occurrenceIndex: number; exp: number;
}

function secret(): string {
  const value = process.env.BANK_FEED_SECRET;
  if (!value || value.length < 32) throw new Error("bank_feed_not_set_up");
  return value;
}

function sign(value: string): Buffer {
  return createHmac("sha256", secret()).update(value).digest();
}

export function bankFingerprint(row: Pick<RowPayload,
  "bankAccountId" | "postedOn" | "amountCents" | "direction" | "description" | "occurrenceIndex">): string {
  return sign(`fp1|${row.bankAccountId}|${row.postedOn}|${row.amountCents}|${row.direction}|`
    + `${normalizeDescription(row.description)}|${row.occurrenceIndex}`).toString("hex");
}

export function createRowToken(row: Omit<RowPayload, "v" | "exp">, now = Date.now()): string {
  const payload: RowPayload = { v: 1, bankAccountId: row.bankAccountId, profileId: row.profileId,
    postedOn: row.postedOn, amountCents: row.amountCents, direction: row.direction,
    description: row.description, occurrenceIndex: row.occurrenceIndex, exp: now + 24 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(`tok1|${encoded}`).toString("base64url")}`;
}

export function verifyRowToken(token: string, expected: { bankAccountId: string; profileId: string },
  now = Date.now()): RowPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const actual = Buffer.from(parts[1], "base64url");
  const correct = sign(`tok1|${parts[0]}`);
  if (actual.length !== correct.length || !timingSafeEqual(actual, correct)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as RowPayload;
    if (payload.v !== 1 || payload.bankAccountId !== expected.bankAccountId || payload.profileId !== expected.profileId
      || !Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.exp > now + 24 * 60 * 60 * 1000
      || !/^\d{4}-\d{2}-\d{2}$/.test(payload.postedOn) || !Number.isSafeInteger(payload.amountCents)
      || payload.amountCents <= 0 || !["in", "out"].includes(payload.direction)
      || typeof payload.description !== "string" || payload.description.length > 300
      || !Number.isSafeInteger(payload.occurrenceIndex) || payload.occurrenceIndex < 0) return null;
    return payload;
  } catch { return null; }
}
