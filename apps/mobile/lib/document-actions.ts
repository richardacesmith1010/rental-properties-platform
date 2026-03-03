import { getSupabaseClient } from "./supabase";
import { isMissingSchemaError } from "./tenant-data";

interface SignDocumentInput {
  packetId: string;
  signerId: string;
  signatureText: string;
}

interface MobileActionResult {
  success: boolean;
  error?: string;
}

export async function signDocumentMobile(input: SignDocumentInput): Promise<MobileActionResult> {
  const signatureText = input.signatureText.trim();
  if (!signatureText) {
    return { success: false, error: "Enter your full legal name before signing." };
  }

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const signerUpdate = await supabase
    .from("document_signers")
    .update({
      status: "signed",
      signed_at: now,
      signature_text: signatureText,
    })
    .eq("id", input.signerId)
    .eq("packet_id", input.packetId)
    .select("id")
    .single();

  if (signerUpdate.error) {
    if (isMissingSchemaError(signerUpdate.error)) {
      return { success: false, error: "Document signing requires a database update." };
    }

    return { success: false, error: signerUpdate.error.message };
  }

  const pendingSignersResult = await supabase
    .from("document_signers")
    .select("id")
    .eq("packet_id", input.packetId)
    .neq("status", "signed")
    .limit(1);

  if (pendingSignersResult.error) {
    if (isMissingSchemaError(pendingSignersResult.error)) {
      return { success: false, error: "Document signing requires a database update." };
    }

    return { success: false, error: pendingSignersResult.error.message };
  }

  if ((pendingSignersResult.data ?? []).length === 0) {
    const packetUpdate = await supabase
      .from("document_packets")
      .update({
        status: "signed",
        signed_at: now,
      })
      .eq("id", input.packetId);

    if (packetUpdate.error && !isMissingSchemaError(packetUpdate.error)) {
      return { success: false, error: packetUpdate.error.message };
    }
  }

  return { success: true };
}
