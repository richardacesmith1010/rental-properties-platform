import { describe, expect, it, vi } from "vitest";

const requireRole = vi.hoisted(() => vi.fn());
const getClientDetail = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("not found"); }));
vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("@/lib/client-overview", () => ({ getClientDetail }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/app/actions/client-accounts", () => ({ createClientAccount: vi.fn() }));
vi.mock("@/app/actions/unified-setup", () => ({ createPropertyWithSetup: vi.fn() }));
vi.mock("@/components/dashboard/clients/client-detail", () => ({ ClientDetail: () => null }));
import ClientPage from "../[accountId]/page";

describe("manager client page", () => {
  it("returns not found for an inaccessible client", async () => {
    requireRole.mockResolvedValue({ user: { id: "manager-1" } });
    getClientDetail.mockResolvedValue(null);
    await expect(ClientPage({ params: Promise.resolve({ accountId: "foreign" }) })).rejects.toThrow("not found");
    expect(requireRole).toHaveBeenCalledWith(["manager"]);
    expect(getClientDetail).toHaveBeenCalledWith("manager-1", "foreign");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
