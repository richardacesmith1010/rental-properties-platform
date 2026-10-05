"use client";

import { Drawer } from "vaul";
import { type ReactNode } from "react";
import { cn } from "@/lib/format";

interface MobileDrawerProps {
  trigger?: ReactNode;
  children: ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function MobileDrawer({ trigger, children, className, open, onOpenChange }: MobileDrawerProps) {
  return (
    <Drawer.Root direction="left" open={open} onOpenChange={onOpenChange}>
      {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
        <Drawer.Content
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-full w-[min(88vw,22rem)] max-w-[22rem] flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--domus-shadow-lg)]",
            className
          )}
        >
          <Drawer.Title className="sr-only">Menu</Drawer.Title>
          <Drawer.Description className="sr-only">Open dashboard sections.</Drawer.Description>
          <div className="max-h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
