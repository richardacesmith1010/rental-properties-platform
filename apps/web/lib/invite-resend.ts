import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTenantInviteEmail } from "@/lib/invite-email";
import {
  buildTenantResendPayload,
  createTenantInviteLink,
  deleteGeneratedInviteUser,
  fallbackToSupabaseInvite
} from "@/app/actions/tenant-invitation-support";

export interface ResendInvitation {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  property_id: string | null;
  ownership_account_id: string | null;
  invited_profile_id: string | null;
}

export async function resendInvitationEmail(invitation: ResendInvitation, inviterProfileId: string) {
  const admin = createAdminClient();
  let nextInvitedProfileId = invitation.invited_profile_id ?? null;

  if (invitation.role === "tenant") {
    const tenantPayload = await buildTenantResendPayload({
      currentUserId: inviterProfileId,
      invitation
    });

    if (tenantPayload) {
      const generatedInvite = await createTenantInviteLink({
        email: invitation.email,
        metadata: tenantPayload.metadata
      });

      if (!generatedInvite.error && generatedInvite.data.user) {
        nextInvitedProfileId = generatedInvite.data.user.id;
        const brandedInviteSent = await sendTenantInviteEmail({
          ...tenantPayload.emailParams,
          inviteUrl: generatedInvite.data.properties.action_link
        });

        if (!brandedInviteSent) {
          await deleteGeneratedInviteUser(nextInvitedProfileId);
          nextInvitedProfileId = null;

          const fallbackInvite = await fallbackToSupabaseInvite({
            email: invitation.email,
            metadata: tenantPayload.metadata
          });

          if (fallbackInvite.error) {
            return { ok: false } as const;
          }

          nextInvitedProfileId = fallbackInvite.data.user?.id ?? nextInvitedProfileId;
        }
      } else {
        const fallbackInvite = await fallbackToSupabaseInvite({
          email: invitation.email,
          metadata: tenantPayload.metadata
        });

        if (fallbackInvite.error) {
          return { ok: false } as const;
        }

        nextInvitedProfileId = fallbackInvite.data.user?.id ?? nextInvitedProfileId;
      }
    } else {
      const fallbackInvite = await admin.auth.admin.inviteUserByEmail(invitation.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/auth/callback`,
        data: {
          role: invitation.role,
          full_name: invitation.full_name,
          property_id: invitation.property_id,
          ownership_account_id: invitation.ownership_account_id
        }
      });

      if (fallbackInvite.error) {
        return { ok: false } as const;
      }

      nextInvitedProfileId = fallbackInvite.data.user?.id ?? nextInvitedProfileId;
    }
  } else {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(invitation.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/auth/callback`,
      data: {
        role: invitation.role,
        full_name: invitation.full_name,
        property_id: invitation.property_id,
        ownership_account_id: invitation.ownership_account_id
      }
    });

    if (inviteError) {
      return { ok: false } as const;
    }
  }

  return { ok: true, invitedProfileId: nextInvitedProfileId } as const;
}
