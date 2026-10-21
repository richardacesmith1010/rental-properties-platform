begin;

alter table notifications add constraint notifications_type_check_v2 check (type in (
  'new_ticket', 'late_rent', 'ticket_resolved', 'payment_recorded', 'lease_updated',
  'document_sent', 'document_signed', 'application_reviewed', 'rent_due_reminder',
  'invite_accepted', 'owner_message', 'announcement', 'lease_expiring_soon',
  'lease_expired', 'delinquency_escalation', 'distribution_change_requested',
  'distribution_change_approved', 'distribution_change_rejected', 'withdrawal_requested',
  'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_completed', 'ticket_in_progress'
)) not valid;
alter table notifications validate constraint notifications_type_check_v2;
alter table notifications drop constraint notifications_type_check;
alter table notifications rename constraint notifications_type_check_v2 to notifications_type_check;

commit;

/* Rollback (after deleting notices of the new type):
begin;
delete from notifications where type = 'ticket_in_progress';
alter table notifications add constraint notifications_type_check_v1 check (type in (
  'new_ticket', 'late_rent', 'ticket_resolved', 'payment_recorded', 'lease_updated',
  'document_sent', 'document_signed', 'application_reviewed', 'rent_due_reminder',
  'invite_accepted', 'owner_message', 'announcement', 'lease_expiring_soon',
  'lease_expired', 'delinquency_escalation', 'distribution_change_requested',
  'distribution_change_approved', 'distribution_change_rejected', 'withdrawal_requested',
  'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_completed'
)) not valid;
alter table notifications validate constraint notifications_type_check_v1;
alter table notifications drop constraint notifications_type_check;
alter table notifications rename constraint notifications_type_check_v1 to notifications_type_check;
commit;
*/
