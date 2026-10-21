import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsLayout } from "@/components/settings/settings-layout";

const sections = {
  profile: { title: "Profile", content: <div>Profile content</div> },
  notifications: { title: "Notifications", content: <div>Notifications content</div> },
  bank: { title: "Bank Account", content: <div>Bank content</div> }
};

afterEach(cleanup);

describe("SettingsLayout initial section", () => {
  it("opens an owner's notifications deep link and allows later tab clicks", () => {
    render(<SettingsLayout role="owner" sections={sections} initialSection="notifications" />);
    expect(screen.getByText("Notifications content")).toBeInTheDocument();
    expect(screen.getAllByTitle("Open Notifications settings.")[0].className).toContain("font-semibold");
    expect(screen.getAllByTitle("Open Notifications settings.")[1].className).toContain("bg-[var(--accent-weak)]");
    fireEvent.click(screen.getAllByTitle("Open Profile settings.")[0]);
    expect(screen.getByText("Profile content")).toBeInTheDocument();
  });

  it("uses the first tenant tab when the linked section is unavailable", () => {
    render(<SettingsLayout role="tenant" sections={sections} initialSection="bank" />);
    expect(screen.getByText("Profile content")).toBeInTheDocument();
    expect(screen.queryByText("Bank content")).not.toBeInTheDocument();
  });

  it("uses the first tab when no section is provided", () => {
    render(<SettingsLayout role="owner" sections={sections} />);
    expect(screen.getByText("Profile content")).toBeInTheDocument();
  });
});
