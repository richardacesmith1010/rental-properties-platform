const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export interface FailureReservation {
  readonly key: string;
  readonly windowId: number;
  readonly id: number;
}

interface FailureLimitEntry {
  windowId: number;
  failures: number;
  open: Set<number>;
  resetAt: number;
}

const failureLimitMap = new Map<string, FailureLimitEntry>();
let nextFailureWindowId = 1;
let nextFailureReservationId = 1;

function createFailureLimitEntry(now: number, windowMs: number): FailureLimitEntry {
  return {
    windowId: nextFailureWindowId++,
    failures: 0,
    open: new Set<number>(),
    resetAt: now + windowMs
  };
}

export function reserveFailureAttempt(
  key: string,
  maxFailures: number,
  windowMs: number
): { allowed: false } | { allowed: true; reservation: FailureReservation } {
  const now = Date.now();
  let entry = failureLimitMap.get(key);

  if (entry && now > entry.resetAt) {
    entry = createFailureLimitEntry(now, windowMs);
    failureLimitMap.set(key, entry);
  }

  if (entry ? entry.failures + entry.open.size >= maxFailures : 0 >= maxFailures) {
    return { allowed: false };
  }

  if (!entry) {
    entry = createFailureLimitEntry(now, windowMs);
    failureLimitMap.set(key, entry);
  }

  const reservation: FailureReservation = {
    key,
    windowId: entry.windowId,
    id: nextFailureReservationId++
  };
  entry.open.add(reservation.id);

  return { allowed: true, reservation };
}

export function completeFailureAttempt(
  reservation: FailureReservation,
  outcome: "rejected" | "succeeded" | "errored"
): void {
  const entry = failureLimitMap.get(reservation.key);

  if (
    !entry ||
    entry.windowId !== reservation.windowId ||
    !entry.open.has(reservation.id)
  ) {
    return;
  }

  entry.open.delete(reservation.id);

  if (outcome === "rejected") {
    entry.failures += 1;
  } else if (outcome === "succeeded") {
    failureLimitMap.delete(reservation.key);
    return;
  }

  if (entry.failures === 0 && entry.open.size === 0) {
    failureLimitMap.delete(reservation.key);
  }
}

/** @internal test-only */
export function resetFailureLimiterState() {
  failureLimitMap.clear();
}

export function checkRateLimit(
  key: string,
  maxRequests = 100,
  windowMs = 60_000
): { allowed: boolean; remaining: number } {
  const normalizedMaxRequests = Math.max(0, Math.floor(maxRequests));

  if (normalizedMaxRequests === 0) {
    return {
      allowed: false,
      remaining: 0
    };
  }

  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return {
      allowed: true,
      remaining: normalizedMaxRequests - 1
    };
  }

  entry.count += 1;
  if (entry.count > normalizedMaxRequests) {
    return {
      allowed: false,
      remaining: 0
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, normalizedMaxRequests - entry.count)
  };
}

/** @internal test-only */
export function resetRateLimitState() {
  rateLimitMap.clear();
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetAt) {
        rateLimitMap.delete(key);
      }
    }
    for (const [key, value] of failureLimitMap.entries()) {
      if (now > value.resetAt && value.open.size === 0) {
        failureLimitMap.delete(key);
      }
    }
  }, 300_000);
}
