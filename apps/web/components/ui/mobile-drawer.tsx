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
    <Drawer.Root>
      <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 mt-24 flex flex-col rounded-t-2xl bg-white dark:bg-zinc-900",
            className
          )}
        >
          <div className="mx-auto mb-2 mt-3 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          <div className="max-h-[85vh] overflow-y-auto px-4 pb-8">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
