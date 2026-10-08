import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsLayout } from "@/components/settings/settings-layout";

const sections = {
  profile: { title: "Profile", content: <div>Profile content</div> },
  security: { title: "Security", content: <div>Security content</div> }
};

describe("SettingsLayout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("keeps the mobile settings layout shrinkable and tabs scrollable", () => {
    render(<SettingsLayout role="owner" sections={sections} />);

    const mobileNav = screen.getAllByLabelText("Settings navigation")[1];
    const section = screen.getByText("Profile content").closest("section");
    expect(section?.className).toContain("min-w-0");
    expect(mobileNav.closest("aside")?.className).toContain("min-w-0");
    expect(mobileNav.className).toContain("overflow-x-auto");
    const securityTab = screen.getAllByTitle("Open Security settings.")[1];
    expect(securityTab.className).toContain("shrink-0");
    expect(securityTab.className).toContain("min-h-11");
    expect(section?.parentElement?.className).toContain("grid-cols-[minmax(0,1fr)]");
  });

  it("scrolls the selected mobile tab into view on mount and selection", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView");

    render(<SettingsLayout role="owner" sections={sections} />);

    const profileTab = screen.getAllByTitle("Open Profile settings.")[1];
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: "nearest", block: "nearest" });
    expect(scrollIntoView.mock.contexts).toContain(profileTab);

    const securityTab = screen.getAllByTitle("Open Security settings.")[1];
    fireEvent.click(securityTab);

    expect(scrollIntoView).toHaveBeenLastCalledWith({ inline: "nearest", block: "nearest" });
    expect(scrollIntoView.mock.contexts).toContain(securityTab);
    expect(screen.getByText("Security content")).toBeTruthy();
  });
});
