"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { FeatureWarning } from "@/components/shared/feature-warning";
import type { ActionState } from "@/app/actions";
import type { DocumentTemplateDTO, DocumentPacketDTO, PropertyFileDTO } from "@/lib/documents";
import type { LeaseListItem } from "@/lib/portfolio";
import type { OwnershipAccountDTO } from "@/lib/ownership";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface DocumentsSectionProps {
  properties: Array<{ id: string; name: string }>;
  templates: DocumentTemplateDTO[];
  packets: DocumentPacketDTO[];
  propertyFiles: PropertyFileDTO[];
  leases: LeaseListItem[];
  ownershipAccounts: OwnershipAccountDTO[];
  onCreateTemplate: StatefulAction;
  onDeleteTemplate: StatefulAction;
  onCreatePacket: StatefulAction;
  onSendPacket: StatefulAction;
  onUploadPropertyFile?: StatefulAction;
  onDeletePropertyFile?: StatefulAction;
  onUpdateFileVisibility?: StatefulAction;
  propertyFilesEnabled?: boolean;
  propertyFilesWarning?: string | null;
  isFeatureReady?: boolean;
  featureWarning?: string | null;
  assetAccessEnabled?: boolean;
  assetAccessWarning?: string | null;
}

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{state.error}</p>;
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">{message}</p>;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Action unavailable."
});

