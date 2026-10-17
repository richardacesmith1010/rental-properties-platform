import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SupportPage from "@/app/support/page";
import sitemap from "@/app/sitemap";
import { CreateAccountForm } from "@/components/auth/create-account-form";
import { YourDataSettings } from "@/components/settings/your-data-settings";
import { AccountDataSettings } from "@/components/settings/account-data-settings";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { AskDomusSettings } from "@/components/settings/ask-domus-settings";
import { LandingPage } from "@/components/marketing/landing-page";

const action = async () => ({ success: true as const });

describe("App Store links and support", () => {
  it("renders a public support page and sitemap entry", () => {
    const html = renderToStaticMarkup(<SupportPage />);
    expect(html).toContain("Get help");
    expect(html).toContain("Tap Your data, then Delete my account.");
    expect(html).toContain("Owners tap Account &amp; Data instead.");
    expect(html).not.toContain("send us feedback");
    expect(html).toContain("mailto:support@domusbase.com");
    expect(html).toContain("mailto:privacy@domusbase.com");
    expect(sitemap().some((entry) => entry.url === "https://domusbase.com/support")).toBe(true);
  });

  it("shows Privacy and Terms under the sign-up button", () => {
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });

  it("shows Privacy and Terms in tenant, manager, and owner data panels", () => {
    const { unmount } = render(<YourDataSettings />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    unmount();
    render(<AccountDataSettings onDeleteAllProperties={action} onDeleteAllTenants={action}
      onDeleteAllManagers={action} onDeleteAllLeases={action} onDeleteAllFinancialData={action}
      onFullAccountWipe={action} />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });

  it.each(["owner", "manager"] as const)("shows Ask Domus settings for %s", (role) => {
    render(<SettingsLayout role={role} sections={{ askDomus: { title: "Ask Domus", content: <p>Consent</p> } }} />);
    expect(screen.getAllByRole("button", { name: /Ask Domus/ }).length).toBeGreaterThan(0);
  });

  it("starts the switch from the server value and changes only after save", async () => {
    let resolve!: (value: { success: boolean }) => void;
    const save = vi.fn(() => new Promise<{ success: boolean }>((done) => { resolve = done; }));
    render(<AskDomusSettings initialEnabled onSetConsent={save} />);
    const toggle = screen.getByRole("switch", { name: "Let Ask Domus answer my questions" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(save).toHaveBeenCalledWith(false);
    resolve({ success: true });
    await screen.findByRole("switch", { name: "Let Ask Domus answer my questions" });
    await vi.waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  });

  it("keeps the switch off when saving fails", async () => {
    render(<AskDomusSettings initialEnabled={false} onSetConsent={async () => ({
      success: false, error: "We could not save this. Please try again."
    })} />);
    const toggle = screen.getByRole("switch", { name: "Let Ask Domus answer my questions" });
    fireEvent.click(toggle);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not save this. Please try again.");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("links Support from the landing footer", () => {
    const html = renderToStaticMarkup(<LandingPage />);
    expect(html).toContain('href="/support"');
  });
});
