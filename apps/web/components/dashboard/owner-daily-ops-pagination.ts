"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NavItem } from "./sidebar-nav";

export const OWNER_DAILY_OPS_SECTION_IDS = [
  "overview",
  "charges",
  "portfolio",
  "maintenance",
  "leases",
  "manager-payments",
  "analytics"
] as const;

interface UseOwnerDailyOpsPaginationArgs {
  enabled: boolean;
  activeSection: string;
  sectionItems: NavItem[];
  onSelectSection: (sectionId: string) => void;
}

export function useOwnerDailyOpsPagination({
  enabled,
  activeSection,
  sectionItems,
  onSelectSection
}: UseOwnerDailyOpsPaginationArgs) {
  const totalPages = enabled ? sectionItems.length + 1 : 0;
  const [currentPage, setCurrentPage] = useState(0);

  const currentSectionItem = useMemo(
    () => (currentPage > 0 ? sectionItems[currentPage - 1] ?? null : null),
    [currentPage, sectionItems]
  );

  useEffect(() => {
    if (!enabled) {
      setCurrentPage(0);
      return;
    }

    const matchingIndex = sectionItems.findIndex((item) => item.id === activeSection);
    if (matchingIndex < 0) {
      return;
    }

    if (currentPage === 0 && activeSection === "overview") {
      return;
    }

    const nextPage = matchingIndex + 1;
    if (currentPage !== nextPage) {
      setCurrentPage(nextPage);
    }
  }, [activeSection, currentPage, enabled, sectionItems]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (currentPage > sectionItems.length) {
      setCurrentPage(sectionItems.length);
    }
  }, [currentPage, enabled, sectionItems.length]);

  const selectPage = useCallback(
    (nextPage: number) => {
      if (!enabled) {
        return;
      }

      const normalizedPage =
        totalPages === 0 ? 0 : ((nextPage % totalPages) + totalPages) % totalPages;
      setCurrentPage(normalizedPage);

      if (normalizedPage === 0) {
        if (activeSection !== "overview") {
          onSelectSection("overview");
        }
        return;
      }

      const nextSectionId = sectionItems[normalizedPage - 1]?.id;
      if (nextSectionId && nextSectionId !== activeSection) {
        onSelectSection(nextSectionId);
      }
    },
    [activeSection, enabled, onSelectSection, sectionItems, totalPages]
  );

  const goToHomePage = useCallback(() => {
    selectPage(0);
  }, [selectPage]);

  const goToPreviousPage = useCallback(() => {
    selectPage(currentPage - 1);
  }, [currentPage, selectPage]);

  const goToNextPage = useCallback(() => {
    selectPage(currentPage + 1);
  }, [currentPage, selectPage]);

  const goToSectionPage = useCallback(
    (sectionId: string) => {
      const matchingIndex = sectionItems.findIndex((item) => item.id === sectionId);
      if (!enabled || matchingIndex < 0) {
        return false;
      }

      selectPage(matchingIndex + 1);
      return true;
    },
    [enabled, sectionItems, selectPage]
  );

  return {
    currentPage,
    currentPageLabel: currentPage === 0 ? "Home" : currentSectionItem?.label ?? "Overview",
    currentPageCountLabel: totalPages > 0 ? `${currentPage + 1} of ${totalPages}` : null,
    isHomePage: enabled && currentPage === 0,
    totalPages,
    goToHomePage,
    goToNextPage,
    goToPreviousPage,
    goToSectionPage
  };
}
