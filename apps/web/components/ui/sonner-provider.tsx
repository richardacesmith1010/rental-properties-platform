"use client";

import { Toaster } from "sonner";

export function SonnerProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        className: "domus-card !border-[var(--line)] !shadow-[var(--domus-shadow-lg)]",
        duration: 4000,
      }}
      richColors
      closeButton
    />
  );
}
