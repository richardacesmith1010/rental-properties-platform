import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NeedsYouList } from "@/components/dashboard/owner-home/needs-you-list";
import { MobileTopBar } from "@/components/dashboard/sidebar/sidebar-nav";
import { CardTitle } from "@/components/ui/card";

vi.mock("next/navigation", () => ({ usePathname: () => "/manager" }));
vi.mock("@/components/theme-provider", () => ({ useDomusTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/dashboard/sidebar/user-footer", () => ({
  SidebarUserFooter: () => null,
  MobileUserFooter: () => null,
}));
vi.mock("@/components/dashboard/notification-bell-menu", () => ({ NotificationBellMenu: () => null }));

describe("redesign leftovers", () => {
  it("dashboard title rule", () => {
    const source = readFileSync(join(process.cwd(), "components/dashboard/index.tsx"), "utf8");
    const titleRow = source.match(/className={`flex w-full items-start justify-between gap-3([\s\S]*?)`}/)?.[1];
    const titleHeadings = [...source.matchAll(/<h1\b[^>]*>/g)].map(([heading]) => heading);

    expect(titleRow).toContain('"mx-auto max-w-[720px] border-b-2 border-[var(--ink)]"');
    expect(titleRow).toContain('"flex-col sm:flex-row border-b-2 border-[var(--ink)]"');
    expect(titleHeadings).toHaveLength(2);
    expect(titleHeadings.every((heading) => !heading.includes("font-bold"))).toBe(true);
  });

  it("needs you uses a plain panel and distinct late and bank markers without changing row labels", () => {
    render(<NeedsYouList
      summary={{ lateCharges: [{ id: "late-1", tenantName: "Angel" } as never],
        openRepairCount: 0, newMessageCount: 0 }}
      bankNeedsCount={3} hasBankConnection
      bankState={{ status: "connected", href: "/owner/bank" }} onOpenSection={vi.fn()} />);

    const section = screen.getByRole("region", { name: "Needs you" });
    const panel = section.querySelector("div.overflow-hidden");
    expect(panel).toHaveClass("bg-[var(--surface)]", "border-[var(--line)]");
    expect(panel).not.toHaveClass("bg-[var(--warn-bg)]");

    const late = within(section).getByRole("button", { name: "Angel's rent is late" });
    const bank = within(section).getByRole("link", { name: "3 bank items to check" });
    expect(late.textContent).toBe("Angel's rent is late");
    expect(bank.textContent).toBe("3 bank items to check");
    expect(late.querySelector("[aria-hidden='true'].h-2.w-2")).toHaveClass("bg-[var(--warn)]");
    expect(bank.querySelector("[aria-hidden='true'].h-2.w-2")).toHaveClass("bg-[var(--accent)]");
  });

  it("card title uses the display face without bold tracking", () => {
    render(<CardTitle>Your lease</CardTitle>);
    expect(screen.getByRole("heading", { name: "Your lease" })).toHaveClass("domus-heading", "font-display", "font-semibold");
    expect(screen.getByRole("heading", { name: "Your lease" })).not.toHaveClass("font-bold", "tracking-tight");
  });

  it("mobile top bar logo renders the two-path DomusMark instead of a Landmark icon", () => {
    const { container } = render(<MobileTopBar role="manager" userEmail="manager@example.test" onSignOut={vi.fn()} />);
    const mark = container.querySelector("span.bg-\\[var\\(--action\\)\\] svg");
    expect(mark).not.toBeNull();
    expect(mark?.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelector(".lucide-landmark")).toBeNull();
  });
});
