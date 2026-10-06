import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OwnerSetupWizard } from "@/components/onboarding/owner-setup-wizard";

const actions = vi.hoisted(() => ({
  llc: vi.fn(), individual: vi.fn(), join: vi.fn(),
  llcResult: { success: true, joinCode: "ABC123", accountId: "internal-id" }
}));
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormState: (action: unknown) => [action === actions.llc
    ? actions.llcResult
    : null, vi.fn()] as const,
  useFormStatus: () => ({ pending: false })
}));

describe("OwnerSetupWizard", () => {
  it("hides the internal account ID and Back after LLC creation", async () => {
    render(<OwnerSetupWizard onSetupIndividual={actions.individual}
      onSetupLlc={actions.llc} onJoinLlc={actions.join} />);
    expect(await screen.findByText("Your LLC is ready")).toBeInTheDocument();
    expect(screen.queryByText(/Account ID/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
});
