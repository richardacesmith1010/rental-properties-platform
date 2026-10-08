import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedTabs } from "@/components/ui/animated-tabs";

const resize = vi.fn();
class MockResizeObserver {
  observe = resize;
  disconnect = vi.fn();
}

describe("AnimatedTabs", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return this.textContent === "Conversations" ? 120 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.textContent === "Conversations" ? 96 : 72;
    });
  });

  it("positions the indicator under the initially active second tab", () => {
    const { container } = render(<AnimatedTabs tabs={[{ id: "timeline", label: "Updates" },
      { id: "threads", label: "Conversations" }]} activeTab="threads" onTabChange={vi.fn()} />);
    const activeTab = screen.getByRole("tab", { name: "Conversations" });
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(activeTab.className).toContain("min-h-11");
    expect(activeTab.className).toContain("sm:min-h-0");
    expect(container.firstElementChild?.lastElementChild).toHaveStyle({ left: "120px", width: "96px" });
  });
});
