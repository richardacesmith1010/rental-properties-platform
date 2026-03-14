"use client";

import { Toaster } from "sonner";

export function SonnerProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        className: "domus-card !border-violet-200/50 !shadow-lg",
        duration: 4000,
      }}
      richColors
      closeButton
    />
  );
}
