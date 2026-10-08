import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), active: vi.fn(), admin: vi.fn(), revalidate: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/client-accounts", () => ({ isActiveClientManager: mocks.active }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { addClientHome, createClientAccount } from "@/app/actions/client-accounts";

const accountId = "11111111-1111-4111-8111-111111111111";
function clientForm() {
  const form = new FormData();
  form.set("accountType", "llc");
  form.set("clientName", "Client One");
  return form;
}
function homeForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ accountId, name: "Home", addressLine1: "1 Main St",
    city: "Denver", state: "CO", postalCode: "80202", propertyType: "townhouse" })) {
    form.set(key, value);
  }
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "manager-A" } });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.active.mockResolvedValue(true);
  mocks.admin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: accountId, error: null }) });
});

describe("client account actions", () => {
  it("creates the client for the authenticated manager", async () => {
    expect(await createClientAccount(null, clientForm())).toMatchObject({ success: true, message: "Client added." });
    expect(mocks.admin().rpc).toHaveBeenCalledWith("create_client_account", expect.objectContaining({ p_manager: "manager-A" }));
  });

  it("refuses another manager before the home RPC", async () => {
    mocks.active.mockResolvedValue(false);
    expect(await addClientHome(null, homeForm())).toEqual({
      success: false, error: "You can't add homes for this client."
    });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("refuses an inactive link but accepts another active client", async () => {
    mocks.active.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await addClientHome(null, homeForm()))?.success).toBe(false);
    expect(await addClientHome(null, homeForm())).toMatchObject({ success: true, message: "Home added." });
    expect(mocks.admin().rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["22023", "42501", "XX000"])("maps home RPC code %s", async (code) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
    mocks.admin.mockReturnValue({ rpc });
    const result = await addClientHome(null, homeForm());
    expect(result).toEqual({ success: false, error: code === "22023"
      ? "Please check the details and try again." : code === "42501"
        ? "You can't add homes for this client." : "Could not add the home. Please try again." });
  });

  it.each(["22023", "42501", "XX000"])("maps client RPC code %s", async (code) => {
    mocks.admin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code } }) });
    expect(await createClientAccount(null, clientForm())).toEqual({ success: false,
      error: code === "22023" ? "Please check the details and try again."
        : "Could not add the client. Please try again." });
  });
});
