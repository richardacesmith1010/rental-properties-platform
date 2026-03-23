"use client";

import { Drawer } from "vaul";
import { type ReactNode } from "react";
import { cn } from "@/lib/format";

interface MobileDrawerProps {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}

export function MobileDrawer({ trigger, children, className }: MobileDrawerProps) {
  return (
    <Drawer.Root direction="left">
      <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
        <Drawer.Content
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-full w-[86vw] max-w-[320px] flex-col border-r border-white/10 bg-white text-foreground shadow-2xl dark:bg-zinc-900",
            className
          )}
        >
          <div className="max-h-full overflow-y-auto px-4 pb-8 pt-5">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
