import { buildBrandedEmailShell, escapeHtml } from "./shell";

export interface TenantInviteEmailParams {
  tenantName: string;
  ownerName: string;
  propertyName?: string | null;
  propertyAddress: string;
  inviteUrl: string;
  unitLabel?: string | null;
  monthlyRent?: string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
}

interface LLCInviteEmailParams {
  llcName: string;
  inviterName: string;
  acceptUrl: string;
}

export function buildTenantInviteEmail({
  tenantName,
  ownerName,
  propertyName,
  propertyAddress,
  inviteUrl,
  unitLabel,
  monthlyRent,
  leaseStartDate,
  leaseEndDate
}: TenantInviteEmailParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const subject = `${ownerName} invited you to Domus`;
  const unitSummary = unitLabel ? `, ${unitLabel}` : "";
  const locationSummary = propertyName
    ? `${propertyName} (${propertyAddress})`
    : propertyAddress;
  const leaseSummary =
    leaseStartDate && leaseEndDate
      ? `Lease term: ${leaseStartDate} to ${leaseEndDate}.`
      : leaseStartDate
        ? `Lease start: ${leaseStartDate}.`
        : leaseEndDate
          ? `Lease end: ${leaseEndDate}.`
          : null;

  const bodyHtml = [
    `<p style="margin:0;">Hi ${escapeHtml(tenantName)},</p>`,
    `<p style="margin:16px 0 0 0;">${escapeHtml(ownerName)} invited you to Domus ${
      ""
    }to manage your rental at <strong>${escapeHtml(locationSummary)}${unitLabel ? escapeHtml(unitSummary) : ""}</strong>.</p>`,
    monthlyRent
      ? `<p style="margin:16px 0 0 0;">Your monthly rent is <strong>${escapeHtml(monthlyRent)}</strong>.</p>`
      : "",
    leaseSummary
      ? `<p style="margin:16px 0 0 0;">${escapeHtml(leaseSummary)}</p>`
      : "",
    `<p style="margin:16px 0 0 0;">Accept the invite and set your password. Then view your lease, report problems, and pay rent.</p>`
  ]
    .filter(Boolean)
    .join("");

  const html = buildBrandedEmailShell({
    titleHtml: "Welcome to Domus",
    bodyHtml,
    ctaText: "Accept Invitation & Set Up Your Account",
    ctaUrl: inviteUrl,
    preheaderText: `${ownerName} invited you to Domus`,
    footerPreferencesUrl: `${appUrl}/settings`
  });

  const text = [
    `Hi ${tenantName},`,
    "",
    `${ownerName} invited you to Domus ${
      ""
    }to manage your rental at ${locationSummary}${unitSummary}.`,
    monthlyRent ? `Monthly rent: ${monthlyRent}` : null,
    leaseSummary,
    "",
    `Accept invitation: ${inviteUrl}`,
    "",
    "Pay rent, report problems, and view your lease in Domus."
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function buildLLCInviteEmail({
  llcName,
  inviterName,
  acceptUrl
}: LLCInviteEmailParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const subject = `You've been invited to join ${llcName} on Domus`;

  const bodyHtml = [
    `<p style="margin:0;">Hi,</p>`,
    `<p style="margin:16px 0 0 0;">${escapeHtml(inviterName)} has invited you to ${
      ""
    }join <strong>${escapeHtml(llcName)}</strong> on Domus.</p>`,
    `<p style="margin:16px 0 0 0;">Accept the invite to manage LLC properties with others. You can also review shared money records.</p>`,
    `<p style="margin:16px 0 0 0;">This invitation expires in 7 days.</p>`
  ].join("");

  const html = buildBrandedEmailShell({
    titleHtml: escapeHtml(`Join ${llcName} on Domus`),
    bodyHtml,
    ctaText: "Accept Invitation",
    ctaUrl: acceptUrl,
    preheaderText: subject,
    footerPreferencesUrl: `${appUrl}/settings`
  });

  const text = [
    `Hi,`,
    "",
    `${inviterName} has invited you to join ${llcName} on Domus.`,
    "",
    `Accept invitation: ${acceptUrl}`,
    "",
    "This invitation expires in 7 days."
  ].join("\n");

  return { subject, html, text };
}

