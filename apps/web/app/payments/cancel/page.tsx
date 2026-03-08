import Link from "next/link";
import Script from "next/script";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function PaymentCancelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
      <Card className="w-full max-w-lg text-center">
        <CardContent className="pt-8 pb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <XCircle className="h-7 w-7 text-amber-500" />
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Payment Not Completed</h1>
          <p className="mt-2 text-sm text-zinc-500">
            No charge was applied. Return to your dashboard whenever you are ready to try again.
          </p>
          <p id="payment-cancel-redirect" className="mt-4 text-sm text-zinc-500">
            Returning to dashboard in 5 seconds...
          </p>
          <Script id="payment-cancel-redirect-script" strategy="afterInteractive">
            {`
              (function () {
                var remaining = 5;
                var target = document.getElementById("payment-cancel-redirect");
                function render() {
                  if (target) {
                    target.textContent = "Returning to dashboard in " + remaining + " seconds...";
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
          <Button asChild variant="outline" className="mt-6">
            <Link href="/" title="Return to your dashboard.">Return to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
