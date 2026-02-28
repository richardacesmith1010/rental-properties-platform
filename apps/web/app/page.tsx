import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MarketingLayout from "./(marketing)/layout";
import RentFlowMarketingPage from "./(marketing)/page";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/portal");
  }

  return (
    <MarketingLayout>
      <RentFlowMarketingPage />
    </MarketingLayout>
  );
}
