/**
 * Structured logger for fire-and-forget operations.
 * In production, these would feed into a log aggregator.
 * For now, emit structured JSON so failures are parseable.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const queryScope = new AsyncLocalStorage<{ queries: number }>();

export function countSupabaseRequest(input: RequestInfo | URL): void {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/rest/v1/")) {
    const scope = queryScope.getStore();
    if (scope) scope.queries++;
  }
}

// The Supabase helpers also appear in client import graphs; register this server-only hook without importing Node code there.
Reflect.set(globalThis, Symbol.for("domus.perf.countSupabaseRequest"), countSupabaseRequest);

export async function measureQueryCount<T>(work: () => Promise<T>, onComplete: (queries: number) => void): Promise<T> {
  const scope = { queries: 0 };
  return queryScope.run(scope, async () => {
    try {
      return await work();
    } finally {
      onComplete(scope.queries);
    }
  });
}

export interface LogContext {
  action: string;
  operation: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
}

export interface PerfLogContext {
  scope: string;
  name: string;
  durationMs: number;
  meta?: Record<string, unknown>;
}

export function logFailedSideEffect(ctx: LogContext, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  console.error(
    JSON.stringify({
      level: "warn",
      type: "failed_side_effect",
      timestamp: new Date().toISOString(),
      action: ctx.action,
      operation: ctx.operation,
      userId: ctx.userId ?? "unknown",
      entityType: ctx.entityType ?? "unknown",
      entityId: ctx.entityId ?? "unknown",
      error: message
    })
  );
}

export function sideEffectError(
  action: string,
  operation: string,
  ctx?: Partial<Omit<LogContext, "action" | "operation">>
): (error: unknown) => void {
  return (error: unknown) => {
    logFailedSideEffect(
      {
        action,
        operation,
        ...ctx
      },
      error
    );
  };
}

function normalizePerfDuration(durationMs: number) {
  return Number(durationMs.toFixed(1));
}

export function logPerfEvent({ scope, name, durationMs, meta }: PerfLogContext): void {
  console.info(
    `[perf:${scope}] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      scope,
      name,
      durationMs: normalizePerfDuration(durationMs),
      ...(meta ?? {})
    })}`
  );
}

export async function measurePerf<T>(
  scope: string,
  name: string,
  work: () => Promise<T>,
  meta?: Record<string, unknown>
): Promise<T> {
  const startedAt = performance.now();
  let status = "ok";
  return measureQueryCount(async () => {
    try {
      return await work();
    } catch (error) {
      status = "error";
      throw error;
    }
  }, queries => logPerfEvent({
    scope, name, durationMs: performance.now() - startedAt,
    meta: { status, ...(meta ?? {}), queries }
  }));
}
