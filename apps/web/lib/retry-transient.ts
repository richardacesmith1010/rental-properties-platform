type Failure = { name?: unknown; code?: unknown; status?: unknown; message?: unknown };

function fields(error: unknown): Failure {
  return error !== null && typeof error === "object" ? error as Failure : {};
}

function isTransient(error: unknown): boolean {
  const failure = fields(error);
  const code = failure.code;
  const status = failure.status;
  return (error instanceof TypeError && error.message.includes("fetch failed")) ||
    code === "ECONNRESET" || code === "ETIMEDOUT" || code === "UND_ERR_SOCKET" ||
    (typeof status === "number" && status >= 500) ||
    code === "PGRST301" || (typeof code === "string" && code.startsWith("57"));
}

export async function withOneRetry<T>(step: string, fn: () => Promise<T>): Promise<T> {
  void step;
  try {
    return await fn();
  } catch (error) {
    if (!isTransient(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return fn();
  }
}

export function logOwnerMoneyLoadFailure(step: string, error: unknown): void {
  const failure = fields(error);
  const name = typeof failure.name === "string" &&
    ["Error", "TypeError", "PostgrestError", "AuthApiError"].includes(failure.name)
    ? failure.name : error instanceof TypeError ? "TypeError" : error instanceof Error ? "Error" : "UnknownError";
  const code = typeof failure.code === "string" &&
    /^(?:[A-Z0-9]{5}|PGRST[0-9]{3}|ECONNRESET|ETIMEDOUT|UND_ERR_SOCKET)$/.test(failure.code)
    ? failure.code : undefined;
  const status = typeof failure.status === "number" && failure.status >= 100 && failure.status <= 599
    ? failure.status : undefined;
  // Database messages can contain row values, credentials or URLs. Keep only known transport messages.
  const message = error instanceof TypeError && error.message.includes("fetch failed")
    ? "fetch failed" : "Request failed";
  console.error("[owner-money-load-failed]", { step, name, code, status, message: message.slice(0, 160) });
}
