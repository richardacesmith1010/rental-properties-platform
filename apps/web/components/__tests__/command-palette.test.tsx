import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Building2, LayoutDashboard } from "lucide-react";
import { describe, expect, it } from "vitest";
import { CommandPalette, type CommandPaletteSection } from "@/components/dashboard/command-palette";

const sections: CommandPaletteSection[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Portfolio snapshot and KPIs.",
    icon: LayoutDashboard
  },
  {
    id: "charges",
    label: "Charges",
    description: "Rent charges and payment status.",
    icon: Building2
  }
];

function CommandPaletteHarness() {
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open palette
      </button>
      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        sections={sections}
        properties={[]}
        tenants={[]}
        onSelectSection={() => {}}
        onSelectProperty={() => {}}
        onSelectTenant={() => {}}
      />
    </div>
  );
}

describe("CommandPalette", () => {
  it("renders as a dialog with listbox results and restores focus on close", async () => {
    render(<CommandPaletteHarness />);

    const trigger = screen.getByRole("button", { name: "Open palette" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Search commands" });
    expect(dialog).toBeInTheDocument();
    const input = screen.getByRole("combobox", { name: "Search commands" });
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Command results" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Search commands" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("supports arrow navigation and traps tab focus inside the dialog", async () => {
    render(<CommandPaletteHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open palette" }));

    const input = await screen.findByRole("combobox", { name: "Search commands" });
    const options = screen.getAllByRole("option");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    act(() => {
      options[options.length - 1].focus();
    });
    fireEvent.keyDown(options[options.length - 1], { key: "Tab" });

    expect(document.activeElement).toBe(input);
  });
});
