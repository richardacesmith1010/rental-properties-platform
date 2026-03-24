import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { updateFeedbackStatus } from "@/app/actions/feedback";
import { OpsDashboard, type OpsCronRun } from "@/components/ops/ops-dashboard";
import { getEnvSummary } from "@/lib/env";
import { FEEDBACK_OWNER_EMAIL, type FeedbackEntry } from "@/lib/feedback";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ops Status",
  description: "Operational readiness dashboard for Domus."
};

export default async function OpsPage({
  searchParams
}: {
  searchParams?: { section?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  if (!profile || profile.role !== "owner") {
    redirect("/login");
  }

  const envSummary = getEnvSummary();
  let initialCronRuns: OpsCronRun[] = [];
  let cronWarning: string | null = null;
  let initialFeedback: FeedbackEntry[] = [];
  let feedbackWarning: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cron_runs")
      .select("id, job_name, started_at, completed_at, status, operations, error")
      .order("started_at", { ascending: false })
      .limit(10);

    if (error) {
      if (isMissingSchemaError(error)) {
        cronWarning = "Cron history requires a database update.";
      } else {
        console.error("OpsPage cron history error:", error);
        cronWarning = "Unable to load cron history right now.";
      }
    } else {
      initialCronRuns = (data ?? []).map((run) => ({
        id: run.id,
        job_name: run.job_name,
        started_at: run.started_at,
        completed_at: run.completed_at,
        status: run.status,
        operations: Array.isArray(run.operations) ? run.operations : [],
        error: run.error ?? null
      }));
    }
  } catch (error) {
    console.error("OpsPage unexpected cron history error:", error);
    cronWarning = "Unable to load cron history right now.";
  }

  if (user.email?.toLowerCase() === FEEDBACK_OWNER_EMAIL) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("feedback")
        .select("id, type, message, email, profile_id, page_url, user_agent, viewport, user_role, status, created_at")
        .order("created_at", { ascending: false })
        .limit(250);

      if (error) {
        if (isMissingSchemaError(error)) {
          feedbackWarning = "Feedback requires a database update.";
        } else {
          console.error("OpsPage feedback load error:", error);
          feedbackWarning = "Unable to load feedback right now.";
        }
      } else {
        const profileIds = Array.from(
          new Set((data ?? []).map((item) => item.profile_id).filter((value): value is string => Boolean(value)))
        );
        const profileMap = new Map<string, { full_name: string | null; nickname: string | null }>();

        if (profileIds.length > 0) {
          const { data: profiles, error: profilesError } = await admin
            .from("profiles")
            .select("id, full_name, nickname")
            .in("id", profileIds);

          if (profilesError && !isMissingSchemaError(profilesError)) {
            console.error("OpsPage feedback profile lookup error:", profilesError);
          }

          for (const profile of profiles ?? []) {
            profileMap.set(profile.id, {
              full_name: profile.full_name ?? null,
              nickname: profile.nickname ?? null
            });
          }
        }

        initialFeedback = (data ?? []).map((item) => {
          const profile = item.profile_id ? profileMap.get(item.profile_id) : null;
          return {
            id: item.id,
            type: item.type,
            message: item.message,
            email: item.email ?? null,
            profileId: item.profile_id ?? null,
            pageUrl: item.page_url ?? null,
            userAgent: item.user_agent ?? null,
            viewport: item.viewport ?? null,
            userRole: item.user_role ?? null,
            status: item.status,
            createdAt: item.created_at,
            submitterName: profile?.nickname ?? profile?.full_name ?? null
          } satisfies FeedbackEntry;
        });
      }
    } catch (error) {
      console.error("OpsPage unexpected feedback load error:", error);
      feedbackWarning = "Unable to load feedback right now.";
    }
  } else {
    feedbackWarning = "Feedback is only visible to the primary owner account.";
  }

  return (
    <OpsDashboard
      envSummary={envSummary}
      initialCronRuns={initialCronRuns}
      initialCronWarning={cronWarning}
      initialFeedback={initialFeedback}
      initialFeedbackWarning={feedbackWarning}
      onUpdateFeedbackStatus={updateFeedbackStatus}
      initialTab={searchParams?.section === "feedback" ? "feedback" : "overview"}
    />
  );
}
