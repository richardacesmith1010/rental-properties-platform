export function shouldThrottleDocumentPacketSend(
  sentAt: string | null,
  now = Date.now(),
  cooldownMs = 60_000
): boolean {
  if (!sentAt) {
    return false;
  }

  const sentAtMs = Date.parse(sentAt);
  if (Number.isNaN(sentAtMs)) {
    return false;
  }

  return now - sentAtMs < cooldownMs;
}

export function getVendorAssignmentPlan(
  previousVendorId: string | null,
  nextVendorId: string
): { shouldInsert: boolean; status: "assigned" | "reassigned" } {
  if (previousVendorId === nextVendorId) {
    return { shouldInsert: false, status: "assigned" };
  }

  if (!previousVendorId) {
    return { shouldInsert: true, status: "assigned" };
  }

  return { shouldInsert: true, status: "reassigned" };
}

export function shouldRecordSuccessfulDelivery(
  existingRows: Array<{ channel: "in_app" | "email"; status: "pending" | "sent" | "failed" }>,
  channel: "in_app" | "email"
): boolean {
  return !existingRows.some(
    (row) => row.channel === channel && row.status === "sent"
  );
}
