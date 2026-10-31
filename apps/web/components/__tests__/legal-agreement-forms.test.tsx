import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgreeForm } from "@/components/legal/agree-form";
import { LegalAgreementCheckbox } from "@/components/legal/legal-agreement-checkbox";
import { LegalBackBar } from "@/components/legal/legal-back-bar";
import { CreateAccountForm } from "@/components/auth/create-account-form";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
const m = vi.hoisted(() => ({ updateUser: vi.fn(), getUser: vi.fn(), signUp: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: m }) }));
const label = "I am 18 or older. I agree to the Terms of Service.";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  vi.clearAllMocks(); m.updateUser.mockResolvedValue({ error: { message: "Please try again" } });
  m.getUser.mockResolvedValue({ data: { user: { id: "p" } }, error: null });
});
function passwordForm() {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
  fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "Password123" } });
}
describe("agreement forms and sheets", () => {
  it("P6 unchecked Continue is enabled; empty submit announces, focuses and never calls the action", async () => {
    const action = vi.fn(); render(<AgreeForm next="/tenant" action={action} />);
    expect(screen.getByLabelText(label)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the box to agree first.");
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-describedby", "agree-error");
    expect(screen.getByLabelText(label)).toHaveFocus(); expect(action).not.toHaveBeenCalled();
  });
  it.each([["Read the Terms", "Terms of Service"], ["Read the Privacy Policy", "Privacy Policy"]])(
    "F3 %s opens current text, Close restores focus and preserves the box", async (button, title) => {
      render(<LegalAgreementCheckbox id="test-agree" />);
      const box = screen.getByLabelText(label); fireEvent.click(box);
      const opener = screen.getByRole("button", { name: button }); opener.focus(); fireEvent.click(opener);
      const dialog = await screen.findByRole("dialog", { name: title });
      expect(dialog).toHaveTextContent("Last updated: October 30, 2026");
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(opener).toHaveFocus(); expect(box).toBeChecked();
    });
  it("F1 exact label and notice, local empty-box error, no browser signup or Legal links nav", async () => {
    const action = vi.fn(); render(<CreateAccountForm action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Password123" } });
    expect(screen.getByText("Our Privacy Policy explains how we use your data.")).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Check the box to agree first.");
    expect(screen.getByLabelText(label)).toHaveFocus(); expect(action).not.toHaveBeenCalled();
    expect(m.signUp).not.toHaveBeenCalled(); expect(screen.queryByRole("navigation", { name: "Legal links" })).toBeNull();
  });
  it("F2 record errors stop password changes", async () => {
    const record = vi.fn().mockResolvedValue({ success: false, error: "We could not save this. Please try again." });
    render(<CompleteProfileForm email="person@example.com" needsAgreement recordAgreement={record} />); passwordForm();
    fireEvent.click(screen.getByLabelText(label));
    fireEvent.submit(screen.getByRole("button", { name: "Complete Setup" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not save this. Please try again.");
    expect(record.mock.calls).toEqual([[{ agreed: true, termsVersion: "2026-10-30", privacyVersion: "2026-10-30" }]]);
    expect(m.updateUser).not.toHaveBeenCalled();
  });
  it("F2b same-page retry repeats idempotent recording before password update and retains the box", async () => {
    const record = vi.fn().mockResolvedValue({ success: true });
    render(<CompleteProfileForm email="person@example.com" needsAgreement recordAgreement={record} />); passwordForm();
    fireEvent.click(screen.getByLabelText(label)); const form = screen.getByRole("button", { name: "Complete Setup" }).closest("form")!;
    fireEvent.submit(form); await waitFor(() => expect(m.updateUser).toHaveBeenCalledTimes(1));
    await screen.findByRole("alert"); expect(screen.getByLabelText(label)).toBeChecked();
    fireEvent.submit(form); await waitFor(() => expect(m.updateUser).toHaveBeenCalledTimes(2));
    expect(record).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) expect(record.mock.invocationCallOrder[i]).toBeLessThan(m.updateUser.mock.invocationCallOrder[i]);
  });
  it("F2c when already accepted, only the password update runs", async () => {
    const record = vi.fn(); render(<CompleteProfileForm email="person@example.com" needsAgreement={false} recordAgreement={record} />);
    passwordForm(); expect(screen.queryByLabelText(label)).toBeNull();
    fireEvent.submit(screen.getByRole("button", { name: "Complete Setup" }).closest("form")!);
    await waitFor(() => expect(m.updateUser).toHaveBeenCalledWith({ password: "Password123" }));
    expect(record).not.toHaveBeenCalled();
  });
  it("F2 empty invite box focuses and stops both calls", async () => {
    const record = vi.fn(); render(<CompleteProfileForm email="person@example.com" needsAgreement recordAgreement={record} />);
    passwordForm(); fireEvent.submit(screen.getByRole("button", { name: "Complete Setup" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the box to agree first.");
    expect(screen.getByLabelText(label)).toHaveFocus(); expect(record).not.toHaveBeenCalled(); expect(m.updateUser).not.toHaveBeenCalled();
  });
  it.each([true, false])("B1 Back uses same-origin history=%s and otherwise /login", (sameOrigin) => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const assign = vi.fn(); const originalWindow = window;
    vi.stubGlobal("window", new Proxy(originalWindow, { get(target, key) {
      if (key === "location") return { origin: "http://localhost:3000", assign };
      return Reflect.get(target, key);
    } }));
    Object.defineProperty(document, "referrer", { value: sameOrigin ? "http://localhost:3000/login" : "https://elsewhere.test",
      configurable: true });
    render(<LegalBackBar />); fireEvent.click(screen.getByRole("button", { name: "‹ Back" }));
    if (sameOrigin) { expect(back).toHaveBeenCalledTimes(1); expect(assign).not.toHaveBeenCalled(); }
    else { expect(back).not.toHaveBeenCalled(); expect(assign.mock.calls).toEqual([["/login"]]); }
    back.mockRestore();
  });
});
