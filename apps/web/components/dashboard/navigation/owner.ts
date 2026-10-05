import { useCallback, useEffect, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getOwnerNavItems } from "../dashboard-config";
import type { DashboardProps } from "../types";
import type { SharedDashboardNavigation } from "./shared";
import { OwnerSectionCacheContext } from "../owner-section-cache";
import { useContext, useState } from "react";

export function useOwnerNavigation(props: DashboardProps, shared: SharedDashboardNavigation, enabled: boolean) {
  const ownerCache = useContext(OwnerSectionCacheContext);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startRouteTransition] = useTransition();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const ownerNavItems = useMemo(() => getOwnerNavItems(shared.allSectionItems), [shared.allSectionItems]);
  const ownerQuery = searchParams.toString();
  const setActiveSection = shared.setActiveSection;

  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams(ownerQuery);
    setActiveSection(params.get("section") ?? (params.has("mode") || ownerCache ? "overview" : props.initialSectionId ?? "overview"));
    if (params.has("mode")) {
      params.delete("mode");
      window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
    }
  }, [enabled, ownerCache, ownerQuery, pathname, props.initialSectionId, setActiveSection]);

  const navigateOwnerDashboard = useCallback((section: string) => {
    setActiveSection(section);
    const params = ownerCache?.navigationParams() ?? new URLSearchParams(searchParams.toString());
    params.delete("mode");
    if (section === "overview") params.delete("section"); else params.set("section", section);
    const url = `${pathname}${params.size ? `?${params}` : ""}`;
    if (ownerCache) ownerCache.navigate(url, section === "overview" ? "daily-ops-home" : section);
    else startRouteTransition(() => router.replace(url));
  }, [ownerCache, pathname, router, searchParams, setActiveSection]);

  useEffect(() => {
    if (!enabled) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setIsCommandPaletteOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [enabled]);

  const openSection = useCallback((section: string) => {
    if (shared.allSectionItems.some((item) => item.id === section)) navigateOwnerDashboard(section);
  }, [navigateOwnerDashboard, shared.allSectionItems]);
  return {
    activeSectionLabel: ownerNavItems.find((item) => item.id === shared.activeSection)?.label ?? (shared.activeSection === "operations" ? "Add" : "Section not found"),
    isOwnerDailyOpsHomePage: shared.activeSection === "overview",
    navigateOwnerDashboard,
    ownerNavItems,
    openSection,
    isCommandPaletteOpen,
    openCommandPalette: () => setIsCommandPaletteOpen(true),
    closeCommandPalette: () => setIsCommandPaletteOpen(false)
  };
}
