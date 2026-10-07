export interface EmailTemplateParams {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  preheaderText?: string;
}

interface BrandedEmailShellParams {
  titleHtml: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  preheaderText?: string;
  footerPreferencesUrl?: string;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildBrandedEmailShell({
  titleHtml,
  bodyHtml,
  ctaText,
  ctaUrl,
  preheaderText,
  footerPreferencesUrl,
}: BrandedEmailShellParams) {
  const safeCtaText = escapeHtml(ctaText);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const safePreferencesUrl = footerPreferencesUrl ? escapeHtml(footerPreferencesUrl) : null;
  const safePreheaderText = preheaderText ? escapeHtml(preheaderText) : null;

  // Hex values mirror docs/design-system.md v2 light tokens.
  return `
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background-color:#FBFBF9;font-family:Arial,Helvetica,sans-serif;color:#191B1E;">
    ${safePreheaderText ? `
    <span style="display:none;font-size:1px;color:#FBFBF9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${safePreheaderText}
    </span>` : ""}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="padding:20px 24px;background-color:#FFFFFF;${
              ""
              }border:1px solid #E6E6E0;border-bottom:none;border-radius:16px 16px 0 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="font-size:20px;font-weight:700;line-height:1.2;color:#191B1E;">Domus</div>
                      <div style="margin-top:4px;font-size:12px;line-height:1.4;color:#6F757C;">
                        Manage your rentals
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 24px;background-color:#FFFFFF;border-left:1px solid #E6E6E0;border-right:1px solid #E6E6E0;">
                <div style="font-size:24px;font-weight:700;line-height:1.3;color:#191B1E;">${titleHtml}</div>
                <div style="margin-top:14px;font-size:15px;line-height:1.7;color:#3A3F45;">
                  ${bodyHtml}
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;border-collapse:collapse;">
                  <tr>
                    <td align="center" bgcolor="#1D4ED8" style="border-radius:999px;">
                      <a
                        href="${safeCtaUrl}"
                        style="display:inline-block;padding:12px 22px;${
                        ""
                        }font-size:14px;font-weight:700;line-height:1;text-decoration:none;color:#FFFFFF;"
                      >
                        ${safeCtaText}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;background-color:#FFFFFF;border:1px solid #E6E6E0;border-top:none;border-radius:0 0 16px 16px;">
                <div style="font-size:12px;line-height:1.6;color:#6F757C;">
                  Domus. Manage your rentals.<br />
                  Manage rent, repairs, files, and messages in one place.
                </div>
                ${safePreferencesUrl ? `
                <div style="margin-top:8px;font-size:12px;line-height:1.6;color:#6F757C;">
                  <a href="${safePreferencesUrl}" style="color:#1D4ED8;text-decoration:underline;">
                    Manage notification preferences
                  </a>
                </div>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

export function buildNotificationEmail({
  title,
  body,
  ctaText = "Open Domus",
  ctaUrl = "https://domusbase.com",
  preheaderText,
}: EmailTemplateParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replaceAll("\n", "<br />");

  return buildBrandedEmailShell({
    titleHtml: safeTitle,
    bodyHtml: safeBody,
    ctaText,
    ctaUrl,
    preheaderText,
    footerPreferencesUrl: `${appUrl}/settings`,
  });
}

