import { NextResponse, type NextRequest } from "next/server";
import {
  buildConfirmationEmailTemplate,
  buildRecoveryEmailTemplate,
  buildInviteEmailTemplate,
  buildMagicLinkEmailTemplate
} from "@/lib/auth-email-templates";
import { buildNotificationEmail } from "@/lib/email-templates";

const TEMPLATES: Record<string, () => string> = {
  confirmation: buildConfirmationEmailTemplate,
  recovery: buildRecoveryEmailTemplate,
  invite: buildInviteEmailTemplate,
  magic_link: buildMagicLinkEmailTemplate,
  notification: () =>
    buildNotificationEmail({
      title: "Rent Payment Received",
      body: "Your tenant Jane Smith paid $1,200.00 for Unit 4B.\n\nThe payment has been recorded and a receipt is available in the dashboard.",
      ctaText: "View Dashboard",
      ctaUrl: "https://domusbase.com/owner",
      preheaderText: "Rent payment received for Unit 4B."
    })
};

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 404 });
  }

  const template = request.nextUrl.searchParams.get("template");

  if (!template || !TEMPLATES[template]) {
    const available = Object.keys(TEMPLATES);

    return NextResponse.json(
      {
        error: "Specify a template query parameter.",
        available,
        example: "/api/email-preview?template=confirmation"
      },
      { status: 400 }
    );
  }

  const html = TEMPLATES[template]();

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
