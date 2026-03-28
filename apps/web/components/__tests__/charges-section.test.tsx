import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargesSection } from "@/components/dashboard/charges-section";
import { calculateCardFee, formatCentsAsDollars } from "@/lib/payment-fees";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false })
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams()
}));

describe("ChargesSection", () => {
  const charges = [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      leaseId: "550e8400-e29b-41d4-a716-446655440001",
      propertyId: "550e8400-e29b-41d4-a716-446655440002",
      tenantProfileId: "550e8400-e29b-41d4-a716-446655440003",
      dueDate: "2026-03-01",
      amountCents: 165000,
      status: "pending" as const,
      propertyName: "Atlas House",
      propertyLabel: "Atlas House • Unit 1A",
      unitNumber: "1A",
      tenantName: "Maya Bell",
      category: "rent" as const,
      reminderSentAt: "2026-03-15T12:00:00.000Z"
    }
  ];
  const paidCharge = {
    ...charges[0],
    id: "550e8400-e29b-41d4-a716-446655440010",
    status: "paid" as const
  };

  it("shows the generate charges link when href is provided", () => {
    render(
      <ChargesSection
        charges={[]}
        onPayCharge={async () => {}}
        onGenerateChargesHref="/owner/generate"
      />
    );

    const generateLink = screen.getByRole("link", {
      name: "Generate This Month Charges"
    });

    expect(generateLink).toBeInTheDocument();
    expect(generateLink).toHaveAttribute("href", "/owner/generate");
  });

  it("does not show the generate link when href is omitted", () => {
    render(<ChargesSection charges={[]} onPayCharge={async () => {}} />);

    expect(
      screen.queryByRole("link", { name: "Generate This Month Charges" })
    ).not.toBeInTheDocument();
  });

  it("shows batch controls when reminder actions are enabled", () => {
    render(
      <ChargesSection
        charges={charges}
        onPayCharge={async () => {}}
        onSendBatchPaymentReminder={async () => ({ success: true, message: "Reminder sent." })}
      />
    );

    fireEvent.click(screen.getByLabelText(/select charge for atlas house/i));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reminder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("supports selecting all visible charges", () => {
    render(
      <ChargesSection
        charges={charges}
        onPayCharge={async () => {}}
        onSendBatchPaymentReminder={async () => ({ success: true })}
      />
    );

    fireEvent.click(screen.getByLabelText("Select all visible charges"));

    expect(screen.getByText("1 of 1 visible selected")).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("adds an aria label to charge status badges", () => {
    render(<ChargesSection charges={charges} onPayCharge={async () => {}} />);

    expect(screen.getByLabelText("Charge status: Pending")).toBeInTheDocument();
  });

  it("shows reminder activity for owner charges when available", () => {
    render(<ChargesSection charges={charges} onPayCharge={async () => {}} />);

    expect(screen.getByText("Reminder sent Mar 15, 2026")).toBeInTheDocument();
  });

  it("shows labeled charge actions in the more menu when charge management is available", () => {
    render(
      <ChargesSection
        charges={charges}
        onPayCharge={async () => {}}
        onEditCharge={async () => ({ success: true })}
        onWaiveCharge={async () => ({ success: true })}
        onDeletePendingCharge={async () => ({ success: true })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open more charge actions" }));

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not show the more menu for paid charges", () => {
    render(
      <ChargesSection
        charges={[paidCharge]}
        onPayCharge={async () => {}}
        onDeletePendingCharge={async () => ({ success: true })}
      />
    );

    expect(screen.queryByRole("button", { name: "Open more charge actions" })).not.toBeInTheDocument();
  });

  it("opens a confirmation dialog before deleting a pending charge", () => {
    render(
      <ChargesSection
        charges={charges}
        onPayCharge={async () => {}}
        onEditCharge={async () => ({ success: true })}
        onWaiveCharge={async () => ({ success: true })}
        onDeletePendingCharge={async () => ({ success: true })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open more charge actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("dialog", { name: "Delete Charge?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Charge" })).toBeInTheDocument();
  });

  it("shows a message action for owner charge rows when tenant messaging is enabled", () => {
    render(
      <ChargesSection
        charges={charges}
        onPayCharge={async () => {}}
        onSendMessageToTenant={async () => ({ success: true, message: "Sent." })}
      />
    );

    expect(screen.getByRole("button", { name: "Message Maya Bell" })).toBeInTheDocument();
  });

  it("shows tenant card payment totals and the ACH placeholder", () => {
    const payment = calculateCardFee(charges[0].amountCents);

    render(
      <ChargesSection
        charges={charges}
        onPayCharge={async () => {}}
        isTenantView
      />
    );

    expect(screen.getByText(`Includes ${formatCentsAsDollars(payment.feeCents)} processing fee`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Pay ${formatCentsAsDollars(payment.totalCents)}` })).toBeInTheDocument();
    expect(screen.getByText("Pay from bank account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coming Soon" })).toBeDisabled();
  });
});
