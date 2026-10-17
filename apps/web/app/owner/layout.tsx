"use client";

import { usePathname } from "next/navigation";
import { OwnerBottomBar } from "@/components/dashboard/owner-bottom-bar";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (["/owner", "/owner/money", "/owner/bank"].includes(pathname)) return children;
  return <div className="pb-[calc(env(safe-area-inset-bottom,0px)+10rem)] lg:pb-0">
    {children}
    <OwnerBottomBar />
  </div>;
}
