import { getGeneratedMessage } from "@/lib/format";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { OwnerPageSearchParams, ResolvedOwnerRequest } from "./types";

function getSingleSearchParam(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return null;
}

export function resolveOwnerPageRequest(
  searchParams: OwnerPageSearchParams | undefined,
  ownershipAccounts: OwnershipAccountDTO[]
): ResolvedOwnerRequest {
  const requestedMode = null;
  const requestedSectionId = getSingleSearchParam(searchParams?.section);
  const requestedPropertyId = getSingleSearchParam(searchParams?.property);
  const accountParam = getSingleSearchParam(searchParams?.account);
  const activeAccountId = ownershipAccounts.some((account) => account.id === accountParam)
    ? accountParam!
    : ownershipAccounts[0]?.id ?? null;
  const initialOwnerWorkflowMode = undefined;

  return {
    accountParam,
    activeAccountId,
    generatedMessage: getGeneratedMessage(searchParams?.generated),
    hasExplicitSection: requestedSectionId !== null,
    initialOwnerHomePage: requestedSectionId === null || requestedSectionId === "overview",
    initialOwnerWorkflowMode,
    initialPropertyId: requestedPropertyId,
    initialSectionId: requestedSectionId,
    requestedMode,
    requestedPropertyId,
    requestedSectionId
  };
}
