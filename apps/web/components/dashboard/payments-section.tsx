import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

interface Payment {
  id: string;
  amountCents: number;
  paidAt: string;
  method: string;
  propertyName: string;
  unitNumber: string;
  chargeDueDate: string | null;
}

interface PaymentsSectionProps {
  payments: Payment[];
}

export function PaymentsSection({ payments }: PaymentsSectionProps) {
  return (
    <Card id="payments">
      <CardHeader>
        <CardTitle>Recent Payments</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments recorded yet"
            description="No payments recorded yet."
          />
        ) : (
          <div>
            {payments.map((payment, i) => (
              <DataRow key={payment.id} last={i === payments.length - 1}>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatCurrency(payment.amountCents)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{formatDateTime(payment.paidAt)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {payment.propertyName} • Unit {payment.unitNumber}
                  </p>
                  {payment.chargeDueDate && (
                    <p className="mt-0.5 text-xs text-zinc-500">Charge due {formatDate(payment.chargeDueDate)}</p>
                  )}
                </div>
                <Badge variant="outline">{payment.method.toUpperCase()}</Badge>
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
