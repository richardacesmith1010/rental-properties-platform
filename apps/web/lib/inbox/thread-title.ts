export const TENANT_CONVERSATION_SUBJECT = "Messages with your landlord";

export function threadDisplayTitle(subject: string, viewerRole: "owner" | "manager" | "tenant"): string {
  if (subject === TENANT_CONVERSATION_SUBJECT && viewerRole !== "tenant") return "Messages with your tenant";
  const prefix = "Manual payment review - ";
  if (subject.startsWith(prefix)) {
    return `${viewerRole === "tenant" ? "Rent you said is paid" : "Tenant says rent is paid"} - ${subject.slice(prefix.length)}`;
  }
  return subject;
}
