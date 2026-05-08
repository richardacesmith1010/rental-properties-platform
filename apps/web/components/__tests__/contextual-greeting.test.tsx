import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextualGreeting } from "@/components/dashboard/contextual-greeting";

describe("ContextualGreeting", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 4, 8, 9, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("omits the greeting during server render to avoid hydration mismatches", () => {
    const markup = renderToString(
      <ContextualGreeting
        userName="Courtney"
        overdueChargeCount={0}
        overdueAmountCents={0}
        openTicketCount={0}
      />
    );

    expect(markup).toContain("Courtney");
    expect(markup).not.toContain("Good morning");
  });

  it("shows the local greeting after hydration", async () => {
    render(
      <ContextualGreeting
        userName="Courtney"
        overdueChargeCount={0}
        overdueAmountCents={0}
        openTicketCount={0}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Good morning, Courtney" })).toBeInTheDocument();
    });
  });
});
