"use server";

import { requireAuth } from "@/app/actions/auth-helpers";
import { getOwnerStatement, StatementAccessError } from "@/lib/owner-statement";
import { isStatementMonth } from "@/lib/statement-month";
import { ownerStatementRequestSchema } from "@/lib/validations";

export async function getOwnerStatementSummary(accountId: string, month: string) {
  const { user } = await requireAuth("manager");
  const parsed = ownerStatementRequestSchema.safeParse({ accountId, month });
  if (!parsed.success || !isStatementMonth(month)) return { success: false as const, error: "Pick a month from the list." };
  try {
    const statement = await getOwnerStatement(user.id, accountId, month);
    return { success: true as const, totals: statement.totals, homeCount: statement.homes.length };
  } catch (error) {
    if (error instanceof StatementAccessError) return { success: false as const, error: "You can't see this client." };
    console.error("Owner statement summary failed", error);
    return { success: false as const, error: "Could not load the statement. Please try again." };
  }
}
