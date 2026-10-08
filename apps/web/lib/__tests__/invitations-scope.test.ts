import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/property-access", () => ({ getAdministeredPropertyIdsForAccount: vi.fn() }));
vi.mock("@/lib/ownership", () => ({ canUserAdministerOwnershipAccount: vi.fn() }));
import { getOwnerInvitations } from "@/lib/invitations";

it("scopes panel data to invites created by the viewer", async () => {
  const order = vi.fn().mockResolvedValue({ data: [], error: null });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  mocks.client.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });
  expect(await getOwnerInvitations("viewer-id")).toEqual([]);
  expect(eq).toHaveBeenCalledWith("invited_by", "viewer-id");
});
