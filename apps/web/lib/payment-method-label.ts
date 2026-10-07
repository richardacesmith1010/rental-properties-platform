const paymentMethodLabels: Record<string, string> = {
  ach: "Bank transfer",
  card: "Card",
  cash: "Cash",
  check: "Check",
  other: "Other"
};

export function paymentMethodLabel(method: string): string {
  return paymentMethodLabels[method.toLowerCase()] ?? method.charAt(0).toUpperCase() + method.slice(1);
}
