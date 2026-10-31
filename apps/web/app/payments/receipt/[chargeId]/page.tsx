import { getAuthenticatedUser } from "@/lib/auth";
import { paymentMethodLabel } from "@/lib/payment-method-label";
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { formatCurrency, formatDate, formatUnitLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PrintButton } from "./print-button";
import { chargeBreakdown, type ChargeLine } from "@/lib/charge-lines";
import { isMissingSchemaError } from "@/lib/supabase-errors";

interface ReceiptPageProps {
  params: Promise<{
    chargeId: string;
  }>;
}

export default async function ReceiptPage(props: ReceiptPageProps) {
  const params = await props.params;
  const supabase = createClient();
  const user = await getAuthenticatedUser();

  const role = await getCurrentUserRole(user.id);
  if (role !== "tenant") {
    redirect("/");
  }

  const chargeQuery = await withChargeEditingFallback(
    () =>
      supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, category")
        .eq("id", params.chargeId)
        .is("deleted_at", null)
        .maybeSingle(),
    () =>
      supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, category")
        .eq("id", params.chargeId)
        .maybeSingle()
  );
  if (chargeQuery.error) throw chargeQuery.error;
  const charge = chargeQuery.data;

  if (!charge) {
    notFound();
  }

  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();
  if (leaseError) throw leaseError;

  if (!lease || lease.tenant_profile_id !== user.id) {
    notFound();
  }

  const [paymentResult, unitResult] = await Promise.all([
    supabase
      .from("payments")
      .select("id, paid_at, amount_cents, method, reference_note")
      .eq("rent_charge_id", charge.id)
      .is("reversed_at", null)
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("units")
      .select("id, unit_number, property_id")
      .eq("id", lease.unit_id)
      .maybeSingle()
  ]);
  if (paymentResult.error) throw paymentResult.error;
  if (unitResult.error) throw unitResult.error;
  const payment = paymentResult.data;
  const unit = unitResult.data;

  if (!unit) {
    notFound();
  }

  if (!payment) {
    const { data: reversedPayment, error } = await supabase.from("payments")
      .select("id").eq("rent_charge_id", charge.id).not("reversed_at", "is", null).limit(1).maybeSingle();
    if (error) throw error;
    if (!reversedPayment) notFound();
    return (
      <main className="app-surface min-h-screen px-6 pb-8 pt-[calc(env(safe-area-inset-top,0px)+2rem)] lg:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <h1 className="font-display text-2xl font-semibold text-[var(--ink)]">This payment was reversed</h1>
          <p className="text-[var(--muted)]">It no longer counts as paid.</p>
          <Link href="/tenant?section=charges" className="inline-flex min-h-11 items-center text-[var(--accent)]">
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", unit.property_id)
    .maybeSingle();
  if (propertyError) throw propertyError;

  if (!property) {
    notFound();
  }
  const { data: rawLines, error: linesError } = await supabase.from("rent_charge_lines")
    .select("id, lease_id, charge_id, kind, label, amount_cents").eq("charge_id", charge.id);
  if (linesError && !isMissingSchemaError(linesError)) throw linesError;
  const lines = (rawLines ?? []) as ChargeLine[];
  const parts = chargeBreakdown(charge, lines);

  return (
    <main className="app-surface min-h-screen px-6 pb-8 pt-[calc(env(safe-area-inset-top,0px)+2rem)] lg:px-8">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              [data-print-controls="receipt"] {
                display: none !important;
              }
              body, .app-surface {
                background: white !important;
                color: #0B0C0E !important;
              }
              [data-print-document="receipt"] {
                --ground: #F3F4F6;
                --surface: #FFFFFF;
                --surface-2: #F7F8F9;
                --surface-3: #ECEEF1;
                --ink: #0B0C0E;
                --ink-2: #2E3238;
                --muted: #4D535C;
                --faint: #6B717B;
                --line: #D9DCE1;
                --line-2: #C2C7CE;
                --accent: #2442B8;
                --accent-strong: #182F8A;
                --accent-weak: #E8ECFA;
                --accent-line: #BAC5EE;
                --crit: #B4232A;
                --crit-bg: #FBE7E7;
                --warn: #7A4B00;
                --warn-bg: #FFF1D6;
                --pos: #0E7A3E;
                --pos-bg: #DDF3E6;
                --shadow-sm: 0 8px 20px -18px rgba(25, 27, 30, 0.16);
                --shadow-md: 0 18px 40px -28px rgba(25, 27, 30, 0.2);
                --shadow-lg: 0 28px 64px -36px rgba(25, 27, 30, 0.34);
                --domus-skeleton-highlight: hsl(0 0% 100% / 0.55);
                --domus-primary: var(--accent);
                --domus-primary-light: var(--accent-line);
                --domus-secondary: var(--pos);
                --domus-accent: var(--accent-strong);
                --domus-danger: var(--crit);
                --domus-body-bg: var(--ground);
                --domus-body-text: var(--ink);
                --domus-surface-bg: var(--ground);
                --domus-sidebar-bg: var(--surface);
                --domus-card-bg: var(--surface);
                --domus-card-border: var(--line);
                --domus-card-hover: var(--surface-2);
                --domus-primary-glow: var(--accent-line);
                --domus-input-bg: var(--surface);
                --domus-input-border: var(--line);
                --domus-muted-text: var(--muted);
                --domus-heading-text: var(--ink);
                --domus-divider: var(--line);
                --domus-badge-bg: var(--accent-weak);
                --domus-badge-text: var(--accent);
                --domus-success-bg: var(--pos-bg);
                --domus-success-text: var(--pos);
                --domus-warning-bg: var(--warn-bg);
                --domus-warning-text: var(--warn);
                --domus-danger-bg: var(--crit-bg);
                --domus-danger-text: var(--crit);
                --domus-skeleton: var(--surface-3);
                --domus-skeleton-bg: var(--surface-3);
                --domus-table-row-hover: var(--surface-2);
                --domus-tooltip-bg: var(--ink);
                --domus-tooltip-text: var(--surface);
                --domus-shadow-sm: var(--shadow-sm);
                --domus-shadow-md: var(--shadow-md);
                --domus-shadow-lg: var(--shadow-lg);
                --domus-glow: 0 0 0 transparent;
                background: #FFFFFF !important;
                border-color: #D9DCE1 !important;
                box-shadow: none !important;
              }
            }
          `
        }}
      />
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" data-print-controls="receipt">
          <div>
            <Link href="/tenant?section=charges"
              className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-[var(--accent)]">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />Back to Rent
            </Link>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">Domus</p>
            <h1 className="font-display mt-2 text-2xl font-semibold text-[var(--ink)]">Payment Receipt</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/api/pdf/receipt/${params.chargeId}`}
              className={[
                "inline-flex h-11 items-center gap-2 rounded-xl border border-transparent bg-[var(--action)]",
                "px-5 py-2 text-sm font-semibold text-[var(--action-contrast)] shadow-[var(--domus-shadow-sm)]",
                "transition hover:bg-[var(--action-strong)] sm:h-10"
              ].join(" ")}
              title="Download this receipt as a PDF."
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Link>
            <PrintButton />
          </div>
        </div>

        <Card data-print-document="receipt">
          <CardHeader>
            <CardTitle>Receipt Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--faint)]">Property</p>
                <p className="font-medium text-[var(--ink)]">{property.name}</p>
                <p className="text-sm text-[var(--muted)]">{formatUnitLabel(unit.unit_number)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--faint)]">Receipt Date</p>
                <p className="font-medium text-[var(--ink)]">{formatDate(new Date())}</p>
                <p className="text-sm text-[var(--muted)]">Receipt #{payment.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--faint)]">Rent Details</p>
                <p className="font-medium text-[var(--ink)]">
                  {charge.category === "late_fee" ? "Late Fee" : "Rent"} • Due {formatDate(charge.due_date)}
                </p>
                <p className="text-sm text-[var(--muted)]">{formatCurrency(charge.amount_cents)}</p>
                {lines.length ? <div className="space-y-1 text-sm text-[var(--muted)]">
                  <p>Rent {formatCurrency(parts.rentCents)}</p>
                  {lines.map((line) => <p key={line.id}>{line.label} {formatCurrency(line.amount_cents)}</p>)}
                </div> : null}
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--faint)]">Payment Details</p>
                <p className="font-medium text-[var(--ink)]">{formatDate(payment.paid_at)}</p>
                <p className="text-sm text-[var(--muted)]">Method: {paymentMethodLabel(payment.method)}</p>
                {payment.reference_note ? (
                  <p className="text-sm text-[var(--muted)]">Reference: {payment.reference_note}</p>
                ) : null}
              </div>
            </div>

            <Alert variant="success" className="rounded-xl p-4">
              <p className="text-sm font-semibold text-[var(--pos)]">Thank you for your payment.</p>
              <p className="mt-1 text-sm text-[var(--pos)]">
                Paid {formatCurrency(payment.amount_cents)} on {formatDate(payment.paid_at)}.
              </p>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
