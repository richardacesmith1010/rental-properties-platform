import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutopayCard } from "@/components/dashboard/autopay-card";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false, data: null, method: "post", action: null })
  };
});

describe("AutopayCard", () => {
  const baseProps = {
    leaseId: "lease-1",
    propertyLabel: "Atlas House • Unit 1A",
    onSetupAutopay: async () => null,
    onDisableAutopay: async () => null
  };

  it("shows the active state when enrollment is enabled", () => {
    render(
      <AutopayCard
        {...baseProps}
        enrollment={{ id: "enrollment-1", last4: "4242", brand: "visa", paymentMethodType: "card", enabled: true, retryCount: 0 }}
      />
    );

    expect(screen.getByText("Autopay Active")).toBeInTheDocument();
  });

  it("shows the card brand and last4 when active", () => {
    render(
      <AutopayCard
        {...baseProps}
        enrollment={{ id: "enrollment-1", last4: "4242", brand: "visa", paymentMethodType: "card", enabled: true, retryCount: 0 }}
      />
    );

    expect(screen.getByText(/VISA •••• 4242/i)).toBeInTheDocument();
  });

  it("shows a disable button when autopay is active", () => {
    render(
      <AutopayCard
        {...baseProps}
        enrollment={{ id: "enrollment-1", last4: "4242", brand: "visa", paymentMethodType: "card", enabled: true, retryCount: 0 }}
      />
    );

    expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument();
  });

  it("shows the paused state when enrolled but disabled", () => {
    render(
      <AutopayCard
        {...baseProps}
        enrollment={{ id: "enrollment-1", last4: "1111", brand: "mastercard", paymentMethodType: "card", enabled: false, retryCount: 2 }}
      />
    );

    expect(screen.getByText("Autopay Paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-enable Autopay" })).toBeInTheDocument();
  });

  it("shows the setup prompt when no enrollment exists", () => {
    render(<AutopayCard {...baseProps} enrollment={null} />);

    expect(screen.getAllByText("Enable Autopay")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Enable Autopay" })).toBeInTheDocument();
  });

  it("shows the retry warning when an active enrollment has retry attempts", () => {
    render(
      <AutopayCard
        {...baseProps}
        enrollment={{ id: "enrollment-1", last4: "4242", brand: "visa", paymentMethodType: "card", enabled: true, retryCount: 1 }}
      />
    );

    expect(screen.getByText(/Last payment attempt failed/i)).toBeInTheDocument();
  });
});
