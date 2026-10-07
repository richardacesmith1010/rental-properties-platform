const paymentMethodLabels: Record<string, string> = {
  ach: "Bank transfer",
  us_bank_account: "Bank account",
  card: "Card",
  cash: "Cash",
  check: "Check",
  other: "Other"
};

export function paymentMethodLabel(method: string): string {
  return paymentMethodLabels[method.toLowerCase()] ?? method.charAt(0).toUpperCase() + method.slice(1);
}
