import { agreementApiResponse } from "@/lib/legal-acceptance";
import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError } from "@anthropic-ai/sdk";
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
import { getRecentPaymentsForAi } from "@/lib/ai-recent-payments";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendPlatformAlert } from "@/lib/platform-alerts";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const AI_MODEL = "claude-haiku-4-5";
const HOURLY_REQUEST_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;
const MISSING_KEY_MESSAGE =
  "The AI assistant isn't set up yet. Ask your account owner to add the API key in settings.";
const PROVIDER_UNAVAILABLE_MESSAGE = "Ask Domus is resting. Try again later.";

function providerUnavailableKind(error: unknown):
  "billing" | "auth" | "rate_limit" | "overloaded" | "connection" | null {
  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) return "connection";
  if (!(error instanceof APIError)) return null;

  const status = error.status;
  const detail = error.error as { error?: { message?: unknown; type?: unknown }; message?: unknown } | undefined;
  const message = typeof detail?.error?.message === "string" ? detail.error.message
    : typeof detail?.message === "string" ? detail.message : error.message;

  if (status === 402 || (status === 400 && /credit balance/i.test(message))) return "billing";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 529 || (status !== undefined && status >= 500 && status <= 504)) return "overloaded";
  return null;
}

function alertProviderUnavailable(error: APIError, kind: NonNullable<ReturnType<typeof providerUnavailableKind>>) {
  const status = error.status ?? "unknown";
  const requestId = error.requestID ?? "unknown";
  console.error("Ask Domus provider unavailable:", kind, status, requestId);
  void sendPlatformAlert({
    subject: "Ask Domus is unavailable",
    body: `${kind} — status ${status}, request ${requestId}, ${new Date().toISOString()}. Users see: Ask Domus is resting.`,
    dedupeKey: `ask-domus-provider:${kind}`
  });
}

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

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const agreement = await agreementApiResponse(supabase, user);
  if (agreement) return agreement;


  const body = await request.json().catch(() => null);
  const parsed = aiChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Please send a message." }, { status: 400 });
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!checkRateLimit(`askDomus:${user.id}`, HOURLY_REQUEST_LIMIT, HOUR_MS).allowed) {
    return NextResponse.json(
      { error: "You've sent a lot of messages. Try again in an hour." },
      { status: 429 }
    );
  }

  const accountId = parsed.data.accountId && parsed.data.accountId.length > 0
    ? parsed.data.accountId
    : undefined;

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
      ownerFirstName: profile.nickname ?? profile.fullName ?? null,
      contextSummary
    });

    const { data: consent, error: consentError } = await createAdminClient().from("profiles")
      .select("ai_consent_at").eq("id", user.id).single();
    if (consentError) throw consentError;
    if (!consent?.ai_consent_at) {
      return NextResponse.json({ error: "Turn on Ask Domus in Settings first." }, { status: 403 });
    }
    if (!process.env.ANTHROPIC_API_KEY) return createTextStreamResponse(MISSING_KEY_MESSAGE);

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
          } catch (error) {
            const kind = providerUnavailableKind(error);
            if (kind) alertProviderUnavailable(error as APIError, kind);
            controller.enqueue(encoder.encode(kind ? PROVIDER_UNAVAILABLE_MESSAGE : "Something went wrong. Try again."));
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
    const kind = providerUnavailableKind(error);
    if (kind) {
      alertProviderUnavailable(error as APIError, kind);
      return NextResponse.json({ error: PROVIDER_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Ask Domus chat error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
