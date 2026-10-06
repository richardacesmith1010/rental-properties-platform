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
        Thanks for signing up for Domus! Use the button to confirm your email and open your account.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you did not sign up, you can ignore this email.
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
        Someone asked to reset your Domus password. Click the button below to choose a new password.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If that was not you, you can ignore this email. Your password will remain unchanged.
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
        You have been invited to join a property on Domus. Use the button to accept your invite and set up your account.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you did not expect this invite, you can ignore it.
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
        If that was not you, you can ignore this email.
      </p>
    `,
    ctaText: "Sign In to Domus",
    ctaUrl: "{{ .ConfirmationURL }}",
    preheaderText: "Your Domus sign-in link is ready."
  });
}
