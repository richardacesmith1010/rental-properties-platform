import { getStripeSecretKey } from "@/lib/stripe";

interface StripeSetupIntentResponse {
  id: string;
  payment_method: string | null;
  status: string;
}

interface StripePaymentMethodResponse {
  id: string;
  type: string;
  card?: {
    last4: string;
    brand: string;
  };
}

async function stripeAutopayRequest<T>(
  path: string,
  options?: { method?: "GET" | "POST"; body?: URLSearchParams }
): Promise<T> {
  const secretKey = getStripeSecretKey();
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options?.method ?? "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: options?.body?.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Stripe autopay request failed: ${response.status} - ${errorBody}`);
  }

  return (await response.json()) as T;
}

export async function createStripeCustomer(
  email: string,
  name: string
): Promise<{ id: string }> {
  const body = new URLSearchParams();
  body.set("email", email);
  body.set("name", name);

  const customer = await stripeAutopayRequest<{ id: string }>("/customers", {
    method: "POST",
    body
  });

  return { id: customer.id };
}

export async function createSetupCheckoutSession(params: {
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string | null }> {
  const body = new URLSearchParams();
  body.set("mode", "setup");
  body.set("customer", params.customerId);
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("payment_method_types[0]", "card");

  Object.entries(params.metadata).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
  });

  return stripeAutopayRequest<{ id: string; url: string | null }>("/checkout/sessions", {
    method: "POST",
    body
  });
}

export async function retrieveSetupIntent(
  setupIntentId: string
): Promise<{ id: string; payment_method: string; status: string }> {
  const setupIntent = await stripeAutopayRequest<StripeSetupIntentResponse>(
    `/setup_intents/${setupIntentId}`,
    {
      method: "GET"
    }
  );

  if (!setupIntent.payment_method) {
    throw new Error("Stripe setup intent is missing a payment method.");
  }

  return {
    id: setupIntent.id,
    payment_method: setupIntent.payment_method,
    status: setupIntent.status
  };
}

export async function getPaymentMethod(
  paymentMethodId: string
): Promise<{ id: string; type: string; card?: { last4: string; brand: string } }> {
  const paymentMethod = await stripeAutopayRequest<StripePaymentMethodResponse>(
    `/payment_methods/${paymentMethodId}`,
    {
      method: "GET"
    }
  );

  return {
    id: paymentMethod.id,
    type: paymentMethod.type,
    card: paymentMethod.card
  };
}

export async function createOffSessionPaymentIntent(params: {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  metadata: Record<string, string>;
  transferGroup: string;
}): Promise<{ id: string; status: string }> {
  const body = new URLSearchParams();
  body.set("amount", String(params.amountCents));
  body.set("currency", "usd");
  body.set("customer", params.customerId);
  body.set("payment_method", params.paymentMethodId);
  body.set("off_session", "true");
  body.set("confirm", "true");
  body.set("transfer_group", params.transferGroup);

  Object.entries(params.metadata).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
  });

  return stripeAutopayRequest<{ id: string; status: string }>("/payment_intents", {
    method: "POST",
    body
  });
}
