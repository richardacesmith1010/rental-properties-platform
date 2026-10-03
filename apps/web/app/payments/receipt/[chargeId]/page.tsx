import Link from "next/link";
import { Download } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { formatCurrency, formatDate, formatDateTime, formatUnitLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PrintButton } from "./print-button";

interface ReceiptPageProps {
  params: {
    chargeId: string;
  };
}

export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
  const charge = chargeQuery.data;

  if (!charge) {
    notFound();
  }

  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();

  if (!lease || lease.tenant_profile_id !== user.id) {
    notFound();
  }

  const [{ data: payment }, { data: unit }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, paid_at, amount_cents, method, reference_note")
      .eq("rent_charge_id", charge.id)
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("units")
      .select("id, unit_number, property_id")
      .eq("id", lease.unit_id)
      .maybeSingle()
  ]);

  if (!payment || !unit) {
    notFound();
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", unit.property_id)
    .maybeSingle();

  if (!property) {
    notFound();
  }

  return (
    <main className="app-surface min-h-screen px-6 py-8 lg:px-8">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              [data-print-controls="receipt"] {
                display: none !important;
              }
              body, .app-surface {
                background: white !important;
                color: #191B1E !important;
              }
              [data-print-document="receipt"] {
                --surface: #FFFFFF;
                --surface-2: #F5F5F1;
                --ink: #191B1E;
                --ink-2: #3A3F45;
                --muted: #6F757C;
                --line: #E6E6E0;
                --pos: #15803D;
                --pos-bg: #E4F5E9;
                box-shadow: none !important;
              }
            }
          `
        }}
      />
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-start justify-between gap-3" data-print-controls="receipt">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">Domus</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Payment Receipt</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/api/pdf/receipt/${params.chargeId}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-transparent bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white shadow-[var(--domus-shadow-sm)] transition hover:bg-[var(--accent-strong)] sm:h-10"
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
                <p className="text-xs uppercase tracking-wide text-[var(--faint)]">Receipt Timestamp</p>
                <p className="font-medium text-[var(--ink)]">{formatDateTime(new Date())}</p>
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
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--faint)]">Payment Details</p>
                <p className="font-medium text-[var(--ink)]">{formatDateTime(payment.paid_at)}</p>
                <p className="text-sm text-[var(--muted)]">Method: {payment.method.toUpperCase()}</p>
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
