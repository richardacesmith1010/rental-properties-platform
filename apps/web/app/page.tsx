import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RentFlowMarketingPage from "./(marketing)/page";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/portal");
  }

  return <RentFlowMarketingPage />;
}
