import Link from "next/link";
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
            No charge was applied. You can return and try payment again at any time.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/portal">Return to portal</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
