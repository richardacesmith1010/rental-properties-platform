import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { countSupabaseRequest, logFailedSideEffect, measurePerf, measureQueryCount, sideEffectError } from "../logger";
import { createAdminClient } from "../supabase/admin";

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("logFailedSideEffect", () => {
  test("logs structured JSON to console.error", () => {
    logFailedSideEffect(
      {
        action: "createProperty",
        operation: "sample_operation",
        userId: "user-123",
        entityType: "property",
        entityId: "prop-456"
      },
      new Error("XP award failed")
    );

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.level).toBe("warn");
    expect(logged.type).toBe("failed_side_effect");
    expect(logged.action).toBe("createProperty");
    expect(logged.operation).toBe("sample_operation");
    expect(logged.userId).toBe("user-123");
    expect(logged.entityType).toBe("property");
    expect(logged.entityId).toBe("prop-456");
    expect(logged.error).toBe("XP award failed");
    expect(logged.timestamp).toBeDefined();
  });

  test("handles string errors", () => {
    logFailedSideEffect(
      {
        action: "test",
        operation: "test"
      },
      "string error"
    );

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.error).toBe("string error");
  });

  test("handles null errors", () => {
    logFailedSideEffect(
      {
        action: "test",
        operation: "test"
      },
      null
    );

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.error).toBe("null");
  });

  test("defaults missing identifiers to unknown", () => {
    logFailedSideEffect(
      {
        action: "test",
        operation: "test"
      },
      new Error("fail")
    );

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.userId).toBe("unknown");
    expect(logged.entityType).toBe("unknown");
    expect(logged.entityId).toBe("unknown");
  });

  test("stringifies numeric errors", () => {
    logFailedSideEffect(
      {
        action: "test",
        operation: "numeric"
      },
      404
    );

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.error).toBe("404");
  });
});

describe("sideEffectError", () => {
  test("returns a function that logs when called", () => {
    const handler = sideEffectError("myAction", "myOp", { userId: "u1" });

    handler(new Error("boom"));

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.action).toBe("myAction");
    expect(logged.operation).toBe("myOp");
    expect(logged.userId).toBe("u1");
  });

  test("can be used directly as a promise catch handler", async () => {
    await Promise.reject(new Error("async fail")).catch(
      sideEffectError("asyncAction", "asyncOp")
    );

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.action).toBe("asyncAction");
    expect(logged.operation).toBe("asyncOp");
  });

  test("merges partial context with required action metadata", () => {
    sideEffectError("leaseAction", "notify_tenant", {
      entityType: "lease",
      entityId: "lease-1"
    })(new Error("notify failed"));

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.action).toBe("leaseAction");
    expect(logged.operation).toBe("notify_tenant");
    expect(logged.entityType).toBe("lease");
    expect(logged.entityId).toBe("lease-1");
    expect(logged.userId).toBe("unknown");
  });
});

describe("Supabase round-trip counting", () => {
  test("counts a real admin-client REST fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const request = vi.fn(async () => new Response("[]", {
      status: 200, headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", request);
    let queries = -1;
    await measureQueryCount(async () => await createAdminClient().from("properties").select("id"), count => { queries = count; });
    expect(request).toHaveBeenCalledOnce();
    expect(queries).toBe(1);
  });

  test("counts REST requests independently for concurrent bundle scopes", async () => {
    const counts: number[] = [];
    await Promise.all([
      measureQueryCount(async () => {
        countSupabaseRequest("https://db.example/rest/v1/properties?select=id");
        await Promise.resolve();
        countSupabaseRequest("https://db.example/rest/v1/rpc/home_summary");
      }, count => counts.push(count)),
      measureQueryCount(async () => {
        countSupabaseRequest("https://db.example/auth/v1/user");
        countSupabaseRequest("https://db.example/rest/v1/leases?select=id");
      }, count => counts.push(count))
    ]);
    expect(counts.sort()).toEqual([1, 2]);
    await measureQueryCount(async () => {}, count => counts.push(count));
    expect(counts.at(-1)).toBe(0);
  });

  test("logs the query count on owner and tenant bundle events", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    for (const scope of ["owner", "tenant"]) {
      await measurePerf(scope, "bundle", async () => {
        countSupabaseRequest("https://db.example/rest/v1/units");
      });
    }
    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls.map(([line]) => JSON.parse(String(line).split(" ", 2)[1]).queries)).toEqual([1, 1]);
    info.mockRestore();
  });

  test("keeps database error details out of perf events", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(measurePerf("owner", "bundle", async () => {
      countSupabaseRequest("https://db.example/rest/v1/properties");
      throw new Error("SQL detail that must stay out of perf logs");
    })).rejects.toThrow("SQL detail");
    const event = JSON.parse(String(info.mock.calls[0][0]).split(" ", 2)[1]);
    expect(event).toMatchObject({ status: "error", queries: 1 });
    expect(event).not.toHaveProperty("error");
    info.mockRestore();
  });
});
