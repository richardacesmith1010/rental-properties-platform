import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { getSignedMaintenancePhotoAsset } from "@/lib/assets";

interface RouteParams {
  params: {
    photoId: string;
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = await getCurrentUserRole(user.id);
  const result = await getSignedMaintenancePhotoAsset(user.id, role, params.photoId);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.redirect(result.asset.signedUrl);
}
