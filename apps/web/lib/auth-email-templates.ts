import { buildBrandedEmailShell } from "@/lib/email-templates";

/**
 * Supabase Auth email templates.
 *
 * These return raw HTML strings containing Go template variables
 * (e.g. {{ .ConfirmationURL }}) that Supabase replaces at send time.
 *
 * Claude pastes these into the Supabase dashboard under
 * Authentication → Email Templates.
 */

function buildAuthEmailShell(params: {
  title: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  preheaderText: string;
}): string {
  return buildBrandedEmailShell({
    titleHtml: params.title,
    bodyHtml: params.bodyHtml,
    ctaText: params.ctaText,
    ctaUrl: params.ctaUrl,
    preheaderText: params.preheaderText,
    footerPreferencesUrl: "{{ .SiteURL }}/settings",
  });
}

export function buildConfirmationEmailTemplate(): string {
  return buildAuthEmailShell({
    title: "Confirm Your Email",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">
        Thanks for signing up for Domus! Click the button below to confirm your email address and activate your account.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you didn&apos;t create a Domus account, you can safely ignore this email.
      </p>
    `,
    ctaText: "Confirm Email",
    ctaUrl: "{{ .ConfirmationURL }}",
    preheaderText: "Confirm your email to get started with Domus."
  });
}

export function buildRecoveryEmailTemplate(): string {
  return buildAuthEmailShell({
    title: "Reset Your Password",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">
        We received a request to reset the password for your Domus account. Click the button below to choose a new password.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you didn&apos;t request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    `,
    ctaText: "Reset Password",
    ctaUrl: "{{ .ConfirmationURL }}",
    preheaderText: "Reset your Domus account password."
  });
}

export function buildInviteEmailTemplate(): string {
  return buildAuthEmailShell({
    title: "You're Invited to Domus",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">
        You&apos;ve been invited to join a property on Domus - the platform that makes managing rentals simple. Click the button below to accept your invitation and set up your account.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you weren&apos;t expecting this invitation, you can safely ignore this email.
      </p>
    `,
    ctaText: "Accept Invitation",
    ctaUrl: "{{ .ConfirmationURL }}",
    preheaderText: "You've been invited to join a property on Domus."
  });
}

export function buildMagicLinkEmailTemplate(): string {
  return buildAuthEmailShell({
    title: "Your Sign-In Link",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">
        Click the button below to sign in to your Domus account. This link expires in 24 hours.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you didn&apos;t request this link, you can safely ignore this email.
      </p>
    `,
    ctaText: "Sign In to Domus",
    ctaUrl: "{{ .ConfirmationURL }}",
    preheaderText: "Your Domus sign-in link is ready."
  });
}
