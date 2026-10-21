import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
import { sendInvoiceEmail, type SendInvoiceEmailParams } from "@/lib/invoice-email";
import { resolveTenantDeliveryPreference } from "@/lib/notification-preferences";

const invoice: SendInvoiceEmailParams = {
  managerName: "Manager", managerEmail: "manager@example.com", ownerName: "Owner",
  ownerEmail: "owner@example.com", amount: "$100", description: "Management fee",
  propertyName: "Oak House", invoiceNumber: "INV-1", date: "October 20, 2026",
  invoiceUrl: "https://domusbase.com/invoice", status: "pending",
  attachmentFileName: "invoice.pdf", attachmentContentBase64: "cGRm"
};

describe("manager invoice delivery switch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "alerts@domusbase.com");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "false");
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("N13 off mode never calls Resend", async () => {
    expect(await sendInvoiceEmail(invoice)).toEqual(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("N13 test mode sends only to an allowlisted primary and drops other CCs", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "manager@example.com");
    expect(await sendInvoiceEmail(invoice)).toEqual(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ to: ["manager@example.com"] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("cc");
  });

  it("N13 never promotes an allowlisted CC when the primary is not allowed", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "owner@example.com");
    expect(await sendInvoiceEmail(invoice)).toEqual(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("N13 on mode keeps the CC and respects the manager's own preference", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    expect(await sendInvoiceEmail(invoice)).toEqual(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).cc).toEqual(["owner@example.com"]);
    fetchMock.mockClear();
    const managerPreference = resolveTenantDeliveryPreference({
      notification_preferences: { manager_invoice: false }
    }, "manager_invoice");
    expect(await sendInvoiceEmail({ ...invoice, deliveryPreference: managerPreference })).toEqual(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
