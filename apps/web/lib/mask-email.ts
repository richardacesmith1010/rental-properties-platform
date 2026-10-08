export function maskEmail(email: string | null | undefined): string {
  if (typeof email !== "string") return "***";
  const parts = email.toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "***";
  const domainParts = parts[1].split(".");
  if (domainParts.length < 2 || domainParts.some((part) => !part)) return "***";
  const tld = domainParts.at(-1)!;
  if (!/^[a-z0-9-]+$/.test(tld) || !/^[a-z0-9]/.test(parts[0]) || !/^[a-z0-9]/.test(domainParts[0])) {
    return "***";
  }
  return `${parts[0][0]}***@${domainParts[0][0]}***.${tld}`;
}
