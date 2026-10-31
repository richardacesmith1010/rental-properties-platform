-- Rollback for Sprint 259b (20261108_sprint259b_accept_llc_invitation.sql). Run only after the app no longer calls
-- accept_llc_invitation (revert the 259b code or re-add 259a's invite hold first); otherwise every join fails.
-- Rows the function wrote (accepted invitations, profiles, memberships) stay; they are ordinary data.
drop function if exists public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text);
drop index if exists public.llc_invitations_token_key;
