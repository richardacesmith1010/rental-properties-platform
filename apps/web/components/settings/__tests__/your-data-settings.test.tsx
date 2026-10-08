import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { YourDataSettings } from "@/components/settings/your-data-settings";

const sections = { profile: { title: "Profile", content: <div>Profile</div> },
  yourData: { title: "Your data", content: <YourDataSettings /> } };

describe("Your data settings", () => {
  it.each(["tenant", "manager"] as const)("shows download and deletion note for %s", (role) => {
    render(<SettingsLayout role={role} sections={sections} />);
    fireEvent.click(screen.getAllByTitle("Open Your data settings.")[0]);
    expect(screen.getByText("Get a copy of your Domus data as a file.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download my data" })).toBeTruthy();
    expect(screen.getByText("Want your account deleted? Tell us with Send feedback. We will reply by email.")).toBeTruthy();
  });

  it("hides Your data from owners", () => {
    render(<SettingsLayout role="owner" sections={sections} />);
    expect(screen.queryByTitle("Open Your data settings.")).toBeNull();
  });

  it("shows a failed download response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Try later." }) }));
    render(<YourDataSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Try later.");
    vi.unstubAllGlobals();
  });
});
