import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserRole, getUserProfileSummary } from "@/lib/auth";
import {
  buildAiContextSummary,
  buildAiSystemPrompt
} from "@/lib/ai-assistant";
import type { DashboardData } from "@/lib/dashboard";
import { getDashboardData } from "@/lib/dashboard";
import type { MaintenanceTicket } from "@/lib/maintenance";
import { getAdminMaintenanceTickets } from "@/lib/maintenance";
import type { PortfolioData } from "@/lib/portfolio";
import { getPortfolioData } from "@/lib/portfolio";
import {
  getAdministeredPropertyIds,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const AI_MODEL = "claude-haiku-4-5";
const HOURLY_REQUEST_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;
const MISSING_KEY_MESSAGE =
  "The AI assistant isn't set up yet. Ask your account owner to add the API key in settings.";

const aiChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1)
      })
    )
    .min(1),
  accountId: z.string().trim().optional()
});

interface AiRecentPayment {
  tenantName: string;
  amountCents: number;
  paidAt: string;
}

function toTenantLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "Unknown tenant";
  }

  const [firstName, ...rest] = trimmed.split(/\s+/).filter(Boolean);
  if (!firstName) {
    return "Unknown tenant";
  }

  const lastToken = rest[rest.length - 1];
  if (!lastToken) {
    return firstName;
  }

  return `${firstName} ${lastToken.charAt(0).toUpperCase()}.`;
}

function buildPropertyRows(portfolio: PortfolioData) {
  const occupiedUnitsByPropertyId = new Map<string, number>();

  for (const lease of portfolio.leases) {
    if (!lease.active || lease.leaseStatus === "terminated" || lease.leaseStatus === "expired") {
      continue;
    }

    occupiedUnitsByPropertyId.set(
      lease.propertyId,
      (occupiedUnitsByPropertyId.get(lease.propertyId) ?? 0) + 1
    );
  }

  return portfolio.properties.map((property) => ({
    name: property.name,
    unitCount: property.unitCount,
    occupiedCount: occupiedUnitsByPropertyId.get(property.id) ?? 0
  }));
}

function buildActiveLeaseRows(portfolio: PortfolioData) {
  return portfolio.leases
    .filter((lease) => lease.active && lease.leaseStatus !== "terminated" && lease.leaseStatus !== "expired")
    .slice(0, 8)
    .map((lease) => ({
      tenantName: toTenantLabel(lease.tenantName),
      rentCents: lease.monthlyRentCents,
      propertyName: lease.propertyName ?? "Unknown Property",
      endDate: lease.endDate
    }));
}

function buildOutstandingChargeRows(dashboard: DashboardData) {
  return dashboard.charges
    .filter((charge) => charge.status === "pending" || charge.status === "late")
    .slice(0, 8)
    .map((charge) => ({
      tenantName: toTenantLabel(charge.tenantName),
      amountCents: charge.amountCents,
      dueDate: charge.dueDate,
      status: charge.status
    }));
}

function buildOpenTicketRows(tickets: MaintenanceTicket[]) {
  return tickets
    .filter((ticket) => ticket.status !== "resolved" && ticket.status !== "closed")
    .slice(0, 8)
    .map((ticket) => ({
      title: ticket.title,
      status: ticket.status.replace(/_/g, " "),
      propertyName: ticket.propertyName
    }));
}

function createTextStreamResponse(message: string) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(message));
        controller.close();
      }
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

