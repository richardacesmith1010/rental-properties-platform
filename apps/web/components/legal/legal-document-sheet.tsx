"use client";

import { ModalOverlay } from "@/components/ui/modal-overlay";
import { TermsDocument } from "./terms-document";
import { PrivacyDocument } from "./privacy-document";

export function LegalDocumentSheet({ document, onClose }: { document: "terms" | "privacy" | null; onClose: () => void }) {
  return <ModalOverlay open={document !== null} onClose={onClose}
    label={document === "terms" ? "Terms of Service" : "Privacy Policy"}>
    <div className="bg-[var(--surface)] p-6 text-[var(--ink)]">
      <button type="button" onClick={onClose} className="sticky top-0 mb-4 min-h-11 bg-[var(--surface)] px-4 underline">
        Close
      </button>
      {document === "terms" ? <TermsDocument /> : <PrivacyDocument />}
    </div>
  </ModalOverlay>;
}
