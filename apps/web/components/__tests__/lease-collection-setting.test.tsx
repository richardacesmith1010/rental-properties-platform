import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeaseCollectionSetting } from "@/components/dashboard/lease-collection-setting";

describe("LeaseCollectionSetting", () => {
  it("renders the approved plain-language copy and reports checked changes", () => {
    const onChange = vi.fn();
    render(<LeaseCollectionSetting checked={false} onChange={onChange} />);

    expect(screen.getByText("Tenant pays outside Domus")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Domus won't mark rent late or add late fees. You can still mark rent paid."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Tenant pays outside Domus/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
