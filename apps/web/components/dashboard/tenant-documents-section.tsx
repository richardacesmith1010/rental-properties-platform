"use client";

import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import type { TenantDocumentPacketDTO } from "@/lib/documents";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface TenantDocumentsSectionProps {
  packets: TenantDocumentPacketDTO[];
  onSignPacket: StatefulAction;
}

export function TenantDocumentsSection({ packets, onSignPacket }: TenantDocumentsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents & Signatures</CardTitle>
      </CardHeader>
      <CardContent>
        {packets.length === 0 ? (
          <EmptyState message="No documents requiring action right now." />
        ) : (
          <div>
            {packets.map((packet, i) => (
              <PacketSignRow
                key={packet.id}
                packet={packet}
                onSignPacket={onSignPacket}
                last={i === packets.length - 1}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PacketSignRow({
  packet,
  onSignPacket,
  last
}: {
  packet: TenantDocumentPacketDTO;
  onSignPacket: StatefulAction;
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
        </div>
      </div>
      {packet.signerStatus !== "signed" ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="packetId" value={packet.id} />
          <Input name="signatureText" placeholder="Type full legal name" required />
          <SubmitButton size="sm">Sign</SubmitButton>
          {state && !state.success && <p className="text-xs text-red-500">{state.error}</p>}
          {state && state.success && <p className="text-xs text-emerald-600">Signed.</p>}
        </form>
      ) : (
        <Badge variant="outline">Complete</Badge>
      )}
    </DataRow>
  );
}
