import { withRetry } from "@/lib/retry";

const ACCOUNT_CHECK_ERROR = "Account check is unavailable. Please try again.";
const transientMessage =
  /gateway timeout|bad gateway|service unavailable|fetch failed|network|ECONNRESET|ETIMEDOUT|socket hang up/i;

type Failure = { name?: unknown; code?: unknown; status?: unknown; message?: unknown; error?: unknown };

function details(input: unknown): Failure {
  return input !== null && typeof input === "object" ? input as Failure : {};
}

export function isUnauthenticatedAuthError(error: unknown): boolean {
  const value = details(error);
  return value.name === "AuthSessionMissingError" || value.status === 401 || value.status === 403;
}

export function isTransientSupabaseFailure(input: { error?: unknown; status?: number } | unknown): boolean {
  const outer = details(input);
  const error = outer.error === undefined ? input : outer.error;
  const value = details(error);
  const status = typeof outer.status === "number" ? outer.status : value.status;
  const code = value.code;

  if (value.name === "AuthSessionMissingError" || code === "PGRST116" || code === "42501" ||
      code === "PGRST301" || code === "PGRST302") return false;
  if ((typeof outer.status === "number" && outer.status >= 400 && outer.status < 500) ||
      (typeof value.status === "number" && value.status >= 400 && value.status < 500)) return false;
  if (status === 0 || (typeof status === "number" && status >= 500)) return true;
  if (value.name === "AuthRetryableFetchError" || code === "PGRST003") return true;
  // Message matching is reserved for thrown runtime errors without a structured Supabase status.
  return outer.error === undefined && typeof value.message === "string" && transientMessage.test(value.message);
}

class ResultFailure extends Error {
  constructor(readonly original: unknown, readonly status?: number) {
    super(ACCOUNT_CHECK_ERROR);
  }
}

export function checkedSupabaseCall<T extends { error?: unknown; status?: number }>(call: () => PromiseLike<T>): Promise<T>;
export function checkedSupabaseCall<T extends { error?: unknown; status?: number }>(
  call: () => PromiseLike<T>, allowedError: (error: unknown) => boolean
): Promise<T | null>;
export async function checkedSupabaseCall<T extends { error?: unknown; status?: number }>(
  call: () => PromiseLike<T>,
  allowedError?: (error: unknown) => boolean
): Promise<T | null> {
  try {
    return await withRetry(async () => {
      try {
        const result = await call();
        if (result.error && allowedError?.(result.error)) return result;
        if (result.error || (typeof result.status === "number" && (result.status === 0 || result.status >= 400))) {
          throw new ResultFailure(result.error ?? new Error(ACCOUNT_CHECK_ERROR), result.status);
        }
        return result;
      } catch (error) {
        if (allowedError?.(error)) return null;
        throw error;
      }
    }, {
      maxAttempts: 2,
      baseDelayMs: 300,
      retryIf: (error) => error instanceof ResultFailure
        ? isTransientSupabaseFailure({ error: error.original, status: error.status })
        : isTransientSupabaseFailure(error)
    });
  } catch (error) {
    throw new Error(ACCOUNT_CHECK_ERROR, { cause: error instanceof ResultFailure ? error.original : error });
  }
}
