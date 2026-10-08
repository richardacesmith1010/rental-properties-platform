"use client";

import { useEffect, useState, useTransition } from "react";
import type { StatefulAction } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreateClientAccount: StatefulAction;
  onAdded: (client: { id: string; name: string; accountType: "individual" | "llc" }) => void;
}

export function AddClientSheet({ open, onClose, onCreateClientAccount, onAdded }: Props) {
  const [mobile, setMobile] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState<"individual" | "llc">("individual");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const content = (
    <form className="space-y-5 bg-[var(--surface)] p-5 text-[var(--ink)]" onSubmit={(event) => {
      event.preventDefault();
      setError("");
      startTransition(async () => {
        const data = new FormData();
        data.set("clientName", name);
        data.set("accountType", accountType);
        data.set("clientEmail", email);
        const result = await onCreateClientAccount(null, data);
        if (!result?.success) {
          setError(result?.error ?? "Could not add the client. Please try again.");
          return;
        }
        toast.success("Client added.");
        onAdded({ id: result.accountId!, name, accountType });
        setName(""); setEmail(""); setAccountType("individual");
        onClose();
      });
    }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Add client</h2>
        <Button type="button" variant="outline" onClick={onClose} title="Close add client">Close</Button>
      </div>
      <label className="block space-y-2 text-sm font-medium">Client name
        <Input name="clientName" value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who owns the home?</legend>
        <div className="grid grid-cols-2 gap-2">
          {([ ["individual", "A person", "One owner"], ["llc", "An LLC", "A business"] ] as const).map(([value, label, hint]) => (
            <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border p-3 ${
              accountType === value
                ? "border-[var(--accent)] bg-[var(--accent-weak)]"
                : "border-[var(--line)]"
            }`}>
              <input type="radio" name="accountType" value={value} checked={accountType === value} onChange={() => setAccountType(value)} />
              <span><strong className="block text-sm">{label}</strong><span className="text-xs text-[var(--muted)]">{hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-2 text-sm font-medium">Email <span className="font-normal text-[var(--muted)]">(optional)</span>
        <Input type="email" name="clientEmail" value={email} onChange={(event) => setEmail(event.target.value)} />
        <span className="block text-xs font-normal text-[var(--muted)]">Just for your records. We won&apos;t email them.</span>
      </label>
      {error && <p role="alert" className="text-sm text-[var(--warn)]">{error}</p>}
      <Button type="submit" disabled={pending || !name.trim()} className="min-h-11 w-full" title="Add this client">Add client</Button>
    </form>
  );
  return mobile ? <MobileDrawer open={open} onOpenChange={(value) => { if (!value) onClose(); }}>{content}</MobileDrawer>
    : <ModalOverlay open={open} onClose={onClose} label="Add client">{content}</ModalOverlay>;
}
