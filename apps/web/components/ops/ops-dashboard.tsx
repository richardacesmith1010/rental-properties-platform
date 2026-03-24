"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, ExternalLink, MessageCircleMore, RefreshCcw, XCircle } from "lucide-react";
import type { StatefulAction } from "@/app/actions";
import { FeedbackViewer } from "@/components/ops/feedback-viewer";
import { Alert } from "@/components/ui/alert";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import type { FeedbackEntry } from "@/lib/feedback";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import type { EnvSummary } from "@/lib/env";

interface ServiceHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

interface HealthData {
  ok: boolean;
  services: {
    supabase: ServiceHealth;
    stripe: ServiceHealth;
  };
  env: Record<string, boolean>;
  timestamp: string;
}

interface CronOperation {
  name: string;
  status: string;
  durationMs: number;
  error?: string;
}

export interface OpsCronRun {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  operations: CronOperation[];
  error: string | null;
}

interface OpsDashboardProps {
  envSummary: EnvSummary;
  initialCronRuns: OpsCronRun[];
  initialCronWarning?: string | null;
  initialFeedback: FeedbackEntry[];
  initialFeedbackWarning?: string | null;
  onUpdateFeedbackStatus: StatefulAction;
  initialTab?: "overview" | "feedback";
}

function statusVariant(status: string) {
  switch (status) {
    case "success":
      return "success" as const;
    case "running":
    case "partial_failure":
      return "warning" as const;
    case "failure":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function healthVariant(ok: boolean) {
  return ok ? ("success" as const) : ("destructive" as const);
}

export function OpsDashboard({
  envSummary,
  initialCronRuns,
  initialCronWarning,
  initialFeedback,
  initialFeedbackWarning,
  onUpdateFeedbackStatus,
  initialTab = "overview"
}: OpsDashboardProps) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "feedback">(initialTab);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = (await response.json()) as HealthData;
      setHealth(payload);
      if (!response.ok) {
        setError("One or more health checks are reporting a failure.");
      }
    } catch (caughtError) {
      console.error("OpsDashboard fetchHealth error:", caughtError);
      setError("Failed to fetch health status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  return (
    <main id="main-content" className="app-surface min-h-screen px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Ops Status</h1>
            <p className="text-sm text-zinc-600">
              Monitor service health, environment readiness, and scheduled job history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void fetchHealth()}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              title="Run the health checks again."
              disabled={loading}
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Run Health Check
            </button>
            <Link
              href="/owner"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              title="Return to the owner dashboard."
            >
              Back to Owner Dashboard
            </Link>
          </div>
        </header>

        {error ? <Alert variant="warning">{error}</Alert> : null}
        {initialCronWarning ? <Alert variant="warning">{initialCronWarning}</Alert> : null}

        <div className="rounded-2xl border border-border/70 bg-card px-4 py-2">
          <AnimatedTabs
            tabs={[
              { id: "overview", label: "Overview", icon: <Activity className="h-4 w-4" /> },
              {
                id: "feedback",
                label: `Feedback (${initialFeedback.length})`,
                icon: <MessageCircleMore className="h-4 w-4" />
              }
            ]}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as "overview" | "feedback")}
          />
        </div>

        {activeTab === "feedback" ? (
          <FeedbackViewer
            items={initialFeedback}
            warning={initialFeedbackWarning}
            onUpdateStatus={onUpdateFeedbackStatus}
          />
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>System Health</CardTitle>
                <p className="mt-1 text-sm text-zinc-500">
                  Live checks against Supabase and Stripe with per-service latency.
                </p>
              </div>
              <Badge variant={health ? healthVariant(health.ok) : "outline"}>
                {health ? (health.ok ? "Healthy" : "Degraded") : "Loading"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {health ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    {Object.entries(health.services).map(([name, service]) => (
                      <div key={name} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-semibold capitalize text-zinc-800">
                            {service.ok ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            {name}
                          </div>
                          <Badge variant={healthVariant(service.ok)}>
                            {service.ok ? "OK" : "Down"}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm text-zinc-600">Latency: {service.latencyMs} ms</p>
                        {service.error ? (
                          <p className="mt-2 text-xs text-red-600">{service.error}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500">
                    Last checked {formatRelativeTime(health.timestamp)} ({formatDateTime(health.timestamp)})
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-500">
                  Loading live health data...
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link
                href="https://supabase.com/dashboard/project/vawqdqkaguhdgfhdebqw"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 transition hover:bg-zinc-50"
                title="Open the Supabase project dashboard in a new tab."
              >
                Supabase Dashboard
                <ExternalLink className="h-4 w-4" />
              </Link>
              <Link
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 transition hover:bg-zinc-50"
                title="Open the Vercel dashboard in a new tab."
              >
                Vercel Dashboard
                <ExternalLink className="h-4 w-4" />
              </Link>
              <Link
                href="/api/health"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 transition hover:bg-zinc-50"
                title="Open the raw health endpoint in a new tab."
              >
                Raw Health Endpoint
                <ExternalLink className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
            </div>

            <Card>
          <CardHeader>
            <CardTitle>Environment Status</CardTitle>
            <p className="mt-1 text-sm text-zinc-500">
              Grouped readiness view for required runtime configuration.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {Object.entries(envSummary).map(([serviceName, group]) => (
                <div key={serviceName} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold capitalize text-zinc-800">{serviceName}</div>
                    <Badge variant={group.configured ? "success" : "destructive"}>
                      {group.configured ? "Configured" : "Missing"}
                    </Badge>
                  </div>
                  {serviceName === "stripe" && group.mode ? (
                    <p className="mt-2 text-xs uppercase tracking-wide text-zinc-500">Mode: {group.mode}</p>
                  ) : null}
                  <ul className="mt-3 space-y-2 text-xs text-zinc-600">
                    {Object.entries(group.vars).map(([name, configured]) => (
                      <li key={name} className="flex items-center justify-between gap-3">
                        <span className="truncate">{name}</span>
                        <Badge variant={configured ? "success" : "destructive"}>
                          {configured ? "Yes" : "No"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
            </Card>

            <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Cron Run History</CardTitle>
                <p className="mt-1 text-sm text-zinc-500">
                  Last 10 scheduled charge-generation runs with per-operation timing.
                </p>
              </div>
              <Badge variant="outline">{initialCronRuns.length} runs</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {initialCronRuns.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No cron runs recorded"
                description="Cron execution history will appear here after the first logged run."
              />
            ) : (
              <div className="space-y-3">
                {initialCronRuns.map((run) => (
                  <div key={run.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-zinc-800">{run.job_name}</p>
                          <Badge variant={statusVariant(run.status)}>{run.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">
                          Started {formatDateTime(run.started_at)} ({formatRelativeTime(run.started_at)})
                        </p>
                        {run.completed_at ? (
                          <p className="mt-1 text-xs text-zinc-500">
                            Completed {formatDateTime(run.completed_at)} ({formatRelativeTime(run.completed_at)})
                          </p>
                        ) : null}
                        {run.error ? <p className="mt-2 text-xs text-red-600">{run.error}</p> : null}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {run.operations.length} operation{run.operations.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <details className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <summary className="cursor-pointer list-none text-sm font-medium text-zinc-700">
                        View operation details
                      </summary>
                      <div className="mt-3 space-y-2">
                        {run.operations.length === 0 ? (
                          <p className="text-xs text-zinc-500">No operation details recorded.</p>
                        ) : (
                          run.operations.map((operation) => (
                            <div
                              key={`${run.id}-${operation.name}`}
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-medium text-zinc-800">{operation.name}</div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={statusVariant(operation.status)}>{operation.status}</Badge>
                                  <span className="text-xs text-zinc-500">{operation.durationMs} ms</span>
                                </div>
                              </div>
                              {operation.error ? (
                                <p className="mt-2 text-xs text-red-600">{operation.error}</p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
