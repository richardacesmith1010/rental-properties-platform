import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useParams: () => ({ inviteId: "secret-id" }) }));
vi.mock("@/app/actions/join-invite", () => ({ resendFromJoinLink: vi.fn() }));
import { JoinInviteForm } from "../join-invite-form";

it("does not render the invite ID in the form body", () => {
  const { container } = render(<JoinInviteForm />);
  expect(screen.getByRole("button", { name: "Email me a new link" })).toBeInTheDocument();
  expect(container.innerHTML).not.toContain("secret-id");
  expect(container.querySelector("input")).toBeNull();
});
