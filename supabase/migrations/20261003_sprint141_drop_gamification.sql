-- Sprint 141: remove the retired XP, levels, streaks, and achievements backend.
-- Deploy the code removal BEFORE applying this migration.
-- Rollback: recreate objects from 20260308_sprint7_gamification_foundation.sql.
-- XP data is not restored; this is acceptable because it has not been user-visible
-- since Sprint 137.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.award_xp(uuid,text,integer,text,jsonb)')
  ) THEN
    REVOKE ALL ON FUNCTION public.award_xp(uuid,text,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.update_streak(uuid,text)')
  ) THEN
    REVOKE ALL ON FUNCTION public.update_streak(uuid,text) FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.award_xp(uuid,text,integer,text,jsonb);
DROP FUNCTION IF EXISTS public.update_streak(uuid,text);

-- No CASCADE: unexpected external dependencies must abort the transaction.
DROP TABLE IF EXISTS public.user_achievements, public.xp_events, public.user_gamification, public.achievements;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.notifications WHERE type = 'achievement_unlocked') THEN
    RAISE EXCEPTION 'Cannot remove achievement_unlocked: notification rows still exist';
  END IF;
END;
$$;

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
check (type = any (array[
  'new_ticket',
  'late_rent',
  'ticket_resolved',
  'payment_recorded',
  'lease_updated',
  'document_sent',
  'document_signed',
  'application_reviewed',
  'rent_due_reminder',
  'invite_accepted',
  'owner_message',
  'announcement',
  'lease_expiring_soon',
  'lease_expired',
  'delinquency_escalation',
  'distribution_change_requested',
  'distribution_change_approved',
  'distribution_change_rejected',
  'withdrawal_requested',
  'withdrawal_approved',
  'withdrawal_rejected',
  'withdrawal_completed'
]));

COMMIT;
