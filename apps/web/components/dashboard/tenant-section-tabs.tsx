"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { TenantBottomBar } from "./tenant-bottom-bar";

export type MainTenantSection = "overview" | "charges" | "maintenance" | "notifications";
const sections: MainTenantSection[] = ["overview", "charges", "maintenance", "notifications"];
const labels: Record<MainTenantSection, string> = {
  overview: "Home", charges: "Rent", maintenance: "Repairs", notifications: "Messages"
};
const descriptions: Record<MainTenantSection, string> = {
  overview: "Your rent, repairs, and lease at a glance.",
  charges: "Pay rent and see what you've paid.",
  maintenance: "Everything you need for your home.",
  notifications: "Talk with your landlord."
};

interface TenantSectionTabsProps {
  initialSection: MainTenantSection;
  displayName: string;
  overview: ReactNode;
  charges: ReactNode;
  maintenance: ReactNode;
  notifications: ReactNode;
  banner?: ReactNode;
}

function sectionFromUrl(): MainTenantSection | null {
  const section = new URLSearchParams(window.location.search).get("section") ?? "overview";
  return sections.find((id) => id === section) ?? null;
}

export function TenantSectionTabs(props: TenantSectionTabsProps) {
  const [active, setActive] = useState<MainTenantSection>(props.initialSection);
  const headings = useRef<Record<string, HTMLHeadingElement | null>>({});
  const focusHeading = useCallback((id: MainTenantSection) => {
    requestAnimationFrame(() => headings.current[id]?.focus());
  }, []);
  const select = useCallback((id: MainTenantSection, push = true) => {
    if (push && window.location.search !== `?section=${id}`) {
      window.history.pushState(null, "", `/tenant?section=${id}`);
    }
    setActive(id);
    window.scrollTo(0, 0);
    focusHeading(id);
  }, [focusHeading]);

  useEffect(() => {
    const onPopState = () => {
      const section = sectionFromUrl();
      if (section) select(section, false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [select]);

  const onContentClick = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    const anchor = target instanceof Element ? target.closest("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download") || (anchor.getAttribute("target") ?? "_self") !== "_self") return;
    const url = new URL(anchor.getAttribute("href") ?? "", window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== "/tenant") return;
    const section = sections.find((id) => id === url.searchParams.get("section"));
    if (!section) return;
    event.preventDefault();
    select(section);
  };

  return <>
    <div onClickCapture={onContentClick}>
      <div className="flex flex-col gap-4 border-b-2 border-[var(--ink)] px-6 pb-3 pt-6 sm:flex-row sm:items-start
        sm:justify-between lg:px-8 lg:pt-8">
        <div id="overview">
          <h1 className="font-display text-2xl font-semibold text-[var(--ink)]">
            {active === "overview" ? `Hi, ${props.displayName}` : labels[active]}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{descriptions[active]}</p>
        </div>
      </div>
      <div className="space-y-6 px-6 pb-24 pt-6 lg:px-8">
        {props.banner}
        {sections.map((id) => <section key={id} data-tenant-section={id} hidden={active !== id}>
          {id !== "overview" && id !== "notifications" ? <h2 ref={(node) => { headings.current[id] = node; }}
            tabIndex={-1} className="font-display text-[18px] font-semibold text-[var(--ink)]">
            {labels[id]}
          </h2> : <h2 ref={(node) => { headings.current[id] = node; }} tabIndex={-1} className="sr-only">
            {labels[id]}
          </h2>}
          {props[id]}
        </section>)}
      </div>
    </div>
    <TenantBottomBar activeItemId={active} onSelect={select} />
  </>;
}
