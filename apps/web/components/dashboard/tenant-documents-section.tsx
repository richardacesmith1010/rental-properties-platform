"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { FeatureWarning } from "@/components/shared/feature-warning";
import type { ActionState } from "@/app/actions";
import type { TenantDocumentPacketDTO, TenantSharedFileDTO } from "@/lib/documents";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface TenantDocumentsSectionProps {
  packets: TenantDocumentPacketDTO[];
  files: TenantSharedFileDTO[];
  onSignPacket: StatefulAction;
  isFeatureReady?: boolean;
  featureWarning?: string | null;
  propertyFilesEnabled?: boolean;
  propertyFilesWarning?: string | null;
  assetAccessEnabled?: boolean;
  assetAccessWarning?: string | null;
}

export function TenantDocumentsSection({
  packets,
  files,
  onSignPacket,
  isFeatureReady = true,
  featureWarning = null,
  propertyFilesEnabled = true,
  propertyFilesWarning = null,
  assetAccessEnabled = true,
  assetAccessWarning = null
}: TenantDocumentsSectionProps) {
  if (!isFeatureReady) {
    return (
      <FeatureWarning
        title="Documents Unavailable"
        message={
          featureWarning ??
          "Documents and signatures are not available yet. Ask your admin to complete setup."
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents & Signatures</CardTitle>
      </CardHeader>
      <CardContent>
        {featureWarning && (
          <div className="mb-3">
            <FeatureWarning title="Documents Setup" message={featureWarning} />
          </div>
        )}
        {assetAccessWarning && (
          <div className="mb-3">
            <FeatureWarning title="File Access" message={assetAccessWarning} />
          </div>
        )}
        {propertyFilesWarning && (
          <div className="mb-3">
            <FeatureWarning title="Shared Files" message={propertyFilesWarning} />
          </div>
        )}
        {packets.length === 0 ? (
          <EmptyState message="No documents requiring action right now." />
        ) : (
          <div>
            {packets.map((packet, i) => (
              <PacketSignRow
                key={packet.id}
                packet={packet}
                onSignPacket={onSignPacket}
                assetAccessEnabled={assetAccessEnabled}
                last={i === packets.length - 1}
              />
            ))}
          </div>
        )}

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900">Shared Property Files</h3>
          {!propertyFilesEnabled ? (
            <EmptyState message="Shared files are not available yet." />
          ) : files.length === 0 ? (
            <EmptyState message="No shared files available." />
          ) : (
            <div>
              {files.map((file, i) => (
                <DataRow key={file.id} last={i === files.length - 1}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900">{file.fileName}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {file.propertyLabel} • {file.category.replaceAll("_", " ")}
                    </p>
                    {file.description && (
                      <p className="mt-0.5 text-xs text-zinc-500">{file.description}</p>
                    )}
                  </div>
                  <Link
                    href={`/api/assets/property-file/${file.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                    title="Open this shared property file."
                  >
                    Open File
                  </Link>
                </DataRow>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PacketSignRow({
  packet,
  onSignPacket,
  assetAccessEnabled,
  last
}: {
  packet: TenantDocumentPacketDTO;
  onSignPacket: StatefulAction;
  assetAccessEnabled: boolean;
  last: boolean;
}) {
  const [state, action] = useFormState(onSignPacket, null);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{packet.templateName}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{packet.propertyLabel}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant={packet.status === "signed" ? "success" : "warning"}>
            Packet: {packet.status.toUpperCase()}
          </Badge>
          <Badge variant={packet.signerStatus === "signed" ? "success" : "outline"}>
            Signer: {packet.signerStatus.toUpperCase()}
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
        </div>
      </div>
      {packet.signerStatus !== "signed" ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="packetId" value={packet.id} />
          <Input name="signatureText" placeholder="Type full legal name" required />
          <SubmitButton size="sm" title="Sign this packet with the entered legal name.">
            Sign
          </SubmitButton>
          {state && !state.success && <p className="text-xs text-red-500">{state.error}</p>}
          {state && state.success && <p className="text-xs text-emerald-600">Signed.</p>}
        </form>
      ) : (
        <Badge variant="outline">Complete</Badge>
      )}
    </DataRow>
  );
}
