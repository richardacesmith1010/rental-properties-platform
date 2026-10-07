import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AutomationTemplatesSection } from "@/components/dashboard/automation-templates-section";
import type { AutomationTemplateDTO } from "@/lib/automations";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: (action: unknown, initial: unknown) => [initial, action],
  useFormStatus: () => ({ pending: false })
}));

const base: AutomationTemplateDTO = {
  id: "one", key: "late_rent_sequence", name: "Database name", description: "Database details",
  roleScope: "both", enabledByDefault: false
};

describe("AutomationTemplatesSection", () => {
  it("shows mapped copy and preserves database copy for unknown keys", () => {
    render(<AutomationTemplatesSection role="owner" templates={[base, {
      ...base, id: "two", key: "future_sequence", name: "Future steps", description: "Future details"
    }]} rules={[]} properties={[{ id: "home", name: "Atlas House" }]} />);
    expect(screen.getByText("Late rent steps")).toBeInTheDocument();
    expect(screen.getByText("Rent becomes late")).toBeInTheDocument();
    expect(screen.getByText("Tell the tenant and keep track when rent is late.")).toBeInTheDocument();
    expect(screen.getByText("Future steps")).toBeInTheDocument();
    expect(screen.getByText("Starts on its own")).toBeInTheDocument();
    expect(screen.getByText("Future details")).toBeInTheDocument();
  });
});
