export type StripeErrorCategory =
  | "transient"
  | "owner_not_connected"
  | "platform_misconfigured"
  | "unknown";

export interface StripeConnectOnboardingErrorCopy {
  title: string;
  description: string;
}

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
  /platform.*not.*configured/i,
  /platform profile/i,
  /managing losses for connected accounts/i,
  /create live connected accounts/i
];

export const STRIPE_CONNECT_PLATFORM_NOT_READY_COPY: StripeConnectOnboardingErrorCopy = {
  title: "Bank connections aren't available yet",
  description:
    "We're still finishing setup with our payment provider. This usually takes up to one business day. Please check back soon — you'll be able to connect your bank once it's ready."
};

export const STRIPE_CONNECT_GENERIC_COPY: StripeConnectOnboardingErrorCopy = {
  title: "We couldn't start your bank setup",
  description:
    "Something went wrong on our end. Please try again in a little while. If it keeps happening, contact support."
};

export function extractStripeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const jsonStart = message.indexOf("{");

  if (jsonStart === -1) {
    return message;
  }

  try {
    const parsed = JSON.parse(message.slice(jsonStart)) as {
      error?: {
        message?: string;
      };
    };
    const stripeMessage = parsed.error?.message;

    if (typeof stripeMessage === "string" && stripeMessage.length > 0) {
      return stripeMessage;
    }
  } catch {
    // Fall back to the original message when the embedded body is not valid JSON.
  }

  return message;
}

export function categorizeStripeError(error: unknown): StripeErrorCategory {
  const message = extractStripeErrorMessage(error);

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

export function isStripeConnectPlatformNotReadyError(error: unknown): boolean {
  const message = extractStripeErrorMessage(error);

  if (message === STRIPE_CONNECT_PLATFORM_NOT_READY_COPY.description) {
    return true;
  }

  if (PLATFORM_MISCONFIGURED_PATTERNS.some((pattern) => pattern.test(message))) {
    return true;
  }

  return /invalid_request_error/i.test(String(error ?? "")) &&
    /(connect|platform profile|responsibilities)/i.test(message);
}

export function getStripeConnectOnboardingErrorCopy(error: unknown): StripeConnectOnboardingErrorCopy {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message === STRIPE_CONNECT_GENERIC_COPY.description) {
    return STRIPE_CONNECT_GENERIC_COPY;
  }

  if (isStripeConnectPlatformNotReadyError(error)) {
    return STRIPE_CONNECT_PLATFORM_NOT_READY_COPY;
  }

  return STRIPE_CONNECT_GENERIC_COPY;
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
