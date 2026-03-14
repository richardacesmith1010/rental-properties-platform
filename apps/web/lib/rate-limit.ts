const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

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
  }, 300_000);
}
