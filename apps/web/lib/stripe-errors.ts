export type StripeErrorCategory =
  | "transient"
  | "owner_not_connected"
  | "platform_misconfigured"
  | "unknown";

const TRANSIENT_PATTERNS = [
  /fetch failed/i,
  /network/i,
  /timeout/i,
  /timed out/i,
  /econnreset/i,
  /socket/i,
  /Stripe .* failed: 5\d\d/i
];

const OWNER_NOT_CONNECTED_PATTERNS = [
  /No such destination/i,
  /resource_missing.*destination/i,
  /destination.*does not exist/i,
  /account_invalid/i
];

const PLATFORM_MISCONFIGURED_PATTERNS = [
  /signed up for Connect/i,
  /Connect.*not.*enabled/i,
  /platform.*not.*configured/i
];

export function categorizeStripeError(error: unknown): StripeErrorCategory {
  const message = error instanceof Error ? error.message : String(error);

  if (PLATFORM_MISCONFIGURED_PATTERNS.some((pattern) => pattern.test(message))) {
    return "platform_misconfigured";
  }

  if (OWNER_NOT_CONNECTED_PATTERNS.some((pattern) => pattern.test(message))) {
    return "owner_not_connected";
  }

  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(message))) {
    return "transient";
  }

  return "unknown";
}

export function userMessageForCategory(category: StripeErrorCategory): string {
  switch (category) {
    case "transient":
      return "Our payment processor is having trouble right now. Please try again in a few minutes.";
    case "owner_not_connected":
      return "We can't connect to your owner's bank right now. We've notified them. Please try again in a few hours, or message your property manager.";
    case "platform_misconfigured":
      return "Online payments are being set up. We've been notified and are fixing it. Please try again later.";
    case "unknown":
      return "Something went wrong with your payment. Please try again, or message your property manager.";
  }
}
