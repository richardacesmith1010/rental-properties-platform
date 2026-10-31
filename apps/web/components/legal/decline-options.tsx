import { signOut } from "@/app/actions/auth";
import type { AppRole } from "@/lib/auth";
import { YourDataSettings } from "@/components/settings/your-data-settings";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";

export function DeclineOptions({ role }: { role: AppRole }) {
  return <details className="mt-6 text-sm text-[var(--ink)]">
    <summary className="min-h-11 cursor-pointer py-3">Don&apos;t want to agree?</summary>
    <div className="space-y-4">
      <p>You can sign out, or ask us to delete your account.</p>
      <form action={signOut}><button type="submit" className="min-h-11 underline">Sign out</button></form>
      {role === "tenant" ? <>
        <p>Not ready? Ask your landlord about other ways to pay rent.</p>
        <p>Deleting your account does not end your lease. Download your data first.</p>
      </> : null}
      {role === "owner" ? <>
        <p>Email privacy@domusbase.com for your data.</p><DeleteAccountSection />
      </> : <YourDataSettings />}
    </div>
  </details>;
}
