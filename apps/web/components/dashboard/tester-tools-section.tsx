"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Loader2,
  PlayCircle,
  XCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { DataRow } from "@/components/shared/data-row";
import type { ActionState } from "@/app/actions";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type PreviewRole = "owner" | "manager" | "tenant";
type FeatureTestId =
  | "platform_access"
  | "billing_payments"
  | "maintenance_vendors"
  | "documents_files"
  | "expenses_ownership"
  | "seed_data_presence";
type CheckpointStatus = "idle" | "running" | "pass" | "fail";

export interface TesterHealthRow {
  table: string;
  count: number | null;
  status: "ok" | "missing" | "error";
}

interface TesterToolsSectionProps {
  currentUserId: string;
  currentUserRole: string;
  userEmail: string;
  capabilities: FeatureCapabilitiesDTO;
  healthRows: TesterHealthRow[];
  testerProfiles: Array<{
    id: string;
    email: string;
    fullName: string | null;
    role: string;
  }>;
  onGenerateTestData: StatefulAction;
  onCleanupTestData: StatefulAction;
  onGrantTesterAccess: StatefulAction;
  onRevokeTesterAccess: StatefulAction;
}

interface CheckpointResult {
  id: string;
  label: string;
  status: CheckpointStatus;
  detail?: string;
}

interface CheckpointDefinition {
  id: string;
  label: string;
  previewPath: string;
  run: () => Promise<string>;
}

interface FeatureRunResult {
  status: "idle" | "running" | "pass" | "fail";
  checkpoints: CheckpointResult[];
  lastRunAt?: string;
}

interface FeatureTestDefinition {
  id: FeatureTestId;
  label: string;
  description: string;
}

const rolePreviewCopy: Record<PreviewRole, string[]> = {
  owner: [
    "Full operations controls across properties, leases, documents, vendors, and expenses.",
    "Financial dashboard includes rent performance, expenses, and net cashflow.",
    "All controls are read-only from this preview panel."
  ],
  manager: [
    "Assigned-property operations and maintenance workflows with vendor tools.",
    "No owner-only financial controls in standard manager mode.",
    "All controls are read-only from this preview panel."
  ],
  tenant: [
    "Rent charge list and payment entry points.",
    "Maintenance request creation and document signing flow.",
    "All controls are read-only from this preview panel."
  ]
};

const featureTests: FeatureTestDefinition[] = [
  {
    id: "platform_access",
    label: "Platform Access",
    description: "Checks core routes and branding visibility."
  },
  {
    id: "billing_payments",
    label: "Billing & Payments",
    description: "Checks rent charges data and payment screens."
  },
  {
    id: "maintenance_vendors",
    label: "Maintenance & Vendors",
    description: "Checks ticket and vendor system readiness."
  },
  {
    id: "documents_files",
    label: "Documents & Files",
    description: "Checks packet and property file systems."
  },
  {
    id: "expenses_ownership",
    label: "Expenses & Ownership",
    description: "Checks owner finance and ownership account readiness."
  },
  {
    id: "seed_data_presence",
    label: "Seed Data Presence",
    description: "Checks whether test fixture records are available."
  }
];

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
      {state.message ?? message}
    </p>
  );
}

function checkpointIcon(status: CheckpointStatus) {
  if (status === "pass") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (status === "fail") {
    return <XCircle className="h-4 w-4 text-red-600" />;
  }
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />;
  }
  return <Circle className="h-4 w-4 text-zinc-400" />;
}

function checkpointBadgeVariant(status: CheckpointStatus): "outline" | "success" | "destructive" {
  if (status === "pass") return "success";
  if (status === "fail") return "destructive";
  return "outline";
}

