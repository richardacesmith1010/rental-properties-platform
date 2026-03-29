import Link from "next/link";
import Script from "next/script";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

interface SuccessPageProps {
  searchParams: {
    session_id?: string;
    method?: string;
  };
}

function StatusCard({
  icon,
  iconBg,
  title,
  body,
  buttonLabel,
  redirectMessage,
  redirectDelaySeconds = 5,
  buttonVariant = "default",
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body: string;
  buttonLabel?: string;
  redirectMessage?: string;
  redirectDelaySeconds?: number;
  buttonVariant?: "default" | "outline";
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
      <Card className="w-full max-w-lg text-center">
        <CardContent className="pt-8 pb-8">
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${iconBg}`}>
            {icon}
          </div>
          <h1 className="text-lg font-bold text-zinc-900">{title}</h1>
          <p className="mt-2 text-sm text-zinc-500">{body}</p>
          {redirectMessage && (
            <>
              <p id="payment-redirect-countdown" className="mt-4 text-sm text-zinc-500">
                {redirectMessage.replace("{seconds}", String(redirectDelaySeconds))}
              </p>
              <Script id="payment-redirect-script" strategy="afterInteractive">
                {`
                  (function () {
                    var remaining = ${redirectDelaySeconds};
                    var target = document.getElementById("payment-redirect-countdown");
                    function render() {
                      if (target) {
                        target.textContent = ${JSON.stringify(redirectMessage)}.replace("{seconds}", String(remaining));
                      }
                    }
                    render();
                    var interval = window.setInterval(function () {
                      remaining -= 1;
                      if (remaining <= 0) {
                        window.clearInterval(interval);
                        window.location.href = "/";
                        return;
                      }
                      render();
                    }, 1000);
                  })();
                `}
              </Script>
            </>
          )}
          <Button asChild variant={buttonVariant} className="mt-6">
            <Link href="/" title="Return to your dashboard.">
              {buttonLabel ?? "Return to Dashboard"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function PaymentSuccessPage({ searchParams }: SuccessPageProps) {
  await getAuthenticatedUser();
  const sessionId = searchParams.session_id;
  const method = searchParams.method;

  if (!sessionId) {
    return (
      <StatusCard
        icon={<AlertCircle className="h-7 w-7 text-red-500" />}
        iconBg="bg-red-50"
        title="Payment Session Missing"
        body="We could not verify your payment session."
        redirectMessage="Returning to dashboard in {seconds} seconds..."
        buttonVariant="outline"
      />
    );
  }

  if (method === "ach") {
    return (
      <StatusCard
        icon={<Clock className="h-7 w-7 text-amber-500" />}
        iconBg="bg-amber-50"
        title="Payment processing"
        body="Your bank is processing this payment. This usually takes 4-5 business days. We'll update your account when it clears."
        buttonLabel="Back to Dashboard"
      />
    );
  }

  const supabase = createClient();

  // Check if the webhook has already recorded this payment
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();

  if (existingPayment) {
    return (
      <StatusCard
        icon={<CheckCircle2 className="h-7 w-7 text-emerald-500" />}
        iconBg="bg-emerald-50"
        title="Payment Received"
        body="Your payment has been processed and recorded in your rental ledger."
        redirectMessage="Returning to dashboard in {seconds} seconds..."
      />
    );
  }

  // Payment not yet recorded — webhook may still be processing
  return (
    <StatusCard
      icon={<Clock className="h-7 w-7 text-amber-500" />}
      iconBg="bg-amber-50"
      title="Payment Processing"
      body="Your payment is being confirmed. This usually takes a few seconds. Please check your dashboard shortly."
      buttonLabel="Return to Dashboard"
      redirectMessage="Checking payment status. Returning to dashboard in {seconds} seconds..."
      redirectDelaySeconds={8}
    />
  );
}