async function getRecentPaymentsForAi(userId: string, accountId?: string) {
  const admin = createAdminClient();
  const propertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId, admin)
    : await getAdministeredPropertyIds(userId, admin);

  if (propertyIds.length === 0) {
    return [] as AiRecentPayment[];
  }

  const { data: units } = await admin
    .from("units")
    .select("id, property_id")
    .in("property_id", propertyIds);

  const unitIds = (units ?? []).map((unit) => unit.id);
  if (unitIds.length === 0) {
    return [] as AiRecentPayment[];
  }

  const { data: leases } = await admin
    .from("leases")
    .select("id, unit_id, tenant_profile_id")
    .in("unit_id", unitIds);

  const leaseRows =
    (leases ?? []) as Array<{
      id: string;
      unit_id: string;
      tenant_profile_id: string | null;
    }>;
  const leaseIds = leaseRows.map((lease) => lease.id);
  if (leaseIds.length === 0) {
    return [] as AiRecentPayment[];
  }

  const { data: charges } = await admin
    .from("rent_charges")
    .select("id, lease_id")
    .in("lease_id", leaseIds);

  const chargeRows =
    (charges ?? []) as Array<{
      id: string;
      lease_id: string;
    }>;
  const chargeIds = chargeRows.map((charge) => charge.id);
  if (chargeIds.length === 0) {
    return [] as AiRecentPayment[];
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const { data: payments } = await admin
    .from("payments")
    .select("rent_charge_id, amount_cents, paid_at")
    .in("rent_charge_id", chargeIds)
    .gte("paid_at", thirtyDaysAgo.toISOString())
    .order("paid_at", { ascending: false })
    .limit(10);

  const paymentRows =
    (payments ?? []) as Array<{
      rent_charge_id: string;
      amount_cents: number;
      paid_at: string;
    }>;
  if (paymentRows.length === 0) {
    return [] as AiRecentPayment[];
  }

  const tenantIds = Array.from(
    new Set(
      leaseRows
        .map((lease) => lease.tenant_profile_id)
        .filter((tenantId): tenantId is string => Boolean(tenantId))
    )
  );

  const { data: tenantProfiles } = tenantIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", tenantIds)
    : {
        data: [] as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
        }>
      };

  const leaseById = new Map(leaseRows.map((lease) => [lease.id, lease]));
  const chargeById = new Map(chargeRows.map((charge) => [charge.id, charge]));
  const tenantNameById = new Map(
    (tenantProfiles ?? []).map((profile) => [
      profile.id,
      profile.full_name ?? profile.email ?? "Unknown tenant"
    ])
  );

  return paymentRows
    .map((payment) => {
      const charge = chargeById.get(payment.rent_charge_id);
      const lease = charge ? leaseById.get(charge.lease_id) : null;
      const tenantName = lease?.tenant_profile_id
        ? tenantNameById.get(lease.tenant_profile_id) ?? "Unknown tenant"
        : "Unknown tenant";

      return {
        tenantName,
        amountCents: payment.amount_cents,
        paidAt: payment.paid_at
      };
    })
    .filter((payment) => Boolean(payment.tenantName));
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getCurrentUserRole(user.id);
  if (role === "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!checkRateLimit(`askDomus:${user.id}`, HOURLY_REQUEST_LIMIT, HOUR_MS).allowed) {
    return NextResponse.json(
      { error: "You've sent a lot of messages. Try again in an hour." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = aiChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Please send a message." }, { status: 400 });
  }

  const accountId = parsed.data.accountId && parsed.data.accountId.length > 0
    ? parsed.data.accountId
    : undefined;

  if (!process.env.ANTHROPIC_API_KEY) {
    return createTextStreamResponse(MISSING_KEY_MESSAGE);
  }

  try {
    const [profile, portfolio, dashboard, tickets, recentPayments] = await Promise.all([
      getUserProfileSummary(user.id),
      getPortfolioData(user.id, accountId),
      getDashboardData(user.id, accountId),
      getAdminMaintenanceTickets(user.id, accountId),
      getRecentPaymentsForAi(user.id, accountId)
    ]);

    const contextSummary = buildAiContextSummary({
      properties: buildPropertyRows(portfolio),
      activeLeases: buildActiveLeaseRows(portfolio),
      outstandingCharges: buildOutstandingChargeRows(dashboard),
      openTickets: buildOpenTicketRows(tickets),
      recentPayments: recentPayments.map((payment) => ({
        ...payment,
        tenantName: toTenantLabel(payment.tenantName)
      }))
    });
    const system = buildAiSystemPrompt({
      ownerFirstName: profile.nickname ?? profile.fullName ?? user.email ?? null,
      contextSummary
    });

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    const stream = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 700,
      system,
      messages: parsed.data.messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      stream: true
    });
    const encoder = new TextEncoder();

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const event of stream) {
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta" &&
                event.delta.text
              ) {
                controller.enqueue(encoder.encode(event.delta.text));
              }
            }
          } catch {
            controller.enqueue(encoder.encode("Something went wrong. Try again."));
          } finally {
            controller.close();
          }
        }
      }),
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Ask Domus chat error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
