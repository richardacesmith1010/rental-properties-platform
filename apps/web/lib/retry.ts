export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryIf?: (error: unknown) => boolean;
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
  const baseDelayMs = Math.max(0, options?.baseDelayMs ?? 500);
  const maxDelayMs = Math.max(0, options?.maxDelayMs ?? 5000);
  const backoffMultiplier = Math.max(1, options?.backoffMultiplier ?? 2);
  const retryIf = options?.retryIf;

  let lastError: unknown = new Error("Retry operation failed without an error.");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (retryIf && !retryIf(error)) {
        throw error;
      }

      if (attempt === maxAttempts) {
        throw error;
      }

      const delayMs = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );

      await sleep(delayMs);
    }
  }

  throw lastError;
}
