"use client";

import { useEffect, useState, type ReactNode } from "react";

interface FirstVisitHelpProps {
  sectionId: string;
  children: ReactNode;
}

export function FirstVisitHelp({ sectionId, children }: FirstVisitHelpProps) {
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    const key = `domus-seen-${sectionId}`;
    const hasSeen = window.localStorage.getItem(key) === "true";
    setSeen(hasSeen);
    if (!hasSeen) {
      window.localStorage.setItem(key, "true");
    }
    setReady(true);
  }, [sectionId]);

  if (!ready || seen) {
    return null;
  }

  return (
    <p className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