function runBadgeVariant(status: FeatureRunResult["status"]): "outline" | "success" | "destructive" {
  if (status === "pass") return "success";
  if (status === "fail") return "destructive";
  return "outline";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function TesterToolsSection({
  currentUserId,
  currentUserRole,
  userEmail,
  capabilities,
  healthRows,
  testerProfiles,
  onGenerateTestData,
  onCleanupTestData,
  onGrantTesterAccess,
  onRevokeTesterAccess
}: TesterToolsSectionProps) {
  const router = useRouter();
  const [generateState, generateAction] = useFormState(onGenerateTestData, null);
  const [cleanupState, cleanupAction] = useFormState(onCleanupTestData, null);
  const [grantState, grantAction] = useFormState(onGrantTesterAccess, null);
  const [revokeState, revokeAction] = useFormState(onRevokeTesterAccess, null);
  const [previewRole, setPreviewRole] = useState<PreviewRole>("owner");
  const [workspaceViewRole, setWorkspaceViewRole] = useState<PreviewRole>("owner");
  const [workspacePreviewPath, setWorkspacePreviewPath] = useState("/owner?testerPreview=true");
  const [activeTestTarget, setActiveTestTarget] = useState<string>("/tester");
  const [runningFeatureId, setRunningFeatureId] = useState<FeatureTestId | null>(null);
  const [featureRuns, setFeatureRuns] = useState<Record<FeatureTestId, FeatureRunResult>>(() =>
    featureTests.reduce((acc, item) => {
      acc[item.id] = { status: "idle", checkpoints: [] };
      return acc;
    }, {} as Record<FeatureTestId, FeatureRunResult>)
  );

  const lastGenerateMessage = useRef<string | null>(null);
  const lastCleanupMessage = useRef<string | null>(null);

  const workspacePathForRole = (role: PreviewRole) => `/${role}?testerPreview=true`;

  useEffect(() => {
    if (!generateState?.success) return;
    const marker = generateState.message ?? "success";
    if (lastGenerateMessage.current === marker) return;
    lastGenerateMessage.current = marker;
    router.refresh();
  }, [generateState, router]);

  useEffect(() => {
    if (!cleanupState?.success) return;
    const marker = cleanupState.message ?? "success";
    if (lastCleanupMessage.current === marker) return;
    lastCleanupMessage.current = marker;
    router.refresh();
  }, [cleanupState, router]);

  useEffect(() => {
    setWorkspacePreviewPath(workspacePathForRole(workspaceViewRole));
  }, [workspaceViewRole]);

  const healthLookup = useMemo(() => {
    const map = new Map<string, TesterHealthRow>();
    healthRows.forEach((row) => map.set(row.table, row));
    return map;
  }, [healthRows]);

  const readHealthStatus = (table: string) => {
    const row = healthLookup.get(table);
    if (!row) {
      throw new Error(`Table "${table}" is missing from diagnostics output.`);
    }
    if (row.status !== "ok") {
      throw new Error(`Table "${table}" status is "${row.status}".`);
    }
    return `${table}: ${row.count?.toLocaleString() ?? "0"} rows`;
  };

  const checkPageForText = async (path: string, text: string) => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${path} returned HTTP ${response.status}.`);
    }
    const body = await response.text();
    if (!body.toLowerCase().includes(text.toLowerCase())) {
      throw new Error(`${path} loaded, but did not include "${text}".`);
    }
    return `${path}: HTTP ${response.status}, found "${text}"`;
  };

  const checkStatus = async (path: string, allowed: number[], successLabel: string) => {
    const response = await fetch(path, { cache: "no-store" });
    if (!allowed.includes(response.status)) {
      throw new Error(`${path} returned HTTP ${response.status}, expected ${allowed.join("/")}.`);
    }
    return `${successLabel} (HTTP ${response.status})`;
  };

  const buildCheckpoints = (featureId: FeatureTestId): CheckpointDefinition[] => {
    if (featureId === "platform_access") {
      return [
        {
          id: "platform-home",
          label: "Marketing home page loads",
          previewPath: "/",
          run: () => checkPageForText("/", "Domus")
        },
        {
          id: "platform-login",
          label: "Login page shows Domus branding",
          previewPath: "/login",
          run: () => checkPageForText("/login", "Domus")
        },
        {
          id: "platform-tester",
          label: "Tester diagnostics page loads",
          previewPath: "/tester",
          run: () => checkPageForText("/tester", "Tester Diagnostics")
        },
        {
          id: "platform-manager-preview",
          label: "Manager preview route loads in tester mode",
          previewPath: "/manager?testerPreview=true",
          run: () => checkPageForText("/manager?testerPreview=true", "Operations Dashboard")
        },
        {
          id: "platform-tenant-preview",
          label: "Tenant preview route loads in tester mode",
          previewPath: "/tenant?testerPreview=true",
          run: () => checkPageForText("/tenant?testerPreview=true", "Tenant Workspace")
        }
      ];
    }

    if (featureId === "billing_payments") {
      return [
        {
          id: "billing-rent-charges",
          label: "Rent charges table is healthy",
          previewPath: "/owner?testerPreview=true",
          run: async () => readHealthStatus("rent_charges")
        },
        {
          id: "billing-owner-ui",
          label: "Owner workspace shows charges section",
          previewPath: "/owner?testerPreview=true",
          run: () => checkPageForText("/owner?testerPreview=true", "Upcoming / Late Charges")
        },
        {
          id: "billing-payment-success-route",
          label: "Payment success page responds",
          previewPath: "/payments/success",
          run: () => checkStatus("/payments/success", [200], "Payment success route is reachable")
        }
      ];
    }

    if (featureId === "maintenance_vendors") {
      return [
        {
          id: "maintenance-tickets-table",
          label: "Maintenance tickets table is healthy",
          previewPath: "/owner?testerPreview=true",
          run: async () => readHealthStatus("maintenance_tickets")
        },
        {
          id: "maintenance-vendors-table",
          label: "Vendors table is healthy",
          previewPath: "/owner?testerPreview=true",
          run: async () => readHealthStatus("vendors")
        },
        {
          id: "maintenance-owner-ui",
          label: "Owner workspace shows maintenance section",
          previewPath: "/owner?testerPreview=true",
          run: () => checkPageForText("/owner?testerPreview=true", "Maintenance")
        }
      ];
    }

    if (featureId === "documents_files") {
      return [
        {
          id: "documents-capability",
          label: "Documents capability is enabled",
          previewPath: "/owner?testerPreview=true",
          run: async () => {
            if (!capabilities.documentsEnabled) {
              throw new Error("documentsEnabled is false.");
            }
            return "documentsEnabled is true";
          }
        },
        {
          id: "documents-packets-table",
          label: "Document packets table is healthy",
          previewPath: "/owner?testerPreview=true",
          run: async () => readHealthStatus("document_packets")
        },
        {
          id: "documents-files-table",
          label: "Property files table is healthy",
          previewPath: "/owner?testerPreview=true",
          run: async () => readHealthStatus("property_files")
        },
        {
          id: "documents-files-endpoint",
          label: "Property-file asset endpoint is protected",
          previewPath: "/api/assets/property-file/test-id",
          run: () =>
            checkStatus(
              "/api/assets/property-file/test-id",
              [401, 403, 404],
              "Property-file endpoint is guarded"
            )
        }
      ];
    }

    if (featureId === "expenses_ownership") {
      return [
        {
          id: "expenses-table",
          label: "Property expenses table is healthy",
          previewPath: "/owner?testerPreview=true",
          run: async () => readHealthStatus("property_expenses")
        },
        {
          id: "ownership-capability",
          label: "Ownership capability is enabled",
          previewPath: "/owner?testerPreview=true",
          run: async () => {
            if (!capabilities.ownershipEnabled) {
              throw new Error("ownershipEnabled is false.");
            }
            return "ownershipEnabled is true";
          }
        },
        {
          id: "expenses-owner-ui",
          label: "Owner workspace shows expenses section",
          previewPath: "/owner?testerPreview=true",
          run: () => checkPageForText("/owner?testerPreview=true", "Expenses")
        }
      ];
    }

    return [
      {
        id: "seed-properties",
        label: "Properties exist",
        previewPath: "/owner?testerPreview=true",
        run: async () => readHealthStatus("properties")
      },
      {
        id: "seed-units",
        label: "Units exist",
        previewPath: "/owner?testerPreview=true",
        run: async () => readHealthStatus("units")
      },
      {
        id: "seed-leases",
        label: "Leases exist",
        previewPath: "/owner?testerPreview=true",
        run: async () => readHealthStatus("leases")
      },
      {
        id: "seed-rent-charges",
        label: "Rent charges exist",
        previewPath: "/owner?testerPreview=true",
        run: async () => readHealthStatus("rent_charges")
      }
    ];
  };

  const runFeatureTest = async (featureId: FeatureTestId) => {
    if (runningFeatureId) {
      return;
    }

    const checkpointDefs = buildCheckpoints(featureId);
    const initialCheckpoints: CheckpointResult[] = checkpointDefs.map((checkpoint) => ({
      id: checkpoint.id,
      label: checkpoint.label,
      status: "idle"
    }));

    setRunningFeatureId(featureId);
    setActiveTestTarget("/tester");
    setFeatureRuns((prev) => ({
      ...prev,
      [featureId]: {
        status: "running",
        checkpoints: initialCheckpoints,
        lastRunAt: new Date().toLocaleTimeString()
      }
    }));

    let hasFailure = false;

    for (let index = 0; index < checkpointDefs.length; index += 1) {
      const checkpoint = checkpointDefs[index];
      setActiveTestTarget(checkpoint.previewPath);
      if (!checkpoint.previewPath.startsWith("/api/")) {
        setWorkspacePreviewPath(checkpoint.previewPath);
      }
      if (checkpoint.previewPath.startsWith("/owner")) {
        setWorkspaceViewRole("owner");
      }
      if (checkpoint.previewPath.startsWith("/manager")) {
        setWorkspaceViewRole("manager");
      }
      if (checkpoint.previewPath.startsWith("/tenant")) {
        setWorkspaceViewRole("tenant");
      }
      setFeatureRuns((prev) => {
        const next = [...prev[featureId].checkpoints];
        next[index] = { ...next[index], status: "running", detail: "Running..." };
        return {
          ...prev,
          [featureId]: { ...prev[featureId], status: "running", checkpoints: next }
        };
      });

      await delay(150);

      try {
        const detail = await checkpoint.run();
        setFeatureRuns((prev) => {
          const next = [...prev[featureId].checkpoints];
          next[index] = { ...next[index], status: "pass", detail };
          return {
            ...prev,
            [featureId]: { ...prev[featureId], status: "running", checkpoints: next }
          };
        });
      } catch (error) {
        hasFailure = true;
        const detail =
          error instanceof Error ? error.message : "Unknown checkpoint error.";
        setFeatureRuns((prev) => {
          const next = [...prev[featureId].checkpoints];
          next[index] = { ...next[index], status: "fail", detail };
          return {
            ...prev,
            [featureId]: { ...prev[featureId], status: "fail", checkpoints: next }
          };
        });
        break;
      }
    }

    setFeatureRuns((prev) => ({
      ...prev,
      [featureId]: {
        ...prev[featureId],
        status: hasFailure ? "fail" : "pass",
        lastRunAt: new Date().toLocaleTimeString()
      }
    }));
    if (checkpointDefs.length > 0) {
      setActiveTestTarget(checkpointDefs[checkpointDefs.length - 1].previewPath);
    }
    setRunningFeatureId(null);
  };

  return (
    <div className="space-y-6">
      {currentUserRole !== "owner" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You can run tests, but only owner accounts can grant or revoke tester access.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tester Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-600">
            Logged in as <span className="font-medium text-zinc-900">{userEmail}</span>
          </p>
          <p className="text-sm text-zinc-600">
            Use this page to validate runtime health and generate safe test fixtures.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={capabilities.documentsEnabled ? "success" : "outline"}>
              Documents: {capabilities.documentsEnabled ? "ready" : "not ready"}
            </Badge>
            <Badge variant={capabilities.notificationsEnabled ? "success" : "outline"}>
              Notifications: {capabilities.notificationsEnabled ? "ready" : "not ready"}
            </Badge>
            <Badge variant={capabilities.vendorWorkflowEnabled ? "success" : "outline"}>
              Vendors: {capabilities.vendorWorkflowEnabled ? "ready" : "not ready"}
            </Badge>
            <Badge variant={capabilities.ownershipEnabled ? "success" : "outline"}>
              Ownership: {capabilities.ownershipEnabled ? "ready" : "not ready"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          {healthRows.map((row, index) => (
            <DataRow key={row.table} last={index === healthRows.length - 1}>
              <div>
                <p className="text-sm font-semibold text-zinc-900">{row.table}</p>
                <p className="text-xs text-zinc-500">
                  {row.count == null ? "Unavailable" : `${row.count.toLocaleString()} rows`}
                </p>
              </div>
              <Badge variant={row.status === "ok" ? "success" : row.status === "missing" ? "outline" : "destructive"}>
                {row.status}
              </Badge>
            </DataRow>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Test Data Generator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-600">
              Creates one synthetic property, unit, tenant profile, lease, and charges.
            </p>
            <form action={generateAction} className="space-y-2">
              <FormError state={generateState} />
              <FormSuccess state={generateState} message="Test data generated." />
              <SubmitButton
                className="w-full"
                title="Creates one full test fixture so you can run through owner, manager, and tenant features."
              >
                Generate Test Data
              </SubmitButton>
            </form>
            <form action={cleanupAction} className="space-y-2">
              <FormError state={cleanupState} />
              <FormSuccess state={cleanupState} message="Tester data archived." />
              <SubmitButton
                className="w-full"
                variant="outline"
                title="Archives all generated tester records for a clean test reset."
              >
                Clean Up Test Data
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace Switcher</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-600">
              Stay in tester mode and switch the live preview between owner, manager, and tenant workspaces.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                size="sm"
                variant={workspaceViewRole === "owner" ? "default" : "outline"}
                onClick={() => {
                  setWorkspaceViewRole("owner");
                  setWorkspacePreviewPath("/owner?testerPreview=true");
                  setActiveTestTarget("/owner?testerPreview=true");
                }}
                title="Show owner workspace preview while staying on tester page."
              >
                Owner
              </Button>
              <Button
                type="button"
                size="sm"
                variant={workspaceViewRole === "manager" ? "default" : "outline"}
                onClick={() => {
                  setWorkspaceViewRole("manager");
                  setWorkspacePreviewPath("/manager?testerPreview=true");
                  setActiveTestTarget("/manager?testerPreview=true");
                }}
                title="Show manager workspace preview while staying on tester page."
              >
                Manager
              </Button>
              <Button
                type="button"
                size="sm"
                variant={workspaceViewRole === "tenant" ? "default" : "outline"}
                onClick={() => {
                  setWorkspaceViewRole("tenant");
                  setWorkspacePreviewPath("/tenant?testerPreview=true");
                  setActiveTestTarget("/tenant?testerPreview=true");
                }}
                title="Show tenant workspace preview while staying on tester page."
              >
                Tenant
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              Current preview target: <span className="font-semibold text-zinc-700">{activeTestTarget}</span>
            </p>
            <div className="h-[360px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
              <iframe
                key={workspacePreviewPath}
                src={workspacePreviewPath}
                className="h-full w-full bg-white"
                title="Live workspace preview"
              />
            </div>
            <a
              href={workspacePreviewPath}
              className="inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              title="Open current preview in a full page tab."
            >
              Open current preview full page
            </a>
            <Select
              value={previewRole}
              onChange={(event) => setPreviewRole(event.target.value as PreviewRole)}
              title="Select which role summary to preview."
            >
              <option value="owner">Owner summary</option>
              <option value="manager">Manager summary</option>
              <option value="tenant">Tenant summary</option>
            </Select>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Read-only preview checklist
            </p>
            <ul className="space-y-2 text-sm text-zinc-700">
              {rolePreviewCopy[previewRole].map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tester Access Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">
            Tester mode is restricted. Only users explicitly marked as tester can open this page.
          </p>
          <form action={grantAction} className="space-y-2">
            <FormError state={grantState} />
            <FormSuccess state={grantState} message="Tester access updated." />
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Grant tester access by email
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                name="email"
                required
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="teammate@example.com"
                title="Enter an existing user email to grant tester mode."
                disabled={currentUserRole !== "owner"}
              />
              <SubmitButton
                className="sm:w-auto"
                title="Grant tester diagnostics access to this user."
                disabled={currentUserRole !== "owner"}
              >
                Grant Access
              </SubmitButton>
            </div>
          </form>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Current tester accounts
            </p>
            {testerProfiles.length === 0 ? (
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                No tester accounts are currently enabled.
              </p>
            ) : (
              <div className="space-y-2">
                {testerProfiles.map((profile) => {
                  const isCurrentUser = profile.id === currentUserId;
                  return (
                    <div
                      key={profile.id}
                      className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {profile.fullName ?? "Unnamed user"}{" "}
                          {isCurrentUser ? "(you)" : ""}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {profile.email} • {profile.role}
                        </p>
                      </div>
                      <form action={revokeAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <SubmitButton
                          variant="outline"
                          size="sm"
                          disabled={currentUserRole !== "owner" || isCurrentUser}
                          title={
                            isCurrentUser
                              ? "You cannot revoke your own tester access from this page."
                              : "Remove tester diagnostics access for this account."
                          }
                          className="w-full sm:w-auto"
                        >
                          Revoke Access
                        </SubmitButton>
                      </form>
                    </div>
                  );
                })}
                <FormError state={revokeState} />
                <FormSuccess state={revokeState} message="Tester access updated." />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature Test Runner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">
            Run one feature test at a time and watch each checkpoint move through pass/fail in real time.
          </p>

          <div className="space-y-3">
            {featureTests.map((feature) => {
              const run = featureRuns[feature.id];
              const isRunning = runningFeatureId === feature.id;

              return (
                <div key={feature.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{feature.label}</p>
                      <p className="text-xs text-zinc-500">{feature.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={runBadgeVariant(run.status)}>
                        {run.status === "idle" ? "not run" : run.status}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => runFeatureTest(feature.id)}
                        disabled={Boolean(runningFeatureId)}
                        title={`Run ${feature.label} checkpoints now and display pass/fail evidence.`}
                      >
                        {isRunning ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Running
                          </>
                        ) : (
                          <>
                            <PlayCircle className="mr-2 h-4 w-4" />
                            Test this feature
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {run.lastRunAt && (
                    <p className="mt-2 text-[11px] text-zinc-500">Last run: {run.lastRunAt}</p>
                  )}

                  {run.checkpoints.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
                      {run.checkpoints.map((checkpoint) => (
                        <div
                          key={checkpoint.id}
                          className="flex flex-col gap-1 rounded-md bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5">{checkpointIcon(checkpoint.status)}</span>
                            <div>
                              <p className="text-sm font-medium text-zinc-900">{checkpoint.label}</p>
                              {checkpoint.detail && (
                                <p className="text-xs text-zinc-500">{checkpoint.detail}</p>
                              )}
                            </div>
                          </div>
                          <Badge variant={checkpointBadgeVariant(checkpoint.status)}>
                            {checkpoint.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
