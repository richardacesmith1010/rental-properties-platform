export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  payment_status: string;
  amount_total: number | null;
  payment_intent: string | null;
  setup_intent?: string | null;
  metadata?: Record<string, string>;
}

export interface StripePaymentIntent {
  id: string;
  status: string;
  amount_received?: number | null;
  amount?: number | null;
  transfer_group?: string | null;
  metadata?: Record<string, string>;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export type StripeAccountHealthStatus = "active" | "restricted" | "missing";

export type StripeAccountHealth = {
  status: StripeAccountHealthStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  disabledReason: string | null;
};

/**
 * Verify a Stripe webhook signature using HMAC-SHA256.
 * Returns the parsed event on success, throws on invalid signature.
 */
export async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string
): Promise<StripeWebhookEvent> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable.");
  }

  const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts["t"];
  const signature = parts["v1"];

  if (!timestamp || !signature) {
    throw new Error("Invalid Stripe signature header format.");
  }

  // Verify timestamp is within 5 minutes
  const timestampSeconds = parseInt(timestamp, 10);
  const currentSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(currentSeconds - timestampSeconds) > 300) {
    throw new Error("Stripe webhook timestamp is too old.");
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expectedSignature !== signature) {
    throw new Error("Stripe webhook signature verification failed.");
  }

  return JSON.parse(payload) as StripeWebhookEvent;
}

export function getStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
  }
  return secretKey;
}

export async function createStripeCheckoutSession(params: {
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  transferGroup?: string;
  paymentMethodTypes?: string[];
  applicationFeeAmountCents?: number;
  transferDataDestination?: string;
}) {
  if (
    typeof params.applicationFeeAmountCents === "number" &&
    !params.transferDataDestination
  ) {
    throw new Error("applicationFeeAmountCents requires transferDataDestination (destination charges)");
  }

  const secretKey = getStripeSecretKey();

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", String(params.amountCents));
  body.set("line_items[0][price_data][product_data][name]", "Rent Payment");

  Object.entries(params.metadata).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
  });
  if (params.paymentMethodTypes?.length) {
    params.paymentMethodTypes.forEach((type, idx) => {
      body.set(`payment_method_types[${idx}]`, type);
    });
  }
  if (params.transferDataDestination) {
    body.set("payment_intent_data[transfer_data][destination]", params.transferDataDestination);
  }
  if (typeof params.applicationFeeAmountCents === "number") {
    body.set("payment_intent_data[application_fee_amount]", String(params.applicationFeeAmountCents));
  }
  if (!params.transferDataDestination && params.transferGroup) {
    body.set("payment_intent_data[transfer_group]", params.transferGroup);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Stripe create session failed: ${response.status}`);
  }

  const session = (await response.json()) as StripeCheckoutSession;
  return session;
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  const secretKey = getStripeSecretKey();

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Stripe retrieve session failed: ${response.status}`);
  }

  const session = (await response.json()) as StripeCheckoutSession;
  return session;
}

export async function createStripeTransfer(params: {
  amountCents: number;
  destination: string;
  transferGroup?: string;
  description?: string;
  idempotencyKey?: string;
}): Promise<{ id: string; amount: number }> {
  const secretKey = getStripeSecretKey();
  const body = new URLSearchParams();
  body.set("amount", String(params.amountCents));
  body.set("currency", "usd");
  body.set("destination", params.destination);
  if (params.transferGroup) {
    body.set("transfer_group", params.transferGroup);
  }
  if (params.description) {
    body.set("description", params.description);
  }

  const response = await fetch("https://api.stripe.com/v1/transfers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {})
    },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Stripe create transfer failed: ${response.status} - ${errorBody}`);
  }

  return (await response.json()) as { id: string; amount: number };
}

export async function createStripeTransferReversal(params: {
  transferId: string;
  amountCents?: number;
  description?: string;
  idempotencyKey?: string;
}): Promise<{ id: string }> {
  const secretKey = getStripeSecretKey();
  const body = new URLSearchParams();
  if (typeof params.amountCents === "number") {
    body.set("amount", String(params.amountCents));
  }
  if (params.description) {
    body.set("description", params.description);
  }

  const response = await fetch(
    `https://api.stripe.com/v1/transfers/${encodeURIComponent(params.transferId)}/reversals`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {})
      },
      body: body.toString(),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe transfer reversal failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { id: string };
  return { id: json.id };
}

export async function getStripeAccountHealth(accountId: string): Promise<StripeAccountHealth> {
  const secretKey = getStripeSecretKey();
  const response = await fetch(
    `https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      cache: "no-store"
    }
  );

  if (response.status === 404) {
    return {
      status: "missing",
      chargesEnabled: false,
      payoutsEnabled: false,
      disabledReason: "account_not_found"
    };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe account retrieve failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as {
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    requirements?: { disabled_reason?: string | null };
  };

  const chargesEnabled = Boolean(json.charges_enabled);
  const payoutsEnabled = Boolean(json.payouts_enabled);
  const disabledReason = json.requirements?.disabled_reason ?? null;
  const isHealthy = chargesEnabled && payoutsEnabled && !disabledReason;

  return {
    status: isHealthy ? "active" : "restricted",
    chargesEnabled,
    payoutsEnabled,
    disabledReason
  };
}
