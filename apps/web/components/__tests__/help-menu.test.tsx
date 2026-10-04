import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiAssistant } from "@/components/dashboard/ai-assistant";
import { HelpMenu } from "@/components/help-menu";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } })
    }
  })
}));

describe("HelpMenu", () => {
  it("only shows feedback when the assistant is unavailable", async () => {
    const user = userEvent.setup();
    render(<HelpMenu onSubmitFeedback={async () => ({ success: true })} />);

    await user.click(screen.getByRole("button", { name: "Help" }));

    expect(screen.queryByRole("menuitem", { name: "Ask Domus" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Send feedback" })).toBeInTheDocument();
  });

  it("uses one keyboard-reachable trigger and opens both existing help targets", async () => {
    const user = userEvent.setup();
    render(
      <>
        <HelpMenu onSubmitFeedback={async () => ({ success: true })} />
        <AiAssistant accountId="account-1" />
      </>
    );

    expect(screen.getAllByRole("button", { name: "Help" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Ask Domus" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Help" }));
    await user.tab();
    expect(screen.getByRole("menuitem", { name: "Ask Domus" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Help" })).toHaveFocus();
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Ask Domus" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Help" }));
    await user.click(screen.getByRole("menuitem", { name: "Ask Domus" }));
    expect(screen.getByRole("dialog", { name: "Ask Domus" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Help" }));
    await user.click(screen.getByRole("menuitem", { name: "Send feedback" }));
    expect(screen.getByRole("heading", { name: "Send Feedback" })).toBeInTheDocument();
  });
});
