import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIConnectionError, APIConnectionTimeoutError, APIError } from "@anthropic-ai/sdk";

const createMock = vi.hoisted(() => vi.fn());
const alertMock = vi.hoisted(() => vi.fn().mockResolvedValue({ sent: true }));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  return {
    ...actual,
    default: class AnthropicMock {
      messages = { create: createMock };
    }
  };
});
vi.mock("@/lib/platform-alerts", () => ({ sendPlatformAlert: alertMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-a", email: "secret@example.com" } } }) } })
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({
    single: async () => ({ data: { ai_consent_at: "2026-10-16T00:00:00Z" }, error: null })
  }) }) }) })
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUserRole: async () => "owner",
  getUserProfileSummary: async () => ({ nickname: null, fullName: null })
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/dashboard", () => ({ getDashboardData: async () => ({ charges: [] }) }));
vi.mock("@/lib/portfolio", () => ({ getPortfolioData: async () => ({ properties: [], leases: [] }) }));
vi.mock("@/lib/maintenance", () => ({ getAdminMaintenanceTickets: async () => [] }));
vi.mock("@/lib/ai-recent-payments", () => ({ getRecentPaymentsForAi: async () => [] }));

import { POST } from "@/app/api/ai/chat/route";

const question = "Which tenant paid the secret rent?";

function request() {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: question }] })
  });
}

function providerError(status: number, message = "Provider unavailable") {
  return APIError.generate(status, { error: { type: "api_error", message } }, undefined,
    new Headers({ "request-id": "req-test-123" }));
}

describe("Ask Domus provider outage handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    ["credit balance 400", providerError(400, "Your Credit Balance is too low"), "billing"],
    ["payment required 402", providerError(402), "billing"],
    ["unauthorized 401", providerError(401), "auth"],
    ["forbidden 403", providerError(403), "auth"],
    ["rate limit 429", providerError(429), "rate_limit"],
    ["overloaded 529", providerError(529), "overloaded"],
    ["provider 500", providerError(500), "overloaded"],
    ["provider 503", providerError(503), "overloaded"],
    ["connection", new APIConnectionError({}), "connection"],
    ["timeout", new APIConnectionTimeoutError(), "connection"],
    ["invalid request 400", providerError(400, "messages: field required"), null],
    ["plain TypeError", new TypeError("fetch failed"), null]
  ])("classifies %s as %s", async (_case, error, expected) => {
    createMock.mockRejectedValue(error);

    const response = await POST(request());

    expect(response.status).toBe(expected ? 503 : 500);
    if (expected) {
      expect(await response.json()).toEqual({ error: "Ask Domus is resting. Try again later." });
      expect(alertMock).toHaveBeenCalledWith(expect.objectContaining({
        dedupeKey: `ask-domus-provider:${expected}`
      }));
    } else {
      expect(await response.json()).toEqual({ error: "Something went wrong. Try again." });
      expect(alertMock).not.toHaveBeenCalled();
    }
  });

  it("returns a calm 503 and one private billing alert when create rejects", async () => {
    createMock.mockRejectedValue(providerError(400, "Your credit balance is too low"));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Ask Domus is resting. Try again later." });
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: "Ask Domus is unavailable",
      dedupeKey: "ask-domus-provider:billing"
    }));
    const body = alertMock.mock.calls[0][0].body as string;
    expect(body).toMatch(/^billing — status 400, request req-test-123, .* Users see: Ask Domus is resting\.$/);
    expect(body).not.toContain(question);
    expect(body).not.toContain("secret@example.com");
    expect(console.error).toHaveBeenCalledWith("Ask Domus provider unavailable:", "billing", 400, "req-test-123");
  });

  it("ends a failed provider stream with the calm message and one alert", async () => {
    createMock.mockResolvedValue((async function* () {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "First part. " } };
      throw providerError(503);
    })());

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("First part. Ask Domus is resting. Try again later.");
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: "ask-domus-provider:overloaded"
    }));
  });

  it("keeps the generic 500 and sends no alert for a code error", async () => {
    createMock.mockRejectedValue(new TypeError("Code failure"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong. Try again." });
    expect(alertMock).not.toHaveBeenCalled();
  });
});
