import { getFeedbackTypeMeta, type FeedbackType } from "@/lib/feedback";
import { escapeHtml } from "./shell";

interface FeedbackEmailParams {
  type: FeedbackType;
  message: string;
  email: string | null;
  userName: string | null;
  userRole: string | null;
  pageUrl: string;
}

export function buildFeedbackEmail({
  type,
  message,
  email,
  userName,
  userRole,
  pageUrl
}: FeedbackEmailParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const typeMeta = getFeedbackTypeMeta(type);
  const subjectLabel =
    type === "bug" ? "Bug report" : type === "feature" ? "Feature request" : "Feedback";
  const submitter = userName ?? email ?? "Anonymous";
  const fromLine = [email, userRole ? `(${userRole})` : null].filter(Boolean).join(" ");
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");
  const subject = `[Domus Feedback] ${subjectLabel} from ${submitter}`;
  const opsUrl = `${appUrl}/ops?section=feedback`;

  const html = `
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#FBFBF9;font-family:Arial,Helvetica,sans-serif;color:#191B1E;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;border-collapse:collapse;">
      <tr>
        <td style="padding:24px;border:1px solid #E6E6E0;border-radius:16px;background:#FFFFFF;">
          <div style="font-size:20px;font-weight:700;color:#191B1E;">${typeMeta.emoji} ${escapeHtml(subjectLabel)}</div>
          <div style="margin-top:16px;font-size:14px;line-height:1.7;color:#3A3F45;">
            <p style="margin:0;"><strong>From:</strong> ${escapeHtml(submitter)}${fromLine ? ` - ${escapeHtml(fromLine)}` : ""}</p>
            <p style="margin:8px 0 0 0;"><strong>Page:</strong> ${escapeHtml(pageUrl)}</p>
            <p style="margin:8px 0 0 0;"><strong>Type:</strong> ${escapeHtml(typeMeta.label)}</p>
          </div>
          <div style="margin-top:20px;padding:16px;border-radius:16px;${
          ""
          }border:1px solid #E6E6E0;background:#F5F5F1;font-size:14px;line-height:1.7;color:#191B1E;">
            ${safeMessage}
          </div>
          <div style="margin-top:24px;">
            <a href="${escapeHtml(opsUrl)}" style="display:inline-block;border-radius:999px;${
            ""
            }background:#1D4ED8;padding:12px 20px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;">
              View all feedback
            </a>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    `${typeMeta.emoji} ${subjectLabel}`,
    `From: ${submitter}${fromLine ? ` - ${fromLine}` : ""}`,
    `Page: ${pageUrl}`,
    `Type: ${typeMeta.label}`,
    "",
    message,
    "",
    `View all feedback: ${opsUrl}`
  ].join("\n");

  return { subject, html, text };
}
