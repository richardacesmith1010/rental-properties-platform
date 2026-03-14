/**
 * Detect Supabase errors for missing tables/columns/schema cache.
 * Used throughout the app for graceful degradation when migrations
 * haven't been applied yet.
 */
export function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as { code?: string; message?: string };
  return (
    err.code === "42P01" ||
    err.code === "42703" ||
    err.code === "PGRST205" ||
    (typeof err.message === "string" &&
      ((err.message.includes("relation") && err.message.includes("does not exist")) ||
        (err.message.includes("column") && err.message.includes("does not exist")) ||
        err.message.includes("could not find the table")))
  );
}
