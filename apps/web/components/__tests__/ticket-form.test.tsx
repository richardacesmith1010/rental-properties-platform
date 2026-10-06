import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TicketForm } from "@/components/dashboard/ticket-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/dashboard/maintenance/photo-upload", () => ({ PhotoUpload: () => null }));

const notice = "You can report problems and send messages once your landlord sets up your lease.";

describe("TicketForm tenant", () => {
  it("explains the missing lease and never sends a typed problem", () => {
    const onCreateTicket = vi.fn(async () => ({ success: true as const }));
    render(<TicketForm units={[]} viewerRole="tenant" hasActiveLease={false} onCreateTicket={onCreateTicket} />);
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.getByText("Tell us what's wrong. Your landlord will see it in Domus.")).toBeInTheDocument();
    expect(screen.getByText("Your landlord will see it in Domus.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What's the problem?"), { target: { value: "The sink is leaking." } });
    const send = screen.getByRole("button", { name: "Send to landlord" });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(onCreateTicket).not.toHaveBeenCalled();
  });
});
