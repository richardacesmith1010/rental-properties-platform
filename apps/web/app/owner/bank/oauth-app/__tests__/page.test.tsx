import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn(async () => ({})) }));
import { requireRole } from "@/lib/auth";
import Page from "../page";

it("229 §8.5 owner-authenticated fallback renders exact heading and bank link", async () => {
  render(await Page());
  expect(requireRole).toHaveBeenCalledWith(["owner"]);
  expect(screen.getByRole("heading", { name: "Open the Domus app to finish." })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to your banks" })).toHaveAttribute("href", "/owner/bank");
});
it("229 §8.5 rejects a user who fails owner auth before rendering", async () => {
  vi.mocked(requireRole).mockRejectedValueOnce(new Error("auth redirect"));
  await expect(Page()).rejects.toThrow("auth redirect");
});
