import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAiContextSummary, buildAiSystemPrompt } from "@/lib/ai-assistant";

const getUserMock = vi.hoisted(() => vi.fn());
const getCurrentUserRoleMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock
    }
  })
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUserRole: getCurrentUserRoleMock,
  getUserProfileSummary: vi.fn()
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock
}));

vi.mock("@/lib/dashboard", () => ({
  getDashboardData: vi.fn()
}));

vi.mock("@/lib/portfolio", () => ({
  getPortfolioData: vi.fn()
}));

vi.mock("@/lib/maintenance", () => ({
  getAdminMaintenanceTickets: vi.fn()
}));

import { POST } from "@/app/api/ai/chat/route";

describe("Ask Domus API route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 19 });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 when the user is not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Who is late?" }]
        })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  it("returns 403 for tenant users", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "tenant@example.com" } } });
    getCurrentUserRoleMock.mockResolvedValue("tenant");

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "What do I owe?" }]
        })
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  it("returns 400 when no messages are provided", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    getCurrentUserRoleMock.mockResolvedValue("owner");

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: []
        })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Please send a message." });
  });

  it("returns 429 when the user hits the hourly limit", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    getCurrentUserRoleMock.mockResolvedValue("owner");
    checkRateLimitMock.mockReturnValue({ allowed: false, remaining: 0 });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Who hasn't paid?" }]
        })
      })
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "You've sent a lot of messages. Try again in an hour."
    });
  });

  it("returns a friendly message when ANTHROPIC_API_KEY is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "owner@example.com" } } });
    getCurrentUserRoleMock.mockResolvedValue("owner");
    delete process.env.ANTHROPIC_API_KEY;

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Who hasn't paid this month?" }]
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("The AI assistant isn't set up yet.");
  });

  it("builds a system prompt with property and tenant context", () => {
    const referenceDate = new Date("2026-03-27T12:00:00.000Z");
    const summary = buildAiContextSummary(
      {
        properties: [
          { name: "Oak Street House", unitCount: 3, occupiedCount: 2 }
        ],
        activeLeases: [
          {
            tenantName: "Sarah T.",
            rentCents: 150000,
            propertyName: "Oak Street House",
            endDate: "2026-08-31"
          }
        ],
        outstandingCharges: [
          {
            tenantName: "James R.",
            amountCents: 120000,
            dueDate: "2026-03-15",
            status: "late"
          }
        ],
        openTickets: [
          {
            title: "Leaky faucet",
            status: "in progress",
            propertyName: "Oak Street House"
          }
        ],
        recentPayments: [
          {
            tenantName: "Maria L.",
            amountCents: 210000,
            paidAt: "2026-03-01"
          }
        ]
      },
      referenceDate
    );
    const prompt = buildAiSystemPrompt({
      ownerFirstName: "Alex",
      contextSummary: summary,
      today: referenceDate
    });

    expect(prompt).toContain("Alex");
    expect(prompt).toContain("March 27, 2026");
    expect(prompt).toContain("Oak Street House");
    expect(prompt).toContain("Sarah T.");
    expect(prompt).toContain("James R.");
  });
});
