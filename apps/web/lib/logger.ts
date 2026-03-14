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
