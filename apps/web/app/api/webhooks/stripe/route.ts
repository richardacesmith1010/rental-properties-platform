import { NextRequest, NextResponse } from "next/server";
import {
  type StripeCheckoutSession,
  type StripePaymentIntent,
  verifyWebhookSignature
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleAccountUpdated,
  handleAsyncPaymentFailed,
  handleAsyncPaymentSucceeded,
  handleCheckoutSessionCompleted,
  handlePaymentIntentPaymentFailed,
  handlePaymentIntentSucceeded
} from "@/lib/stripe-webhook-handlers";

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event;
  try {
    event = await verifyWebhookSignature(payload, signatureHeader);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case "account.updated":
      return handleAccountUpdated(supabase, event.data.object as { id?: string | null; charges_enabled?: boolean; payouts_enabled?: boolean });
    case "payment_intent.succeeded":
      return handlePaymentIntentSucceeded(
        supabase,
        event.data.object as unknown as StripePaymentIntent
      );
    case "payment_intent.payment_failed":
      return handlePaymentIntentPaymentFailed(
        supabase,
        event.data.object as unknown as StripePaymentIntent
      );
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(
        supabase,
        event.data.object as unknown as StripeCheckoutSession
      );
    case "checkout.session.async_payment_succeeded":
      return handleAsyncPaymentSucceeded(
        supabase,
        event.data.object as unknown as StripeCheckoutSession
      );
    case "checkout.session.async_payment_failed":
      return handleAsyncPaymentFailed(
        supabase,
        event.data.object as unknown as StripeCheckoutSession
      );
    default:
      return NextResponse.json({ received: true });
  }
}
