import { describe, expect, it } from "vitest";
import { addTicketCommentSchema } from "../validations";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("addTicketCommentSchema", () => {
  it("accepts a valid resident comment", () => {
    const result = addTicketCommentSchema.safeParse({
      ticketId: validUuid,
      body: "The leak stopped, but the wall is still damp."
    });

    expect(result.success).toBe(true);
  });

  it("accepts an internal note flag for property staff", () => {
    const result = addTicketCommentSchema.safeParse({
      ticketId: validUuid,
      body: "Vendor scheduled for tomorrow morning.",
      isInternal: "true"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isInternal).toBe("true");
    }
  });

  it("defaults the internal note flag to false", () => {
    const result = addTicketCommentSchema.safeParse({
      ticketId: validUuid,
      body: "Please let me know when someone is coming by."
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isInternal).toBe("false");
    }
  });

  it("rejects invalid ticket ids", () => {
    const result = addTicketCommentSchema.safeParse({
      ticketId: "not-a-uuid",
      body: "Broken garbage disposal."
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty comments", () => {
    const result = addTicketCommentSchema.safeParse({
      ticketId: validUuid,
      body: ""
    });

    expect(result.success).toBe(false);
  });

  it("rejects comments longer than 2000 characters", () => {
    const result = addTicketCommentSchema.safeParse({
      ticketId: validUuid,
      body: "x".repeat(2001)
    });

    expect(result.success).toBe(false);
  });
});
