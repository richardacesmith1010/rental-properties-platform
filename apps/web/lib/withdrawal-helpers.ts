import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export const SCHEMA_ERROR_MESSAGE =
  "Withdrawal requests require a database update before they can be used.";

export function isSchemaConstraintError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  return (
    error.code === "23514" ||
    error.message?.toLowerCase().includes("check constraint") === true
  );
}

export function isWithdrawalSchemaDriftError(error: { code?: string; message?: string } | null | undefined) {
  return isMissingSchemaError(error) || isSchemaConstraintError(error);
}

export async function restoreWithdrawalStatus(
  admin: ReturnType<typeof createAdminClient>,
  withdrawalId: string,
  status: "approved" | "failed"
) {
  const { error } = await admin.from("withdrawal_requests").update({ status }).eq("id", withdrawalId);
  if (error && !isWithdrawalSchemaDriftError(error)) {
    console.error("restoreWithdrawalStatus error:", error);
  }
}

export function parseAmountCents(formData: FormData) {
  const rawAmountCents = formData.get("amountCents");
  if (typeof rawAmountCents === "string" && rawAmountCents.trim().length > 0) {
    const parsed = Number.parseInt(rawAmountCents, 10);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  const rawAmountDollars = formData.get("amountDollars");
  if (typeof rawAmountDollars === "string" && rawAmountDollars.trim().length > 0) {
    const parsed = Number.parseFloat(rawAmountDollars);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
  }

  return Number.NaN;
}
