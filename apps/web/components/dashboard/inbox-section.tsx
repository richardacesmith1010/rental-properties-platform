"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Bell, MessageSquare, Search } from "lucide-react";
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
import type { InboxThreadDTO } from "@/lib/inbox";
import { formatDateTime } from "@/lib/format";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type ReadFilter = "all" | "unread" | "read";
type NotificationFilter = "all" | NotificationDTO["type"];
type InboxTab = "timeline" | "threads";

interface InboxSectionProps {
  notifications: NotificationDTO[];
  threads: InboxThreadDTO[];
  properties: Array<{ id: string; name: string }>;
  onMarkRead: StatefulAction;
  onCreateThread?: StatefulAction;
  onSendMessage?: StatefulAction;
  threadsReady?: boolean;
  threadsWarning?: string | null;
  onOpenSection?: (sectionId: string) => void;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Thread actions are unavailable right now."
});

function mapNotificationToSection(type: NotificationDTO["type"]): string {
  if (type === "new_ticket" || type === "ticket_resolved") return "maintenance";
  if (type === "late_rent" || type === "payment_recorded") return "charges";
  if (type === "lease_updated") return "leases";
  if (type === "document_sent" || type === "document_signed") return "documents";
  return "overview";
}

function mapEntityTypeToSection(entityType: string): string {
  if (entityType === "maintenance_ticket") return "maintenance";
  if (entityType === "lease") return "leases";
  if (entityType === "rent_charge") return "charges";
  if (entityType === "document_packet") return "documents";
  return "overview";
}

function typeLabel(type: string) {
  return type.replaceAll("_", " ");
}

function formatTimestamp(value: string) {
  return formatDateTime(value);
}

