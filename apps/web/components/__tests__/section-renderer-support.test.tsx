import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionFrame, SectionNotFoundState } from "@/components/dashboard/section-renderer-support";
import type { SectionRendererProps } from "@/components/dashboard/section-map";

const availableProperties = [
  {
    id: "property-1",
    name: "Atlas House",
    addressLine1: "123 Forum Ave",
    city: "Denver",
    state: "CO"
  }
];

function buildProps(overrides: Partial<SectionRendererProps> = {}): SectionRendererProps {
  return {
    activeSection: "overview",
    data: {
      profileRole: "owner"
    },
    availableProperties,
    selectedPropertyId: null,
    onSelectProperty: vi.fn(),
    ...overrides
  } as SectionRendererProps;
}

function renderSectionFrame(overrides: Partial<SectionRendererProps> = {}) {
  const props = buildProps(overrides);
  render(
    <SectionFrame props={props} sectionName="Overview">
      <div>Section content</div>
    </SectionFrame>
  );
  return props;
}

describe("SectionFrame property scope control", () => {
  it("renders the selector for managers with available properties and scopes on selection", () => {
    const onSelectProperty = vi.fn();
    renderSectionFrame({
      data: { profileRole: "manager" } as SectionRendererProps["data"],
      onSelectProperty
    });

    fireEvent.change(screen.getByLabelText("Property Scope"), {
      target: { value: "property-1" }
    });

    expect(screen.getByRole("option", { name: "Atlas House" })).toBeInTheDocument();
    expect(onSelectProperty).toHaveBeenCalledWith("property-1");
  });

  it("hides the selector for managers with no available properties", () => {
    renderSectionFrame({
      data: { profileRole: "manager" } as SectionRendererProps["data"],
      availableProperties: []
    });

    expect(screen.queryByLabelText("Property Scope")).not.toBeInTheDocument();
  });

  it("renders the selector for owners with available properties", () => {
    renderSectionFrame();

    expect(screen.getByLabelText("Property Scope")).toBeInTheDocument();
  });

  it("hides the selector for tenants even when properties are available", () => {
    renderSectionFrame({
      data: { profileRole: "tenant" } as SectionRendererProps["data"]
    });

    expect(screen.queryByLabelText("Property Scope")).not.toBeInTheDocument();
  });

  it("hides the selector on the members section", () => {
    renderSectionFrame({
      data: { profileRole: "manager" } as SectionRendererProps["data"],
      activeSection: "members"
    });

    expect(screen.queryByLabelText("Property Scope")).not.toBeInTheDocument();
  });

  it("hides the selector on the tenants section", () => {
    renderSectionFrame({
      data: { profileRole: "manager" } as SectionRendererProps["data"],
      activeSection: "tenants"
    });

    expect(screen.queryByLabelText("Property Scope")).not.toBeInTheDocument();
  });

  it("renders an explicit fallback for unknown sections", () => {
    render(<SectionNotFoundState activeSection="foobar" role="owner" />);

    expect(screen.getByText("Section not found")).toBeInTheDocument();
    expect(screen.getByText(/doesn't exist for your role/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/owner");
  });
});
