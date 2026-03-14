import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { logFailedSideEffect, sideEffectError } from "../logger";

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
});

describe("logFailedSideEffect", () => {
  test("logs structured JSON to console.error", () => {
    logFailedSideEffect(
      {
        action: "createProperty",
        operation: "award_xp",
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
    expect(logged.operation).toBe("award_xp");
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
