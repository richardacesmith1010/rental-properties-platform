-- Expand notification type constraint to support rent due reminders and more
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'new_ticket', 'late_rent', 'ticket_resolved', 'payment_recorded',
    'lease_updated', 'document_sent', 'document_signed', 'application_reviewed',
    'rent_due_reminder', 'invite_accepted', 'achievement_unlocked'
  ]));