function InboxNotificationRow({
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
        <p className="mt-1 text-[11px] text-zinc-400">{formatTimestamp(notification.createdAt)}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {!notification.readAt && (
          <form action={action}>
            <input type="hidden" name="notificationId" value={notification.id} />
            <SubmitButton size="sm" variant="outline" title="Mark this inbox item as read.">
              Mark read
            </SubmitButton>
            {state && !state.success && <p className="mt-1 text-xs text-red-500">{state.error}</p>}
            {state && state.success && <p className="mt-1 text-xs text-emerald-600">Marked read.</p>}
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

export function InboxSection({
  notifications,
  threads,
  properties,
  onMarkRead,
  onCreateThread,
  onSendMessage,
  threadsReady = true,
  threadsWarning = null,
  onOpenSection
}: InboxSectionProps) {
  const [activeTab, setActiveTab] = useState<InboxTab>("timeline");
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<NotificationFilter>("all");
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id ?? "");
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id ?? "");

  const [createThreadState, createThreadAction] = useFormState(
    onCreateThread ?? unavailableAction,
    null
  );
  const [sendMessageState, sendMessageAction] = useFormState(
    onSendMessage ?? unavailableAction,
    null
  );

  useEffect(() => {
    if (properties.length === 0) {
      setSelectedPropertyId("");
      return;
    }

    if (!selectedPropertyId || !properties.some((property) => property.id === selectedPropertyId)) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  useEffect(() => {
    if (threads.length === 0) {
      setSelectedThreadId("");
      return;
    }

    if (!selectedThreadId || !threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

  useEffect(() => {
    if (!threadsReady && activeTab === "threads") {
      setActiveTab("timeline");
    }
  }, [activeTab, threadsReady]);

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (readFilter === "unread" && notification.readAt) return false;
      if (readFilter === "read" && !notification.readAt) return false;
      if (typeFilter !== "all" && notification.type !== typeFilter) return false;

      const haystack = `${notification.title} ${notification.body}`.toLowerCase();
      if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;

      return true;
    });
  }, [notifications, query, readFilter, typeFilter]);

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;

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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={activeTab === "timeline" ? "default" : "outline"}
            title="View timeline events and alerts."
            onClick={() => setActiveTab("timeline")}
          >
            Timeline
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "threads" ? "default" : "outline"}
            disabled={!threadsReady}
            title="View and manage threaded conversations."
            onClick={() => setActiveTab("threads")}
          >
            <MessageSquare className="mr-1 h-4 w-4" />
            Threads
          </Button>
        </div>

        {!threadsReady && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {threadsWarning ??
              "Threaded conversation storage is not live yet. This inbox currently reflects event notifications only."}
          </div>
        )}

        {activeTab === "timeline" ? (
          <>
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

            {filteredNotifications.length === 0 ? (
              <EmptyState message="No inbox events match these filters. Try clearing search or status filters." />
            ) : (
              <div>
                {filteredNotifications.map((notification, index) => (
                  <InboxNotificationRow
                    key={notification.id}
                    notification={notification}
                    onMarkRead={onMarkRead}
                    onOpenSection={onOpenSection}
                    last={index === filteredNotifications.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <form action={createThreadAction} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Create thread</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select
                  name="propertyId"
                  value={selectedPropertyId}
                  onChange={(event) => setSelectedPropertyId(event.target.value)}
                  required
                  title="Select property for this thread."
                >
                  <option value="">Select property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
                <Select name="entityType" defaultValue="general" title="Link this thread to a related workflow entity.">
                  <option value="general">General</option>
                  <option value="maintenance_ticket">Maintenance Ticket</option>
                  <option value="lease">Lease</option>
                  <option value="rent_charge">Rent Charge</option>
                  <option value="document_packet">Document Packet</option>
                </Select>
              </div>
              <Input name="subject" className="mt-2" placeholder="Thread subject" required />
              <Input name="entityId" className="mt-2" placeholder="Entity ID (optional)" />
              <div className="mt-2 flex justify-end">
                <SubmitButton size="sm" title="Create a new inbox conversation thread.">
                  Create thread
                </SubmitButton>
              </div>
              {createThreadState && !createThreadState.success && (
                <p className="mt-2 text-xs text-red-600">{createThreadState.error}</p>
              )}
              {createThreadState && createThreadState.success && (
                <p className="mt-2 text-xs text-emerald-600">Thread created.</p>
              )}
            </form>

            {threads.length === 0 ? (
              <EmptyState message="No threads yet. Create one to start structured communication for a property." />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-2">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left transition ${
                        selectedThreadId === thread.id
                          ? "border-violet-300 bg-violet-50"
                          : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                      }`}
                      title="Open this conversation thread."
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-900">{thread.subject}</p>
                        <Badge variant="outline">{thread.messageCount} msg</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">{thread.propertyName}</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-600">
                        {thread.latestMessagePreview ?? "No messages yet."}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="rounded-lg border border-zinc-200 bg-white p-3">
                  {selectedThread ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">{selectedThread.subject}</p>
                        <p className="text-xs text-zinc-500">{selectedThread.propertyName}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="outline">{typeLabel(selectedThread.entityType)}</Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            title="Open the related workspace section for this thread."
                            onClick={() => onOpenSection?.(mapEntityTypeToSection(selectedThread.entityType))}
                          >
                            Open context
                          </Button>
                        </div>
                      </div>

                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {selectedThread.messages.length === 0 ? (
                          <EmptyState message="No messages in this thread yet." />
                        ) : (
                          selectedThread.messages.map((message) => (
                            <div key={message.id} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                              <p className="text-xs text-zinc-500">
                                {message.senderEmail ?? "System"} • {formatTimestamp(message.createdAt)}
                              </p>
                              <p className="mt-1 text-sm text-zinc-800">{message.body}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <form action={sendMessageAction} className="space-y-2">
                        <input type="hidden" name="threadId" value={selectedThread.id} />
                        <Input name="body" placeholder="Type a message..." required />
                        <div className="flex justify-end">
                          <SubmitButton size="sm" title="Send a new in-app message in this thread.">
                            Send message
                          </SubmitButton>
                        </div>
                        {sendMessageState && !sendMessageState.success && (
                          <p className="text-xs text-red-600">{sendMessageState.error}</p>
                        )}
                        {sendMessageState && sendMessageState.success && (
                          <p className="text-xs text-emerald-600">Message sent.</p>
                        )}
                      </form>
                    </div>
                  ) : (
                    <EmptyState message="Select a thread to view messages." />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
