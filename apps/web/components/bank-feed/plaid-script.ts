export interface PlaidAccountMetadata {
  id?: string;
  name?: string;
  mask?: string | null;
}

interface PlaidSuccessMetadata {
  institution?: { name?: string | null } | null;
  accounts?: PlaidAccountMetadata[];
}

interface PlaidHandler {
  open: () => void;
  destroy?: () => void;
}

declare global {
  interface Window {
    Plaid?: { create: (config: {
      token: string;
      onSuccess: (publicToken: string, metadata: PlaidSuccessMetadata) => void;
      onExit?: (error: { display_message?: string | null } | null) => void;
    }) => PlaidHandler };
  }
}

let plaidScriptPromise: Promise<void> | null = null;

export function loadPlaidScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Plaid Link can only be opened in the browser."));
  if (window.Plaid) return Promise.resolve();
  if (!plaidScriptPromise) {
    plaidScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-plaid-link="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Plaid Link.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
      script.async = true;
      script.dataset.plaidLink = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Plaid Link."));
      document.head.appendChild(script);
    });
  }
  return plaidScriptPromise;
}
