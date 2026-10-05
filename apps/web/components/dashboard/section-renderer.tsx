import type { OperationTask } from "./operations-section";
import type { SectionRendererProps } from "./section-map";
import { renderSectionCases } from "./sections/render-section-cases";

export interface SectionRendererComponentProps extends SectionRendererProps {
  rentCollectionConnected?: boolean;
  initialOperationsTask?: OperationTask;
  initialOperationsPropertyId?: string | null;
  onInitialOperationsStateConsumed?: () => void;
}

export function SectionRenderer(props: SectionRendererComponentProps) {
  const propertyOptions = props.safePortfolio.properties.map((property) => ({
    id: property.id,
    name: property.name
  }));
  const ownershipPropertyOptions = props.safePortfolio.properties.map((property) => ({
    id: property.id,
    name: property.name,
    ownerAccountName: property.ownerAccountName
  }));
  const approvedApplicationCount =
    props.approvedApplicationCount ??
    props.safeApplications.filter((application) => application.status === "approved").length;
  const totalApplicationCount = props.applicationCount ?? props.safeApplications.length;
  const activeOwnershipAccount =
    (props.activeAccountId
      ? props.safeOwnershipAccounts.find((account) => account.id === props.activeAccountId)
      : props.safeOwnershipAccounts[0]) ?? null;

  return renderSectionCases({
    props,
    propertyOptions,
    ownershipPropertyOptions: ownershipPropertyOptions as Array<{ id: string; name: string; ownerAccountName: string }>,
    approvedApplicationCount,
    totalApplicationCount,
    activeOwnershipAccount
  });
}
