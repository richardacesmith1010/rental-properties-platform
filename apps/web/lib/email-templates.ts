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

  return `
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background-color:#f5f3ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    ${safePreheaderText ? `
    <span style="display:none;font-size:1px;color:#f5f3ff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${safePreheaderText}
    </span>` : ""}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%);border-radius:20px 20px 0 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img
                        src="https://domusbase.com/images/dom-the-key.png"
                        alt="Domus mascot"
                        width="36"
                        height="54"
                        style="display:block;border:0;outline:none;text-decoration:none;"
                      />
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;">
                      <div style="font-size:20px;font-weight:700;line-height:1.2;color:#ffffff;">Domus</div>
                      <div style="margin-top:4px;font-size:12px;line-height:1.4;color:rgba(255,255,255,0.78);">
                        Rental Property Management
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 24px;background-color:#ffffff;border-left:1px solid #ddd6fe;border-right:1px solid #ddd6fe;">
                <div style="font-size:24px;font-weight:700;line-height:1.3;color:#111827;">${titleHtml}</div>
                <div style="margin-top:14px;font-size:15px;line-height:1.7;color:#475569;">
                  ${bodyHtml}
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;border-collapse:collapse;">
                  <tr>
                    <td align="center" bgcolor="#10B981" style="border-radius:999px;">
                      <a
                        href="${safeCtaUrl}"
                        style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff;"
                      >
                        ${safeCtaText}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;background-color:#f8fafc;border:1px solid #ddd6fe;border-top:none;border-radius:0 0 20px 20px;">
                <div style="font-size:12px;line-height:1.6;color:#64748b;">
                  Domus - Rental Property Management<br />
                  Manage rent, maintenance, documents, and notifications in one place.
                </div>
                ${safePreferencesUrl ? `
                <div style="margin-top:8px;font-size:12px;line-height:1.6;color:#64748b;">
                  <a href="${safePreferencesUrl}" style="color:#7C3AED;text-decoration:underline;">
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
