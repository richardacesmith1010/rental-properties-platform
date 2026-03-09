import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { checkAndAwardAchievements, getUserGamification } from "@/lib/gamification";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getCurrentUserRole(user.id);
  const newAchievements = await checkAndAwardAchievements(user.id, role);
  const gamification = await getUserGamification(user.id);

  return NextResponse.json({
    currentLevel: gamification.currentLevel,
    newAchievements
  });
}
