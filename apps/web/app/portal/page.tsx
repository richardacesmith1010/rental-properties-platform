import { redirect } from "next/navigation";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  redirect(getRoleHomePath(role));
}
