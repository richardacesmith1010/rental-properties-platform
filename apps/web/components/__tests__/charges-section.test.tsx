import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargesSection } from "@/components/dashboard/charges-section";
import { ChargeMoreMenu } from "@/components/dashboard/charge-more-menu";
import { toast } from "sonner";
import { calculateCardFee, formatCentsAsDollars } from "@/lib/payment-fees";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false })
  };
});

const refresh = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams()
}));

describe("ChargesSection", () => {
  it("keeps the toast visible and refreshes after undo", async () => {
    const undo = vi.fn(async () => ({ success: true as const, message: "Payment undone." }));
    render(<ChargeMoreMenu onUndoPayment={undo} undoChargeId="rent-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Open more payment actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo payment" }));
    fireEvent.click(screen.getByRole("dialog", { name: "Undo payment" })
      .querySelectorAll("button")[1]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Payment undone.");
  });
  it("counts only open pending rent in Due soon", () => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const futureIso = new Date(today.getTime() + 31 * 86400000).toISOString().slice(0, 10);
    const base = { id: "open", propertyId: "home", dueDate: todayIso,
      amountCents: 120000, status: "pending" as const, category: "rent" as const };
    render(<ChargesSection charges={[base, { ...base, id: "future", dueDate: futureIso }]}
      onPayCharge={async () => {}} isOwnerView />);
    expect(screen.getByRole("button", { name: "Due soon (1)" })).toBeInTheDocument();
    expect(document.getElementById("charge-open")).toBeInTheDocument();
    expect(document.getElementById("charge-future")).not.toBeInTheDocument();
  });

  it("shows Undo payment on an owner paid row with exact confirmation copy", () => {
    const charge = { id: "paid-1", propertyId: "home", dueDate: "2026-10-01",
      amountCents: 120000, status: "paid" as const, category: "rent" as const };
    const undo = vi.fn(async () => ({ success: true as const, message: "Payment undone. This rent is open again." }));
    const view = render(<ChargesSection charges={[charge]} onPayCharge={async () => {}}
      onRecordManualPayment={undo} isOwnerView />);
    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    fireEvent.click(screen.getByRole("button", { name: "Open more payment actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo payment" }));
    expect(screen.getByText("Undo this payment? The rent may show as unpaid again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    view.rerender(<ChargesSection charges={[charge]} onPayCharge={async () => {}}
      onRecordManualPayment={undo} isTenantView />);
    expect(screen.queryByRole("button", { name: "Open more payment actions" })).not.toBeInTheDocument();
  });

  it("keeps pending rent in Due soon through grace and late rent in Late", () => {
    const due = new Date();
    const twoDaysAgo = new Date(due.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const sixDaysAgo = new Date(due.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    const base = { propertyId: "home", amountCents: 100000, category: "rent" as const };
    render(<ChargesSection charges={[
      { ...base, id: "inside-grace", dueDate: twoDaysAgo, status: "pending" as const },
      { ...base, id: "past-grace", dueDate: sixDaysAgo, status: "late" as const }
    ]} onPayCharge={async () => {}} isOwnerView />);
    expect(screen.getByRole("button", { name: "Due soon (1)" })).toBeInTheDocument();
    expect(document.getElementById("charge-past-grace")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Due soon (1)" }));
    expect(document.getElementById("charge-inside-grace")).toBeInTheDocument();
    expect(document.getElementById("charge-past-grace")).not.toBeInTheDocument();
  });
  it("counts outside client rent in the Late tab while excluding owner outside rent", () => {
    const base = {
      id: "client-late", leaseId: "lease-1", propertyId: "home-1",
      tenantProfileId: "tenant-1", dueDate: "2026-10-01", amountCents: 235000,
      status: "late" as const, propertyName: "Client House", unitNumber: "1",
      tenantName: "Tenant", category: "rent" as const, collectsOutsideDomus: true
    };
    render(<ChargesSection charges={[
      { ...base, clientHome: true }, { ...base, id: "owner-late", clientHome: false }
    ]} onPayCharge={async () => {}} isOwnerView />);
    expect(screen.getByRole("button", { name: "Late (1)" })).toBeInTheDocument();
    expect(screen.getByText("Client House • 1")).toBeInTheDocument();
  });

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

  it("shows the lease-aware empty state with an add-rent link", () => {
    const { rerender } = render(<ChargesSection charges={[]} onPayCharge={async () => {}}
      isOwnerView availableLeases={[{ id: "lease-1", tenantLabel: "Maya", propertyLabel: "Home" }]}
      onGenerateChargesHref="/owner/generate" />);
    expect(screen.getByRole("heading", { name: "No rent yet" })).toBeInTheDocument();
    expect(screen.getByText("This month's rent shows up by tomorrow morning.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add this month's rent now" }))
      .toHaveAttribute("href", "/owner/generate");
    rerender(<ChargesSection charges={[]} onPayCharge={async () => {}} isOwnerView
      onGenerateChargesHref="/owner/generate" />);
    expect(screen.getByText("Rent will appear here after you create a lease.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add this month's rent now" })).not.toBeInTheDocument();
  });

  it("hides add-now when each active lease has this month's rent", () => {
    const month = new Date().toISOString().slice(0, 7);
    const lease = { id: "lease-1", tenantLabel: "Maya", propertyLabel: "Home" };
    const { rerender } = render(<ChargesSection isOwnerView onPayCharge={async () => {}}
      availableLeases={[lease]} onGenerateChargesHref="/owner/generate"
      charges={[{ id: "rent-1", leaseId: "lease-1", propertyId: "home",
        dueDate: `${month}-20`, amountCents: 100000, status: "pending", category: "rent" }]} />);
    expect(screen.queryByRole("link", { name: "Add this month's rent now" })).not.toBeInTheDocument();
    rerender(<ChargesSection isOwnerView onPayCharge={async () => {}}
      availableLeases={[lease, { id: "lease-2", tenantLabel: "Ana", propertyLabel: "Home" }]}
      onGenerateChargesHref="/owner/generate"
      charges={[{ id: "rent-1", leaseId: "lease-1", propertyId: "home",
        dueDate: `${month}-20`, amountCents: 100000, status: "pending", category: "rent" }]} />);
    expect(screen.getByRole("link", { name: "Add this month's rent now" })).toHaveAttribute("href", "/owner/generate");
  });

  it("shows the generate charges link when href is provided", () => {
    render(
      <ChargesSection
        charges={[]}
        onPayCharge={async () => {}}
        onGenerateChargesHref="/owner/generate"
      />
    );

    const generateLink = screen.getByRole("link", {
      name: "Generate this month's rent"
    });

    expect(generateLink).toBeInTheDocument();
    expect(generateLink).toHaveAttribute("href", "/owner/generate");
  });

  it("does not show the generate link when href is omitted", () => {
    render(<ChargesSection charges={[]} onPayCharge={async () => {}} />);

    expect(
      screen.queryByRole("link", { name: "Generate this month's rent" })
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

    fireEvent.click(screen.getByLabelText(/select payment for atlas house/i));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reminder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Spreadsheet" })).toBeInTheDocument();
  });

  it("supports selecting all visible charges", () => {
    render(
      <ChargesSection
        charges={charges}
        onPayCharge={async () => {}}
        onSendBatchPaymentReminder={async () => ({ success: true })}
      />
    );

    fireEvent.click(screen.getByLabelText("Select all visible payments"));

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

    fireEvent.click(screen.getByRole("button", { name: "Open more payment actions" }));

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

    expect(screen.queryByRole("button", { name: "Open more payment actions" })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Open more payment actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("dialog", { name: "Delete Payment?" })).toBeInTheDocument();
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

  it("shows tenant card and bank account payment actions", () => {
    const payment = calculateCardFee(charges[0].amountCents);

    render(
      <ChargesSection
        charges={charges}
        onPayCharge={async () => {}}
        onPayWithACH={async () => {}}
        isTenantView
      />
    );

    expect(screen.getByText(`Includes ${formatCentsAsDollars(payment.feeCents)} processing fee`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Pay ${formatCentsAsDollars(payment.totalCents)}` })).toBeInTheDocument();
    expect(screen.getByText("Pay from bank account")).toBeInTheDocument();
    expect(screen.getByText("No extra fees")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Pay ${formatCentsAsDollars(charges[0].amountCents)}` })
    ).toBeInTheDocument();
    expect(screen.getByText("FREE")).toBeInTheDocument();
  });

  it("hides tenant autopay and row payment controls when online pay is unavailable", () => {
    render(<ChargesSection charges={charges} onPayCharge={async () => {}} onPayWithACH={async () => {}} isTenantView tenantPayState="not_ready" />);
    expect(screen.queryByText("Enable Autopay")).not.toBeInTheDocument();
    expect(screen.queryByText(/processing fee/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Pay from bank account")).not.toBeInTheDocument();
  });

  it("shows owner filters and defaults to late when rent is late", () => {
    render(
      <ChargesSection
        charges={[{ ...charges[0], status: "late" }, paidCharge]}
        onPayCharge={async () => {}}
        isOwnerView
      />
    );

    expect(screen.getByRole("button", { name: "Late (1)" })).toHaveClass("font-semibold");
    expect(screen.getByRole("button", { name: "Due soon (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.queryByText(/paid this month/i)).not.toBeInTheDocument();
  });

  it("gives managers the simple rent view without owner bank messaging", () => {
    render(
      <ChargesSection
        charges={[{ ...charges[0], status: "late" }, paidCharge]}
        onPayCharge={async () => {}}
        onRecordManualPayment={async () => ({ success: true })}
        onCreateManualCharge={async () => ({ success: true })}
        onSendBatchPaymentReminder={async () => ({ success: true })}
        onSendMessageToTenant={async () => ({ success: true })}
        onGenerateChargesHref="/manager/generate"
        simpleRentView
        bankConnected={false}
        showManualPayment
        availableLeases={[{ id: "lease-1", tenantLabel: "Maya Bell", propertyLabel: "Forum House" }]}
      />
    );

    expect(screen.getByRole("button", { name: "Late (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Due soon (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark rent as paid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a one-time fee" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Generate this month's rent" })).not.toBeInTheDocument();
    expect(screen.queryByText(/paid this month/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tenants can’t pay online/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("defaults owner rent to due soon when no rent is late", () => {
    render(<ChargesSection charges={charges} onPayCharge={async () => {}} isOwnerView />);

    expect(screen.getByRole("button", { name: "Due soon (1)" })).toHaveClass("font-semibold");
  });

  it("shows owner add link when a lease has no current rent", () => {
    const { rerender } = render(
      <ChargesSection charges={[]} onPayCharge={async () => {}} isOwnerView
        availableLeases={[{ id: "lease-1", tenantLabel: "Maya", propertyLabel: "Home" }]}
        onGenerateChargesHref="/owner/generate" />
    );
    expect(screen.getByRole("link", { name: "Add this month's rent now" })).toBeInTheDocument();

    rerender(<ChargesSection charges={[]} onPayCharge={async () => {}} onGenerateChargesHref="/owner/generate" />);
    expect(screen.getByRole("link", { name: "Generate this month's rent" })).toBeInTheDocument();
  });

  it("shows owner row actions and moves Message into more", async () => {
    const remind = vi.fn(async () => ({ success: true as const }));
    render(
      <ChargesSection
        charges={[{ ...charges[0], status: "late" }]}
        onPayCharge={async () => {}}
        onRecordManualPayment={async () => ({ success: true })}
        onSendBatchPaymentReminder={remind}
        onSendMessageToTenant={async () => ({ success: true })}
        onEditCharge={async () => ({ success: true })}
        isOwnerView
        showManualPayment
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remind" }));
    await waitFor(() => expect(remind).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Message Maya Bell" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open more payment actions" }));
    expect(screen.getByRole("button", { name: "Message" })).toBeInTheDocument();
  });

  it("shows the bank line only for an owner whose bank is not ready", () => {
    const { rerender } = render(
      <ChargesSection charges={[]} onPayCharge={async () => {}} isOwnerView bankConnected={false} />
    );
    expect(screen.getByText(/Tenants can’t pay online/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect bank" })).toHaveAttribute("href", "/owner");

    rerender(<ChargesSection charges={[]} onPayCharge={async () => {}} isOwnerView bankConnected />);
    expect(screen.queryByText(/Tenants can’t pay online/)).not.toBeInTheDocument();
  });
});
