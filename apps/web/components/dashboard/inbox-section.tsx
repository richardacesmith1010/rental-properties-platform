"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Bell, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { EmptyState } from "@/components/shared/empty-state";
import { DataRow } from "@/components/shared/data-row";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/app/actions";
import type { NotificationDTO } from "@/lib/notifications";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface InboxSectionProps {
  notifications: NotificationDTO[];
  onMarkRead: StatefulAction;
  onOpenSection?: (sectionId: string) => void;
}

type ReadFilter = "all" | "unread" | "read";
type NotificationFilter = "all" | NotificationDTO["type"];

function mapNotificationToSection(type: NotificationDTO["type"]): string {
  if (type === "new_ticket" || type === "ticket_resolved") return "maintenance";
  if (type === "late_rent" || type === "payment_recorded") return "charges";
  if (type === "lease_updated") return "leases";
  if (type === "document_sent" || type === "document_signed") return "documents";
  return "overview";
}

function typeLabel(type: NotificationDTO["type"]) {
  return type.replaceAll("_", " ");
}

export function InboxSection({ notifications, onMarkRead, onOpenSection }: InboxSectionProps) {
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<NotificationFilter>("all");

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  const filtered = useMemo(() => {
    return notifications.filter((notification) => {
      if (readFilter === "unread" && notification.readAt) return false;
      if (readFilter === "read" && !notification.readAt) return false;
      if (typeFilter !== "all" && notification.type !== typeFilter) return false;

      const haystack = `${notification.title} ${notification.body}`.toLowerCase();
      if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;

      return true;
    });
  }, [notifications, query, readFilter, typeFilter]);

  return (
    <Card id="inbox">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Domus Inbox
        </CardTitle>
        <Badge variant={unreadCount > 0 ? "warning" : "outline"}>{unreadCount} unread</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-600">
          Central communication timeline for rent, maintenance, lease, and document events.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="relative sm:col-span-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search inbox"
              className="pl-8"
            />
          </div>
          <Select value={readFilter} onChange={(event) => setReadFilter(event.target.value as ReadFilter)}>
            <option value="all">All statuses</option>
            <option value="unread">Unread only</option>
            <option value="read">Read only</option>
          </Select>
          <Select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as NotificationFilter)}
          >
            <option value="all">All event types</option>
            <option value="new_ticket">New ticket</option>
            <option value="late_rent">Late rent</option>
            <option value="ticket_resolved">Ticket resolved</option>
            <option value="payment_recorded">Payment recorded</option>
            <option value="lease_updated">Lease updated</option>
            <option value="document_sent">Document sent</option>
            <option value="document_signed">Document signed</option>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState message="No inbox events match the current filters." />
        ) : (
          <div>
            {filtered.map((notification, index) => (
              <InboxRow
                key={notification.id}
                notification={notification}
                onMarkRead={onMarkRead}
                onOpenSection={onOpenSection}
                last={index === filtered.length - 1}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InboxRow({
  notification,
  onMarkRead,
  onOpenSection,
  last
}: {
  notification: NotificationDTO;
  onMarkRead: StatefulAction;
  onOpenSection?: (sectionId: string) => void;
  last: boolean;
}) {
  const [state, action] = useFormState(onMarkRead, null);
  const targetSection = mapNotificationToSection(notification.type);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{notification.title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{notification.body}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="uppercase">
            {typeLabel(notification.type)}
          </Badge>
          {notification.readAt ? <Badge variant="outline">Read</Badge> : <Badge variant="warning">Unread</Badge>}
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">
          {new Date(notification.createdAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit"
          })}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {!notification.readAt && (
          <form action={action}>
            <input type="hidden" name="notificationId" value={notification.id} />
            <SubmitButton size="sm" variant="outline" title="Mark this inbox item as read.">
              Mark read
            </SubmitButton>
            {state && !state.success && <p className="mt-1 text-xs text-red-500">{state.error}</p>}
          </form>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          title={`Open ${targetSection} context for this inbox event.`}
          onClick={() => onOpenSection?.(targetSection)}
        >
          Open context
        </Button>
      </div>
    </DataRow>
  );
}
