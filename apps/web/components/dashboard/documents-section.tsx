"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFormState } from "react-dom";
import { FileArchive, FileText } from "lucide-react";
import type { StatefulAction } from "@/app/actions";
import type { DocumentTemplateDTO, DocumentPacketDTO, PropertyFileDTO } from "@/lib/documents";
import type { LeaseListItem } from "@/lib/portfolio";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataRow } from "@/components/shared/data-row";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { SubmitButton } from "@/components/shared/submit-button";
import { AnimatedList } from "@/components/ui/animated-list";
import { EmptyState } from "./empty-state";
import { PacketManager } from "./documents/packet-manager";
import { SignerFlow } from "./documents/signer-flow";
import { TemplateBuilder } from "./documents/template-builder";

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

type DocumentsFlow = "template" | "packet" | "file" | null;

const unavailableAction: StatefulAction = async () => ({ success: false, error: "Action unavailable." });

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
  const [activeFlow, setActiveFlow] = useState<DocumentsFlow>("template");

  if (!isFeatureReady) {
    return (
      <div id="documents">
        <FeatureWarning
          title="Documents Unavailable"
          message={featureWarning ?? "Documents and e-sign are not ready yet. Apply the Phase 8 migration and reload."}
        />
      </div>
    );
  }

  return (
    <div id="documents" className="space-y-4">
      {featureWarning ? <FeatureWarning title="Documents Setup" message={featureWarning} /> : null}
      {assetAccessWarning ? <FeatureWarning title="File Access" message={assetAccessWarning} /> : null}
      {propertyFilesWarning ? <FeatureWarning title="Property File Vault" message={propertyFilesWarning} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={activeFlow === "template" ? "default" : "outline"} onClick={() => setActiveFlow("template")} title="Create or update reusable document templates.">Template Flow</Button>
        <Button type="button" size="sm" variant={activeFlow === "packet" ? "default" : "outline"} onClick={() => setActiveFlow("packet")} title="Create lease document packets from templates.">Packet Flow</Button>
        <Button type="button" size="sm" variant={activeFlow === "file" ? "default" : "outline"} onClick={() => setActiveFlow("file")} title="Upload property files with visibility controls.">File Flow</Button>
      </div>

      {activeFlow === "template" ? (
        <TemplateBuilder ownershipAccounts={ownershipAccounts} onSave={onCreateTemplate} onCancel={() => setActiveFlow(null)} />
      ) : null}
      {activeFlow === "packet" ? (
        <PacketManager templates={templates} leases={leases} onCreatePacket={onCreatePacket} onCancel={() => setActiveFlow(null)} />
      ) : null}
      {activeFlow === "file" ? (
        <SignerFlow properties={properties} propertyFilesEnabled={propertyFilesEnabled} onUploadPropertyFile={onUploadPropertyFile} onCancel={() => setActiveFlow(null)} />
      ) : null}

      <Card>
        <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
        <CardContent>
          {templates.length === 0 ? <EmptyState icon={FileText} title="No templates yet" description="No documents yet." /> : <AnimatedList>{templates.map((template, index) => <TemplateRow key={template.id} template={template} last={index === templates.length - 1} onDeleteTemplate={onDeleteTemplate} />)}</AnimatedList>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Document Packets</CardTitle></CardHeader>
        <CardContent>
          {packets.length === 0 ? <EmptyState icon={FileText} title="No document packets yet" description="No documents yet." /> : <AnimatedList>{packets.map((packet, index) => <PacketRow key={packet.id} packet={packet} last={index === packets.length - 1} onSendPacket={onSendPacket} assetAccessEnabled={assetAccessEnabled} />)}</AnimatedList>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Property File Vault</CardTitle></CardHeader>
        <CardContent>
          {!propertyFilesEnabled ? (
            <EmptyState icon={FileArchive} title="Property file vault unavailable" description="Property file vault is unavailable. Complete setup to upload and share files." />
          ) : propertyFiles.length === 0 ? (
            <EmptyState icon={FileArchive} title="No files uploaded yet" description="No documents yet." />
          ) : (
            <AnimatedList>
              {propertyFiles.map((file, index) => (
                <PropertyFileRow
                  key={file.id}
                  file={file}
                  last={index === propertyFiles.length - 1}
                  onDeletePropertyFile={onDeletePropertyFile ?? unavailableAction}
                  onUpdateFileVisibility={onUpdateFileVisibility ?? unavailableAction}
                />
              ))}
            </AnimatedList>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateRow({ template, last, onDeleteTemplate }: { template: DocumentTemplateDTO; last: boolean; onDeleteTemplate: StatefulAction }) {
  const [state, action] = useFormState(onDeleteTemplate, null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <DataRow last={last}>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{template.name}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{template.category}</p>
        <p className="mt-0.5 text-[11px] text-zinc-400">Created {formatDate(template.createdAt)}</p>
      </div>
      <form action={action} ref={formRef}>
        <input type="hidden" name="templateId" value={template.id} />
        <SubmitButton size="sm" variant="outline" onClick={(event) => { event.preventDefault(); setConfirmOpen(true); }} title="Delete this template.">Delete</SubmitButton>
        {state && !state.success ? <p className="mt-1 text-xs text-red-500">{state.error}</p> : null}
        {state && state.success ? <p className="mt-1 text-xs text-emerald-600">Template deleted.</p> : null}
      </form>
      <ConfirmDialog title="Delete Template?" description="Are you sure? This permanently removes this document template." confirmLabel="Delete Template" open={confirmOpen} onOpenChange={setConfirmOpen} onConfirm={() => formRef.current?.requestSubmit()} />
    </DataRow>
  );
}

function PacketRow({ packet, last, onSendPacket, assetAccessEnabled }: { packet: DocumentPacketDTO; last: boolean; onSendPacket: StatefulAction; assetAccessEnabled: boolean }) {
  const [state, action] = useFormState(onSendPacket, null);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{packet.templateName}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{packet.propertyLabel}</p>
        <p className="mt-0.5 text-[11px] text-zinc-400">Created {formatDate(packet.createdAt)}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant={packet.status === "signed" ? "success" : packet.status === "sent" ? "warning" : "outline"}>{packet.status.toUpperCase()}</Badge>
          {assetAccessEnabled ? <Link href={`/api/assets/document-packet/${packet.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50" title="Open this document packet file.">Open File</Link> : null}
          {packet.signers.map((signer) => <Badge key={`${packet.id}-${signer.email}`} variant={signer.status === "signed" ? "success" : "outline"}>{signer.role}: {signer.status}</Badge>)}
        </div>
      </div>
      {packet.status !== "signed" && packet.status !== "void" ? (
        <form action={action}>
          <input type="hidden" name="packetId" value={packet.id} />
          <SubmitButton size="sm" variant="outline" title={packet.status === "draft" ? "Send this packet to signers." : "Resend this packet to signers."}>{packet.status === "draft" ? "Send" : "Resend"}</SubmitButton>
          {state && !state.success ? <p className="mt-1 text-xs text-red-500">{state.error}</p> : null}
          {state && state.success ? <p className="mt-1 text-xs text-emerald-600">{packet.status === "draft" ? "Packet sent." : "Packet resent."}</p> : null}
        </form>
      ) : null}
    </DataRow>
  );
}

function PropertyFileRow({ file, last, onDeletePropertyFile, onUpdateFileVisibility }: { file: PropertyFileDTO; last: boolean; onDeletePropertyFile: StatefulAction; onUpdateFileVisibility: StatefulAction }) {
  const [visibilityState, visibilityAction] = useFormState(onUpdateFileVisibility, null);
  const [deleteState, deleteAction] = useFormState(onDeletePropertyFile, null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement | null>(null);
  const nextVisibility = file.visibility === "all" ? "owner_manager" : "all";

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{file.fileName}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{file.propertyLabel} • {file.category.replaceAll("_", " ")} • {file.fileType}</p>
        <p className="mt-0.5 text-[11px] text-zinc-400">Uploaded {formatDate(file.createdAt)}</p>
        {file.description ? <p className="mt-0.5 text-xs text-zinc-500">{file.description}</p> : null}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant={file.visibility === "all" ? "success" : "outline"}>{file.visibility === "all" ? "Tenant visible" : "Owner/Manager only"}</Badge>
          <Link href={`/api/assets/property-file/${file.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50" title="Open this property file.">Open File</Link>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <form action={visibilityAction}>
          <input type="hidden" name="fileId" value={file.id} />
          <input type="hidden" name="visibility" value={nextVisibility} />
          <SubmitButton size="sm" variant="outline" title={file.visibility === "all" ? "Hide this file from tenant view." : "Make this file visible to tenant view."}>{file.visibility === "all" ? "Hide from tenant" : "Show to tenant"}</SubmitButton>
          {visibilityState && !visibilityState.success ? <p className="mt-1 text-xs text-red-500">{visibilityState.error}</p> : null}
          {visibilityState && visibilityState.success ? <p className="mt-1 text-xs text-emerald-600">Visibility updated.</p> : null}
        </form>
        <form action={deleteAction} ref={deleteFormRef}>
          <input type="hidden" name="fileId" value={file.id} />
          <SubmitButton size="sm" variant="outline" onClick={(event) => { event.preventDefault(); setConfirmDeleteOpen(true); }} title="Delete this file from the vault.">Delete</SubmitButton>
          {deleteState && !deleteState.success ? <p className="mt-1 text-xs text-red-500">{deleteState.error}</p> : null}
          {deleteState && deleteState.success ? <p className="mt-1 text-xs text-emerald-600">File deleted.</p> : null}
        </form>
      </div>
      <ConfirmDialog title="Delete File?" description="Are you sure? This permanently removes the file from the property vault." confirmLabel="Delete File" open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen} onConfirm={() => deleteFormRef.current?.requestSubmit()} />
    </DataRow>
  );
}
