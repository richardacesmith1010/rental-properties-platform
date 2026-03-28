const CARD_FEE_RATE = 0.029;
const CARD_FEE_FIXED_CENTS = 30;

export function calculateCardFee(baseCents: number): {
  baseCents: number;
  feeCents: number;
  totalCents: number;
} {
  const totalCents = Math.ceil(
    (baseCents + CARD_FEE_FIXED_CENTS) / (1 - CARD_FEE_RATE)
  );
  const feeCents = totalCents - baseCents;

  return {
    baseCents,
    feeCents,
    totalCents
  };
}

export function formatCentsAsDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}
