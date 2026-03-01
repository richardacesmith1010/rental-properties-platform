"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { DataRow } from "@/components/shared/data-row";
import type { ActionState } from "@/app/actions";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export interface TesterHealthRow {
  table: string;
  count: number | null;
  status: "ok" | "missing" | "error";
}

interface TesterToolsSectionProps {
  userEmail: string;
  capabilities: FeatureCapabilitiesDTO;
  healthRows: TesterHealthRow[];
  onGenerateTestData: StatefulAction;
  onCleanupTestData: StatefulAction;
}

const rolePreviewCopy: Record<"owner" | "manager" | "tenant", string[]> = {
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
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      {message}
    </p>
  );
}

export function TesterToolsSection({
  userEmail,
  capabilities,
  healthRows,
  onGenerateTestData,
  onCleanupTestData
}: TesterToolsSectionProps) {
  const [generateState, generateAction] = useFormState(onGenerateTestData, null);
  const [cleanupState, cleanupAction] = useFormState(onCleanupTestData, null);
  const [previewRole, setPreviewRole] = useState<"owner" | "manager" | "tenant">("owner");

  return (
    <div className="space-y-6">
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
              <SubmitButton className="w-full">Generate Test Data</SubmitButton>
            </form>
            <form action={cleanupAction} className="space-y-2">
              <FormError state={cleanupState} />
              <FormSuccess state={cleanupState} message="Tester data archived." />
              <SubmitButton className="w-full" variant="outline">Clean Up Test Data</SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={previewRole}
              onChange={(event) => setPreviewRole(event.target.value as "owner" | "manager" | "tenant")}
            >
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="tenant">Tenant</option>
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
    </div>
  );
}
