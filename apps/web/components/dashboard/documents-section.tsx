"use client";

import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { FeatureWarning } from "@/components/shared/feature-warning";
import type { ActionState } from "@/app/actions";
import type { DocumentTemplateDTO, DocumentPacketDTO, PropertyFileDTO } from "@/lib/documents";
import type { LeaseListItem } from "@/lib/portfolio";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import { formatDate } from "@/lib/format";

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

type DocumentsFlow = "template" | "packet" | "file";

interface TemplateDraft {
  name: string;
  category: string;
  ownerAccountId: string;
  bodyMarkdown: string;
}

interface PacketDraft {
  templateId: string;
  leaseId: string;
}

interface FileDraft {
  propertyId: string;
  category: string;
  visibility: "owner_manager" | "all";
  description: string;
}

const TEMPLATE_STEPS = [
  "Template Name",
  "Category",
  "Ownership",
  "Template Body",
  "Review & Save"
] as const;
const PACKET_STEPS = ["Select Template", "Select Lease", "Review & Save"] as const;
const FILE_STEPS = ["Select Property", "Category", "Visibility", "Description", "Upload"] as const;

function StepPill({
  label,
  active,
  done,
  skipped
}: {
  label: string;
  active: boolean;
  done: boolean;
  skipped: boolean;
}) {
  const className = active
    ? "border-violet-300 bg-violet-50 text-violet-700"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : skipped
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-500";

  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

function onEnterNext(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  canAdvance: boolean,
  advance: () => void
) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!canAdvance) return;
  advance();
}

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
  const [activeFlow, setActiveFlow] = useState<DocumentsFlow>("template");
  const [templateStep, setTemplateStep] = useState(0);
  const [packetStep, setPacketStep] = useState(0);
  const [fileStep, setFileStep] = useState(0);
  const [skippedTemplateSteps, setSkippedTemplateSteps] = useState<number[]>([]);
  const [skippedPacketSteps, setSkippedPacketSteps] = useState<number[]>([]);
  const [skippedFileSteps, setSkippedFileSteps] = useState<number[]>([]);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>({
    name: "",
    category: "",
    ownerAccountId: "",
    bodyMarkdown: ""
  });
  const [packetDraft, setPacketDraft] = useState<PacketDraft>({
    templateId: "",
    leaseId: ""
  });
  const [fileDraft, setFileDraft] = useState<FileDraft>({
    propertyId: "",
    category: "",
    visibility: "owner_manager",
    description: ""
  });

  const templateRequiredComplete = Boolean(
    templateDraft.name && templateDraft.category && templateDraft.bodyMarkdown
  );
  const packetRequiredComplete = Boolean(packetDraft.templateId && packetDraft.leaseId);
  const fileMetadataComplete = Boolean(fileDraft.propertyId && fileDraft.category && fileDraft.visibility);

  const templateStepComplete = (step: number) => {
    if (step === 0) return Boolean(templateDraft.name);
    if (step === 1) return Boolean(templateDraft.category);
    if (step === 2) return true;
    if (step === 3) return Boolean(templateDraft.bodyMarkdown);
    return templateRequiredComplete;
  };

  const packetStepComplete = (step: number) => {
    if (step === 0) return Boolean(packetDraft.templateId);
    if (step === 1) return Boolean(packetDraft.leaseId);
    return packetRequiredComplete;
  };

  const fileStepComplete = (step: number) => {
    if (step === 0) return Boolean(fileDraft.propertyId);
    if (step === 1) return Boolean(fileDraft.category);
    if (step === 2) return Boolean(fileDraft.visibility);
    if (step === 3) return true;
    return fileMetadataComplete;
  };

  useEffect(() => {
    if (!templateState?.success) return;
    setTemplateDraft({
      name: "",
      category: "",
      ownerAccountId: "",
      bodyMarkdown: ""
    });
    setTemplateStep(0);
    setSkippedTemplateSteps([]);
  }, [templateState]);

  useEffect(() => {
    if (!packetState?.success) return;
    setPacketDraft({
      templateId: "",
      leaseId: ""
    });
    setPacketStep(0);
    setSkippedPacketSteps([]);
  }, [packetState]);

  useEffect(() => {
    if (!uploadState?.success) return;
    setFileDraft({
      propertyId: "",
      category: "",
      visibility: "owner_manager",
      description: ""
    });
    setFileStep(0);
    setSkippedFileSteps([]);
  }, [uploadState]);

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
      <Card>
        <CardHeader>
          <CardTitle>Document Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">
            One step at a time. Press Enter or Next to continue. Skip is available when it makes sense.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={activeFlow === "template" ? "default" : "outline"}
              onClick={() => setActiveFlow("template")}
              title="Create or update reusable document templates."
            >
              Template Flow
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeFlow === "packet" ? "default" : "outline"}
              onClick={() => setActiveFlow("packet")}
              title="Create lease document packets from templates."
            >
              Packet Flow
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeFlow === "file" ? "default" : "outline"}
              onClick={() => setActiveFlow("file")}
              title="Upload property files with visibility controls."
            >
              File Flow
            </Button>
          </div>

          {activeFlow === "template" && (
            <div className="space-y-4">
              <FormError state={templateState} />
              <FormSuccess state={templateState} message="Template saved." />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {TEMPLATE_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={templateStep === index}
                    done={templateStepComplete(index)}
                    skipped={skippedTemplateSteps.includes(index)}
                  />
                ))}
              </div>
              {templateStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 1: Enter a template name.</p>
                  <Input
                    value={templateDraft.name}
                    onChange={(event) =>
                      setTemplateDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    onKeyDown={(event) =>
                      onEnterNext(event, templateStepComplete(templateStep), () => setTemplateStep(1))
                    }
                    placeholder="Template name"
                    required
                  />
                </div>
              )}
              {templateStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 2: Enter template category (Lease, Notice, Addendum).</p>
                  <Input
                    value={templateDraft.category}
                    onChange={(event) =>
                      setTemplateDraft((current) => ({ ...current, category: event.target.value }))
                    }
                    onKeyDown={(event) =>
                      onEnterNext(event, templateStepComplete(templateStep), () => setTemplateStep(2))
                    }
                    placeholder="Category"
                    required
                  />
                </div>
              )}
              {templateStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 3: Choose ownership account (optional).</p>
                  <Select
                    value={templateDraft.ownerAccountId}
                    onChange={(event) =>
                      setTemplateDraft((current) => ({ ...current, ownerAccountId: event.target.value }))
                    }
                  >
                    <option value="">Default ownership account</option>
                    {ownershipAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.displayName}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {templateStep === 3 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 4: Write the template body text.</p>
                  <Textarea
                    value={templateDraft.bodyMarkdown}
                    onChange={(event) =>
                      setTemplateDraft((current) => ({ ...current, bodyMarkdown: event.target.value }))
                    }
                    rows={6}
                    placeholder="Template body (markdown/text)"
                    required
                  />
                </div>
              )}
              {templateStep === 4 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Final step: review and save template.</p>
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                    <p><span className="font-semibold">Name:</span> {templateDraft.name || "Not set"}</p>
                    <p><span className="font-semibold">Category:</span> {templateDraft.category || "Not set"}</p>
                    <p><span className="font-semibold">Owner Account:</span> {ownershipAccounts.find((account) => account.id === templateDraft.ownerAccountId)?.displayName ?? "Default ownership account"}</p>
                  </div>
                  <form className="space-y-2" action={templateAction}>
                    <input type="hidden" name="name" value={templateDraft.name} />
                    <input type="hidden" name="category" value={templateDraft.category} />
                    <input type="hidden" name="ownerAccountId" value={templateDraft.ownerAccountId} />
                    <input type="hidden" name="bodyMarkdown" value={templateDraft.bodyMarkdown} />
                    <SubmitButton className="w-full" disabled={!templateRequiredComplete} title="Save this template.">
                      Save Template
                    </SubmitButton>
                  </form>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTemplateStep((current) => Math.max(current - 1, 0))}
                  disabled={templateStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => setTemplateStep((current) => Math.min(current + 1, TEMPLATE_STEPS.length - 1))}
                  disabled={templateStep >= TEMPLATE_STEPS.length - 1 || !templateStepComplete(templateStep)}
                  title="Complete this step and move to the next step."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSkippedTemplateSteps((previous) =>
                      previous.includes(templateStep) ? previous : [...previous, templateStep]
                    );
                    setTemplateStep((current) => Math.min(current + 1, TEMPLATE_STEPS.length - 1));
                  }}
                  disabled={templateStep >= TEMPLATE_STEPS.length - 1}
                  title="Skip this step for now and continue."
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          {activeFlow === "packet" && (
            <div className="space-y-4">
              <FormError state={packetState} />
              <FormSuccess state={packetState} message="Packet created as draft." />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PACKET_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={packetStep === index}
                    done={packetStepComplete(index)}
                    skipped={skippedPacketSteps.includes(index)}
                  />
                ))}
              </div>
              {packetStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 1: Select source template.</p>
                  <Select
                    value={packetDraft.templateId}
                    onChange={(event) =>
                      setPacketDraft((current) => ({ ...current, templateId: event.target.value }))
                    }
                  >
                    <option value="">Select template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.category})
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {packetStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 2: Select lease to attach this packet.</p>
                  <Select
                    value={packetDraft.leaseId}
                    onChange={(event) =>
                      setPacketDraft((current) => ({ ...current, leaseId: event.target.value }))
                    }
                  >
                    <option value="">Select lease</option>
                    {leases.map((lease) => (
                      <option key={lease.id} value={lease.id}>
                        {lease.unitLabel} • {lease.tenantEmail}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {packetStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Final step: review and create draft packet.</p>
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                    <p><span className="font-semibold">Template:</span> {templates.find((template) => template.id === packetDraft.templateId)?.name ?? "Not set"}</p>
                    <p><span className="font-semibold">Lease:</span> {leases.find((lease) => lease.id === packetDraft.leaseId)?.unitLabel ?? "Not set"}</p>
                  </div>
                  <form className="space-y-2" action={packetAction}>
                    <input type="hidden" name="templateId" value={packetDraft.templateId} />
                    <input type="hidden" name="leaseId" value={packetDraft.leaseId} />
                    <SubmitButton className="w-full" disabled={!packetRequiredComplete} title="Create draft packet.">
                      Create Draft Packet
                    </SubmitButton>
                  </form>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPacketStep((current) => Math.max(current - 1, 0))}
                  disabled={packetStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => setPacketStep((current) => Math.min(current + 1, PACKET_STEPS.length - 1))}
                  disabled={packetStep >= PACKET_STEPS.length - 1 || !packetStepComplete(packetStep)}
                  title="Complete this step and move to the next step."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSkippedPacketSteps((previous) =>
                      previous.includes(packetStep) ? previous : [...previous, packetStep]
                    );
                    setPacketStep((current) => Math.min(current + 1, PACKET_STEPS.length - 1));
                  }}
                  disabled={packetStep >= PACKET_STEPS.length - 1}
                  title="Skip this step for now and continue."
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          {activeFlow === "file" && (
            <div className="space-y-4">
              <FormError state={uploadState} />
              <FormSuccess state={uploadState} message="File uploaded." />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {FILE_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={fileStep === index}
                    done={fileStepComplete(index)}
                    skipped={skippedFileSteps.includes(index)}
                  />
                ))}
              </div>
              {fileStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 1: Select property for the file.</p>
                  <Select
                    value={fileDraft.propertyId}
                    onChange={(event) =>
                      setFileDraft((current) => ({ ...current, propertyId: event.target.value }))
                    }
                  >
                    <option value="">Select property</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {fileStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 2: Select file category.</p>
                  <Select
                    value={fileDraft.category}
                    onChange={(event) =>
                      setFileDraft((current) => ({ ...current, category: event.target.value }))
                    }
                  >
                    <option value="">Select category</option>
                    <option value="lease_agreement">Lease Agreement</option>
                    <option value="inspection">Inspection</option>
                    <option value="insurance">Insurance</option>
                    <option value="tax">Tax</option>
                    <option value="receipt">Receipt</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
              )}
              {fileStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 3: Choose visibility level.</p>
                  <Select
                    value={fileDraft.visibility}
                    onChange={(event) =>
                      setFileDraft((current) => ({
                        ...current,
                        visibility: event.target.value as "owner_manager" | "all"
                      }))
                    }
                  >
                    <option value="owner_manager">Owner + Manager only</option>
                    <option value="all">Visible to tenant</option>
                  </Select>
                </div>
              )}
              {fileStep === 3 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 4: Add description (optional).</p>
                  <Input
                    value={fileDraft.description}
                    onChange={(event) =>
                      setFileDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Description (optional)"
                  />
                </div>
              )}
              {fileStep === 4 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Final step: choose file and upload.</p>
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                    <p><span className="font-semibold">Property:</span> {properties.find((property) => property.id === fileDraft.propertyId)?.name ?? "Not set"}</p>
                    <p><span className="font-semibold">Category:</span> {fileDraft.category || "Not set"}</p>
                    <p><span className="font-semibold">Visibility:</span> {fileDraft.visibility === "all" ? "Tenant visible" : "Owner/Manager only"}</p>
                  </div>
                  {propertyFilesEnabled ? (
                    <form className="space-y-2" action={uploadAction}>
                      <input type="hidden" name="propertyId" value={fileDraft.propertyId} />
                      <input type="hidden" name="category" value={fileDraft.category} />
                      <input type="hidden" name="visibility" value={fileDraft.visibility} />
                      <input type="hidden" name="description" value={fileDraft.description} />
                      <Input name="file" type="file" required />
                      <SubmitButton className="w-full" disabled={!fileMetadataComplete} title="Upload file to property vault.">
                        Upload File
                      </SubmitButton>
                    </form>
                  ) : (
                    <EmptyState message="Property file vault is not enabled yet." />
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFileStep((current) => Math.max(current - 1, 0))}
                  disabled={fileStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => setFileStep((current) => Math.min(current + 1, FILE_STEPS.length - 1))}
                  disabled={fileStep >= FILE_STEPS.length - 1 || !fileStepComplete(fileStep)}
                  title="Complete this step and move to the next step."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSkippedFileSteps((previous) =>
                      previous.includes(fileStep) ? previous : [...previous, fileStep]
                    );
                    setFileStep((current) => Math.min(current + 1, FILE_STEPS.length - 1));
                  }}
                  disabled={fileStep >= FILE_STEPS.length - 1}
                  title="Skip this step for now and continue."
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <EmptyState message="No templates yet. Create your first template to speed up lease paperwork." />
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
            <EmptyState message="No document packets yet. Create a packet from a template to start e-sign workflow." />
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

      <Card>
        <CardHeader>
          <CardTitle>Property File Vault</CardTitle>
        </CardHeader>
        <CardContent>
          {!propertyFilesEnabled ? (
            <EmptyState message="Property file vault is unavailable. Complete setup to upload and share files." />
          ) : propertyFiles.length === 0 ? (
            <EmptyState message="No files uploaded yet. Add lease docs, inspections, and receipts here." />
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
        <SubmitButton
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.preventDefault();
            setConfirmOpen(true);
          }}
          title="Delete this template."
        >
          Delete
        </SubmitButton>
        {state && !state.success && <p className="mt-1 text-xs text-red-500">{state.error}</p>}
        {state && state.success && <p className="mt-1 text-xs text-emerald-600">Template deleted.</p>}
      </form>
      <ConfirmDialog
        title="Delete Template?"
        description="Are you sure? This permanently removes this document template."
        confirmLabel="Delete Template"
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => formRef.current?.requestSubmit()}
      />
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
        <p className="mt-0.5 text-[11px] text-zinc-400">Created {formatDate(packet.createdAt)}</p>
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
          {state && state.success && (
            <p className="mt-1 text-xs text-emerald-600">
              {packet.status === "draft" ? "Packet sent." : "Packet resent."}
            </p>
          )}
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement | null>(null);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{file.fileName}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {file.propertyLabel} • {file.category.replaceAll("_", " ")} • {file.fileType}
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-400">Uploaded {formatDate(file.createdAt)}</p>
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
          {visibilityState && visibilityState.success && (
            <p className="mt-1 text-xs text-emerald-600">Visibility updated.</p>
          )}
        </form>

        <form action={deleteAction} ref={deleteFormRef}>
          <input type="hidden" name="fileId" value={file.id} />
          <SubmitButton
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.preventDefault();
              setConfirmDeleteOpen(true);
            }}
            title="Delete this file from the vault."
          >
            Delete
          </SubmitButton>
          {deleteState && !deleteState.success && (
            <p className="mt-1 text-xs text-red-500">{deleteState.error}</p>
          )}
          {deleteState && deleteState.success && (
            <p className="mt-1 text-xs text-emerald-600">File deleted.</p>
          )}
        </form>
      </div>
      <ConfirmDialog
        title="Delete File?"
        description="Are you sure? This permanently removes the file from the property vault."
        confirmLabel="Delete File"
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={() => deleteFormRef.current?.requestSubmit()}
      />
    </DataRow>
  );
}
