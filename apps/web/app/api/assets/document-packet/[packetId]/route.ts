import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { getSignedDocumentPacketAsset } from "@/lib/assets";

interface RouteParams {
  params: {
    packetId: string;
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
  const result = await getSignedDocumentPacketAsset(user.id, role, params.packetId);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.redirect(result.asset.signedUrl);
}
