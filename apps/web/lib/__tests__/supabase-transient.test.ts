import { describe, expect, it } from "vitest";
import { isTransientSupabaseFailure } from "@/lib/supabase-transient";

describe("isTransientSupabaseFailure", () => {
  it.each([
    [{ status: 500 }], [{ status: 504, error: { message: "Gateway Timeout" } }],
    [{ status: 0 }], [{ name: "AuthRetryableFetchError" }],
    [{ status: 503 }], [{ code: "PGRST003" }],
    [new Error("Gateway Timeout")], [new Error("Bad Gateway")],
    [new Error("Service Unavailable")], [new Error("fetch failed")],
    [new Error("network unavailable")], [new Error("ECONNRESET")],
    [new Error("ETIMEDOUT")], [new Error("socket hang up")]
  ])("recognizes transient failure %#", (input) => {
    expect(isTransientSupabaseFailure(input)).toBe(true);
  });

  it.each([
    [{ name: "AuthSessionMissingError", status: 0 }],
    [{ status: 401, message: "network failure" }], [{ status: 403, message: "Gateway Timeout" }],
    [{ status: 400 }], [{ status: 404 }], [{ status: 429 }],
    [{ code: "42501", status: 500 }], [{ code: "PGRST301", status: 500 }],
    [{ code: "PGRST302", status: 500 }], [{ code: "PGRST116", status: 500 }],
    [{ error: { message: "Gateway Timeout" } }], [{ message: "invalid JWT" }],
    [{ message: "permission denied" }],
    [{ status: 500, error: { status: 401, message: "network failure" } }]
  ])("rejects non-transient failure %#", (input) => {
    expect(isTransientSupabaseFailure(input)).toBe(false);
  });
});
