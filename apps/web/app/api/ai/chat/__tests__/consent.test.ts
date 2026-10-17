import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ consent: false }));
const constructorMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());
const setConsentMock = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    constructor() { constructorMock(); }
    messages = { create: createMock };
  }
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-a", email: "secret@example.com" } } }) } })
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({
    single: async () => ({ data: { ai_consent_at: state.consent ? "2026-10-16T00:00:00Z" : null }, error: null })
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
vi.mock("@/app/actions/ai-consent", () => ({ setAskDomusConsent: setConsentMock }));

import { POST } from "@/app/api/ai/chat/route";

function request() {
  return new Request("http://localhost/api/ai/chat", { method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "Who paid?" }] }) });
}

describe("Ask Domus server consent gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.consent = false;
    process.env.ANTHROPIC_API_KEY = "test-key";
    createMock.mockResolvedValue((async function* () {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } };
    })());
    setConsentMock.mockImplementation(async (enabled: boolean) => {
      state.consent = enabled;
      return { success: true };
    });
  });

  it("returns exact 403 and never constructs Anthropic without consent", async () => {
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Turn on Ask Domus in Settings first." });
    expect(constructorMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("sends a consented question without sending the email as a name", async () => {
    state.consent = true;
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Hello");
    expect(constructorMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].system).not.toContain("secret@example.com");
  });

  it("blocks a new request immediately after revocation resolves", async () => {
    state.consent = true;
    const first = await POST(request());
    await first.text();
    await setConsentMock(false);
    expect(setConsentMock).toHaveBeenCalledWith(false);
    const next = await POST(request());
    expect(next.status).toBe(403);
    expect(await next.json()).toEqual({ error: "Turn on Ask Domus in Settings first." });
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
