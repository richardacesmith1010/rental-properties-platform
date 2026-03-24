import { describe, expect, it } from "vitest";
import { buildFeedbackEmail } from "@/lib/email-templates";
import {
  getFeedbackSubmitterLabel,
  getFeedbackTypeMeta,
  submitFeedbackSchema
} from "@/lib/feedback";

describe("feedback helpers", () => {
  it("validates feedback submissions with optional email", () => {
    const parsed = submitFeedbackSchema.safeParse({
      type: "bug",
      message: "The maintenance page crashes after saving a ticket.",
      email: "tenant@example.com",
      pageUrl: "https://domusbase.com/tenant?section=maintenance",
      userAgent: "Mozilla/5.0",
      viewport: "390x844"
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects feedback shorter than 10 characters", () => {
    const parsed = submitFeedbackSchema.safeParse({
      type: "bug",
      message: "Too short",
      pageUrl: "https://domusbase.com/login",
      userAgent: "",
      viewport: ""
    });

    expect(parsed.success).toBe(false);
  });

  it("builds a feedback email with source details and ops link", () => {
    const result = buildFeedbackEmail({
      type: "feature",
      message: "Please add keyboard shortcuts to the reports page.",
      email: "alia@example.com",
      userName: "Alia Sanders",
      userRole: "manager",
      pageUrl: "https://domusbase.com/manager?section=reports"
    });

    expect(result.subject).toContain("[Domus Feedback] Feature request from Alia Sanders");
    expect(result.html).toContain("keyboard shortcuts");
    expect(result.html).toContain("/ops?section=feedback");
    expect(result.text).toContain("alia@example.com");
  });

  it("prefers the submitter name over email when labeling records", () => {
    expect(
      getFeedbackSubmitterLabel({
        submitterName: "Ace Owner",
        email: "owner@example.com"
      })
    ).toBe("Ace Owner");
    expect(getFeedbackTypeMeta("other")).toMatchObject({ label: "Other", emoji: "💬" });
  });
});
