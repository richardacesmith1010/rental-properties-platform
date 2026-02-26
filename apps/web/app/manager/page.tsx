import { RoleShell } from "@/components/role/role-shell";
import { requireRole } from "@/lib/auth";
import { signOut } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  await requireRole(["manager"]);

  return (
    <RoleShell
      title="Manager Workspace"
      subtitle="Operational access for property managers."
      bullets={[
        "Track assigned properties and units",
        "Manage maintenance workflows and vendor assignment",
        "Review rent status and follow up on delinquencies"
      ]}
      onSignOut={signOut}
    />
  );
}
