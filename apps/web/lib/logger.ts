/**
 * Structured logger for fire-and-forget operations.
 * In production, these would feed into a log aggregator.
 * For now, emit structured JSON so failures are parseable.
 */

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

  try {
    const result = await work();
    logPerfEvent({
      scope,
      name,
      durationMs: performance.now() - startedAt,
      meta: {
        status: "ok",
        ...(meta ?? {})
      }
    });
    return result;
  } catch (error) {
    logPerfEvent({
      scope,
      name,
      durationMs: performance.now() - startedAt,
      meta: {
        status: "error",
        ...(meta ?? {}),
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}