export function DocumentsSection({
  properties,
  templates,
  packets,
  propertyFiles,
  leases,
  ownershipAccounts,
  onCreateTemplate,
  onDeleteTemplate,
  onCreatePacket,
  onSendPacket,
  onUploadPropertyFile,
  onDeletePropertyFile,
  onUpdateFileVisibility,
  propertyFilesEnabled = true,
  propertyFilesWarning = null,
  isFeatureReady = true,
  featureWarning = null,
  assetAccessEnabled = true,
  assetAccessWarning = null
}: DocumentsSectionProps) {
  const [templateState, templateAction] = useFormState(onCreateTemplate, null);
  const [packetState, packetAction] = useFormState(onCreatePacket, null);
  const [uploadState, uploadAction] = useFormState(onUploadPropertyFile ?? unavailableAction, null);

  if (!isFeatureReady) {
    return (
      <div id="documents">
        <FeatureWarning
          title="Documents Unavailable"
          message={
            featureWarning ??
            "Documents and e-sign are not ready yet. Apply the Phase 8 migration and reload."
          }
        />
      </div>
    );
  }

  return (
    <div id="documents" className="space-y-4">
      {featureWarning && <FeatureWarning title="Documents Setup" message={featureWarning} />}
      {assetAccessWarning && <FeatureWarning title="File Access" message={assetAccessWarning} />}
      {propertyFilesWarning && <FeatureWarning title="Property File Vault" message={propertyFilesWarning} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Template</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" action={templateAction}>
              <FormError state={templateState} />
              <FormSuccess state={templateState} message="Template saved." />
              <Input name="name" placeholder="Template name" required />
              <Input name="category" placeholder="Category (Lease, Notice, Addendum)" required />
              <Select name="ownerAccountId">
                <option value="">Default ownership account</option>
                {ownershipAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName}
                  </option>
                ))}
              </Select>
              <Textarea name="bodyMarkdown" placeholder="Template body (markdown/text)" rows={6} required />
              <SubmitButton className="w-full">Save Template</SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Document Packet</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" action={packetAction}>
              <FormError state={packetState} />
              <FormSuccess state={packetState} message="Packet created as draft." />
              <Select name="templateId" required>
                <option value="">Select template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.category})
                  </option>
                ))}
              </Select>
              <Select name="leaseId" required>
                <option value="">Select lease</option>
                {leases.map((lease) => (
                  <option key={lease.id} value={lease.id}>
                    {lease.unitLabel} • {lease.tenantEmail}
                  </option>
                ))}
              </Select>
              <SubmitButton className="w-full">Create Draft Packet</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <EmptyState message="No templates yet." />
          ) : (
            <div>
              {templates.map((template, i) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  last={i === templates.length - 1}
                  onDeleteTemplate={onDeleteTemplate}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Document Packets</CardTitle>
        </CardHeader>
        <CardContent>
          {packets.length === 0 ? (
            <EmptyState message="No document packets yet." />
          ) : (
            <div>
              {packets.map((packet, i) => (
                <PacketRow
                  key={packet.id}
                  packet={packet}
                  last={i === packets.length - 1}
                  onSendPacket={onSendPacket}
                  assetAccessEnabled={assetAccessEnabled}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upload Property File</CardTitle>
          </CardHeader>
          <CardContent>
            {propertyFilesEnabled ? (
              <form className="space-y-3" action={uploadAction}>
                <FormError state={uploadState} />
                <FormSuccess state={uploadState} message="File uploaded." />
                <Select name="propertyId" required>
                  <option value="">Select property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
                <Select name="category" required>
                  <option value="">Select category</option>
                  <option value="lease_agreement">Lease Agreement</option>
                  <option value="inspection">Inspection</option>
                  <option value="insurance">Insurance</option>
                  <option value="tax">Tax</option>
                  <option value="receipt">Receipt</option>
                  <option value="other">Other</option>
                </Select>
                <Select name="visibility" defaultValue="owner_manager" required>
                  <option value="owner_manager">Owner + Manager only</option>
                  <option value="all">Visible to tenant</option>
                </Select>
                <Input name="description" placeholder="Description (optional)" />
                <Input name="file" type="file" required />
                <SubmitButton className="w-full">Upload File</SubmitButton>
              </form>
            ) : (
              <EmptyState message="Property file vault is not enabled yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Property File Vault</CardTitle>
          </CardHeader>
          <CardContent>
            {!propertyFilesEnabled ? (
              <EmptyState message="Property file vault is unavailable." />
            ) : propertyFiles.length === 0 ? (
              <EmptyState message="No uploaded files yet." />
            ) : (
              <div>
                {propertyFiles.map((file, i) => (
                  <PropertyFileRow
                    key={file.id}
                    file={file}
                    last={i === propertyFiles.length - 1}
                    onDeletePropertyFile={onDeletePropertyFile ?? unavailableAction}
                    onUpdateFileVisibility={onUpdateFileVisibility ?? unavailableAction}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TemplateRow({
  template,
  last,
  onDeleteTemplate
}: {
  template: DocumentTemplateDTO;
  last: boolean;
  onDeleteTemplate: StatefulAction;
}) {
  const [state, action] = useFormState(onDeleteTemplate, null);

  return (
    <DataRow last={last}>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{template.name}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{template.category}</p>
      </div>
      <form action={action}>
        <input type="hidden" name="templateId" value={template.id} />
        <SubmitButton size="sm" variant="outline" title="Delete this template.">
          Delete
        </SubmitButton>
        {state && !state.success && <p className="mt-1 text-xs text-red-500">{state.error}</p>}
      </form>
    </DataRow>
  );
}

function PacketRow({
  packet,
  last,
  onSendPacket,
  assetAccessEnabled
}: {
  packet: DocumentPacketDTO;
  last: boolean;
  onSendPacket: StatefulAction;
  assetAccessEnabled: boolean;
}) {
  const [state, action] = useFormState(onSendPacket, null);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{packet.templateName}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{packet.propertyLabel}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant={packet.status === "signed" ? "success" : packet.status === "sent" ? "warning" : "outline"}>
            {packet.status.toUpperCase()}
          </Badge>
          {assetAccessEnabled && (
            <Link
              href={`/api/assets/document-packet/${packet.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
              title="Open this document packet file."
            >
              Open File
            </Link>
          )}
          {packet.signers.map((signer) => (
            <Badge key={`${packet.id}-${signer.email}`} variant={signer.status === "signed" ? "success" : "outline"}>
              {signer.role}: {signer.status}
            </Badge>
          ))}
        </div>
      </div>
      {packet.status !== "signed" && packet.status !== "void" && (
        <form action={action}>
          <input type="hidden" name="packetId" value={packet.id} />
          <SubmitButton
            size="sm"
            variant="outline"
            title={packet.status === "draft" ? "Send this packet to signers." : "Resend this packet to signers."}
          >
            {packet.status === "draft" ? "Send" : "Resend"}
          </SubmitButton>
          {state && !state.success && <p className="mt-1 text-xs text-red-500">{state.error}</p>}
        </form>
      )}
    </DataRow>
  );
}

function PropertyFileRow({
  file,
  last,
  onDeletePropertyFile,
  onUpdateFileVisibility
}: {
  file: PropertyFileDTO;
  last: boolean;
  onDeletePropertyFile: StatefulAction;
  onUpdateFileVisibility: StatefulAction;
}) {
  const [visibilityState, visibilityAction] = useFormState(onUpdateFileVisibility, null);
  const [deleteState, deleteAction] = useFormState(onDeletePropertyFile, null);
  const nextVisibility = file.visibility === "all" ? "owner_manager" : "all";

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{file.fileName}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {file.propertyLabel} • {file.category.replaceAll("_", " ")} • {file.fileType}
        </p>
        {file.description && <p className="mt-0.5 text-xs text-zinc-500">{file.description}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant={file.visibility === "all" ? "success" : "outline"}>
            {file.visibility === "all" ? "Tenant visible" : "Owner/Manager only"}
          </Badge>
          <Link
            href={`/api/assets/property-file/${file.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
            title="Open this property file."
          >
            Open File
          </Link>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <form action={visibilityAction}>
          <input type="hidden" name="fileId" value={file.id} />
          <input type="hidden" name="visibility" value={nextVisibility} />
          <SubmitButton
            size="sm"
            variant="outline"
            title={
              file.visibility === "all"
                ? "Hide this file from tenant view."
                : "Make this file visible to tenant view."
            }
          >
            {file.visibility === "all" ? "Hide from tenant" : "Show to tenant"}
          </SubmitButton>
          {visibilityState && !visibilityState.success && (
            <p className="mt-1 text-xs text-red-500">{visibilityState.error}</p>
          )}
        </form>

        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!window.confirm("Delete this file from the vault?")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="fileId" value={file.id} />
          <SubmitButton size="sm" variant="outline" title="Delete this file from the vault.">
            Delete
          </SubmitButton>
          {deleteState && !deleteState.success && (
            <p className="mt-1 text-xs text-red-500">{deleteState.error}</p>
          )}
        </form>
      </div>
    </DataRow>
  );
}
