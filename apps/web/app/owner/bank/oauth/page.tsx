import { requireRole } from "@/lib/auth";
import { finishBankLink, finishBankRelink } from "@/app/actions/bank-connections";
import { OwnerBottomBar } from "@/components/dashboard/owner-bottom-bar";
import { OAuthReturn } from "@/components/bank-feed/oauth-return";

export const dynamic = "force-dynamic";

export default async function BankOAuthPage() {
  // Middleware passes the signed-in URL (including oauth_state_id) through unchanged.
  // Signed-out returns use the existing login redirect and abandon this Link attempt;
  // after signing in, start again from /owner/bank rather than resuming the callback.
  await requireRole(["owner"]);
  return <>
    <main className="app-surface min-h-screen px-4 pb-5 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] lg:pt-5 text-[var(--ink)]
      pb-[calc(env(safe-area-inset-bottom,0px)+10rem)] lg:pb-5">
      <div className="mx-auto max-w-3xl space-y-5">
        <OAuthReturn actions={{ finish: finishBankLink, finishRelink: finishBankRelink }} />
      </div>
    </main>
    <OwnerBottomBar />
  </>;
}
