import { describe, expect, it } from "vitest";
import {
  buildOwnerMessageEmail,
  buildPropertyMessageEmail
} from "@/lib/email-templates";

describe("message email templates", () => {
  it("includes the message content and CTA in the owner message email", () => {
    const result = buildOwnerMessageEmail({
      tenantName: "Taylor Tenant",
      ownerName: "Ace Owner",
      propertyName: "Atlas House",
      messageContent: "Rent is due tomorrow.",
      dashboardUrl: "https://domusbase.com/tenant?section=notifications"
    });

    expect(result.subject).toBe("Message from Ace Owner about Atlas House");
    expect(result.html).toContain("Rent is due tomorrow.");
    expect(result.html).toContain("View in Domus");
    expect(result.html).toContain("https://domusbase.com/tenant?section=notifications");
    expect(result.html).toContain("background-color:#FBFBF9");
    expect(result.html).toContain('bgcolor="#1D4ED8"');
    expect(result.html).not.toContain("mascot");
  });

  it("builds a generic property message email for owner inbox replies", () => {
    const result = buildPropertyMessageEmail({
      recipientName: "Ace Owner",
      senderName: "Taylor Tenant",
      propertyName: "Atlas House",
      messageContent: "I dropped off a check today.",
      dashboardUrl: "https://domusbase.com/owner?section=inbox"
    });

    expect(result.subject).toBe("Message from Taylor Tenant about Atlas House");
    expect(result.text).toContain("I dropped off a check today.");
    expect(result.text).toContain("https://domusbase.com/owner?section=inbox");
  });
});
