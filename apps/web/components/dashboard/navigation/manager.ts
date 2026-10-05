import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getManagerNavItems } from "../dashboard-config";
import type { SharedDashboardNavigation } from "./shared";

export function useManagerNavigation(shared: SharedDashboardNavigation, enabled: boolean) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const managerNavItems = useMemo(() => getManagerNavItems(shared.allSectionItems), [shared.allSectionItems]);
  const managerQueryRef = useRef<string | null>(null);
  const ownerQuery = searchParams.toString();
  const allSectionItems = shared.allSectionItems;
  const setActiveSection = shared.setActiveSection;
  const sectionItems = shared.sectionItems;
  const activeSection = shared.activeSection;

  useEffect(() => {
    if (!enabled) return;
    const queryChanged = managerQueryRef.current !== ownerQuery;
    managerQueryRef.current = ownerQuery;
    const params = new URLSearchParams(ownerQuery);
    const requestedSection = params.get("section");
    const nextSection = requestedSection && allSectionItems.some((item) => item.id === requestedSection) ? requestedSection : "overview";
    if (queryChanged) setActiveSection(nextSection);
    if (queryChanged && params.has("mode")) {
      params.delete("mode");
      window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
    }
  }, [allSectionItems, enabled, ownerQuery, pathname, setActiveSection]);

  const openSection = useCallback((section: string) => {
    if (!allSectionItems.some((item) => item.id === section)) return;
    setActiveSection(section);
    const params = new URLSearchParams(window.location.search);
    params.delete("mode");
    if (section === "overview") params.delete("section"); else params.set("section", section);
    window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
  }, [allSectionItems, pathname, setActiveSection]);
  const activeSectionIndex = sectionItems.findIndex((item) => item.id === activeSection);
  const goToPreviousSection = () => {
    if (!enabled || !sectionItems.length) return;
    setActiveSection(sectionItems[activeSectionIndex < 0 ? sectionItems.length - 1 : (activeSectionIndex - 1 + sectionItems.length) % sectionItems.length].id);
  };
  const goToNextSection = () => {
    if (!enabled || !sectionItems.length) return;
    setActiveSection(sectionItems[activeSectionIndex < 0 ? 0 : (activeSectionIndex + 1) % sectionItems.length].id);
  };
  return { managerNavItems, openSection, goToPreviousSection, goToNextSection };
}
