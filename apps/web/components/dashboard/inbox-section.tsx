"use client";

import { threadDisplayTitle } from "@/lib/inbox/thread-title";
import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Bell, Mail, MessageSquare, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { SubmitButton } from "../shared/submit-button";
import { EmptyState } from "./empty-state";
import { Button } from "../ui/button";
import { AnimatedList } from "../ui/animated-list";
import { AnimatedTabs } from "../ui/animated-tabs";
import { Alert } from "../ui/alert";
import {
  InboxNotificationRow,
  TenantInboxView,
  mapEntityTypeToSection,
  typeLabel,
  formatTimestamp,
  unavailableAction,
  type InboxSectionProps,
  type InboxTab,
  type ReadFilter,
  type NotificationFilter,
} from "./inbox-views";

export function InboxSection({
  notifications,
  viewerRole,
  threads,
  properties,
  onMarkRead,
  onMarkAllRead,
  onCreateThread,
  onSendMessage,
  onStartTenantConversation,
  threadsReady = true,
  threadsWarning = null,
  onOpenSection,
  messageSectionId = "inbox",
  currentUserId,
  hasActiveLease = true,
}: InboxSectionProps) {
  const [activeTab, setActiveTab] = useState<InboxTab>(
    viewerRole === "tenant" || onStartTenantConversation || (threads.length > 0 && !notifications.some((item) => !item.readAt))
      ? "threads" : "timeline",
  );
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<NotificationFilter>("all");
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id ?? "");
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0]?.id ?? "");

  const [createThreadState, createThreadAction] = useFormState(
    onCreateThread ?? unavailableAction,
    null,
  );
  const [markAllState, markAllAction] = useFormState(onMarkAllRead ?? unavailableAction, null);
  const [sendMessageState, sendMessageAction] = useFormState(
    onSendMessage ?? unavailableAction,
    null,
  );
  const [startState, startAction] = useFormState(
    onStartTenantConversation ?? unavailableAction,
    null,
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
  const homesWithoutThread = properties.filter(
    (property) => !threads.some((thread) => thread.propertyId === property.id),
  );

  if (onStartTenantConversation) {
    return (
      <TenantInboxView
        hasActiveLease={hasActiveLease}
        threads={threads}
        properties={properties}
        startAction={startAction}
        startState={startState}
        sendMessageAction={sendMessageAction}
        sendMessageState={sendMessageState}
        selectedThread={selectedThread}
        selectedThreadId={selectedThreadId}
        setSelectedThreadId={setSelectedThreadId}
        currentUserId={currentUserId}
        homesWithoutThread={homesWithoutThread}
      />
    );
  }

  return (
    <Card id="inbox" className="border border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <Bell className="h-4 w-4" />
          {onStartTenantConversation ? "Messages" : "Domus Inbox"}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={unreadCount > 0 ? "warning" : "outline"}>{unreadCount} unread</Badge>
          {onMarkAllRead ? (
            <form action={markAllAction}>
              <SubmitButton
                size="sm"
                variant="outline"
                disabled={unreadCount === 0}
                title="Mark every unread inbox item as read."
              >
                Mark all as read
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {markAllState && !markAllState.success ? (
          <p className="text-sm text-[var(--crit)]">{markAllState.error}</p>
        ) : null}
        {markAllState && markAllState.success && markAllState.message ? (
          <p className="text-sm text-[var(--pos)]">{markAllState.message}</p>
        ) : null}
        {!onStartTenantConversation && (
          <p className="text-sm text-[var(--ink-2)]">
            Central communication timeline for rent, maintenance, lease, and document events.
          </p>
        )}

        <AnimatedTabs
          tabs={[
            { id: "timeline", label: "Timeline" },
            { id: "threads", label: "Threads", icon: <MessageSquare className="h-4 w-4" /> },
          ]}
          activeTab={activeTab}
          onTabChange={(tabId) => {
            if (tabId === "threads" && !threadsReady) {
              return;
            }
            setActiveTab(tabId as InboxTab);
          }}
        />

        {!threadsReady && (
          <Alert variant="warning" className="text-xs font-normal">
            {threadsWarning ?? "Messages are not ready yet. You can see alerts here for now."}
          </Alert>
        )}

        {activeTab === "timeline" ? (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="relative sm:col-span-1">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-[var(--faint)]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search inbox"
                  className="pl-8"
                />
              </div>
              <Select
                value={readFilter}
                onChange={(event) => setReadFilter(event.target.value as ReadFilter)}
              >
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
                <option value="owner_message">Messages</option>
                <option value="lease_updated">Lease updated</option>
                <option value="document_sent">Document sent</option>
                <option value="document_signed">Document signed</option>
              </Select>
            </div>

            {filteredNotifications.length === 0 ? (
              notifications.length === 0 &&
              !query.trim() &&
              readFilter === "all" &&
              typeFilter === "all" ? (
                <EmptyState
                  icon={Mail}
                  title={viewerRole === "tenant" || onStartTenantConversation ? "No messages yet" : "No updates yet"}
                  description={viewerRole === "tenant" || onStartTenantConversation
                    ? "Your landlord can message you here." : "Rent, repair, and lease updates show up here."}
                />
              ) : (
                <EmptyState message="No inbox events match these filters. Try clearing search or status filters." />
              )
            ) : (
              <AnimatedList>
                {filteredNotifications.map((notification, index) => (
                  <InboxNotificationRow
                    key={notification.id}
                    notification={notification}
                    onMarkRead={onMarkRead}
                    onOpenSection={
                      onOpenSection
                        ? (sectionId) =>
                            onOpenSection(sectionId === "inbox" ? messageSectionId : sectionId)
                        : undefined
                    }
                    last={index === filteredNotifications.length - 1}
                  />
                ))}
              </AnimatedList>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {onCreateThread ? (
              <form
                action={createThreadAction}
                className="rounded-2xl border border-border/50 bg-[var(--surface-2)] p-3 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Create thread
                </p>
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
                  <Select
                    name="entityType"
                    defaultValue="general"
                    title="Link this thread to a related workflow entity."
                  >
                    <option value="general">General</option>
                    <option value="maintenance_ticket">Maintenance Ticket</option>
                    <option value="lease">Lease</option>
                    <option value="rent_charge">Rent Payment</option>
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
                  <p className="mt-2 text-xs text-[var(--crit)]">{createThreadState.error}</p>
                )}
                {createThreadState && createThreadState.success && (
                  <p className="mt-2 text-xs text-[var(--pos)]">Thread created.</p>
                )}
              </form>
            ) : null}

            {onStartTenantConversation &&
            (homesWithoutThread.length > 0 || threads.length === 0) ? (
              <form
                action={startAction}
                className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <h3 className="text-lg font-semibold text-[var(--ink)]">Message your landlord</h3>
                {properties.length > 1 && (
                  <label className="block text-sm text-[var(--ink)]">
                    Which home?
                    <Select
                      name="propertyId"
                      defaultValue=""
                      required
                      className="mt-1 min-h-11"
                      title="Choose the home this message is about."
                    >
                      <option value="" disabled>
                        Choose a home
                      </option>
                      {homesWithoutThread.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                <label className="block text-sm text-[var(--ink)]">
                  Your message
                  <textarea
                    name="body"
                    required
                    maxLength={2000}
                    rows={4}
                    className="domus-input mt-1 w-full rounded-xl p-3"
                    placeholder="What would you like to ask?"
                  />
                </label>
                <SubmitButton className="min-h-11" title="Send your message to your landlord.">
                  Send
                </SubmitButton>
                {startState && !startState.success && (
                  <p role="alert" className="text-sm text-[var(--crit)]">
                    {startState.error}
                  </p>
                )}
                {startState?.success && (
                  <p role="status" className="text-sm text-[var(--pos)]">
                    {startState.message}
                  </p>
                )}
              </form>
            ) : null}
            {threads.length === 0 && !onStartTenantConversation ? (
              <EmptyState icon={Mail} title="No messages" description="Your inbox is empty." />
            ) : threads.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--domus-shadow-sm)]">
                  <AnimatedList className="space-y-2">
                    {threads.map((thread) => (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => setSelectedThreadId(thread.id)}
                        className={`min-h-11 w-full rounded-md border px-3 py-2 text-left transition ${
                          selectedThreadId === thread.id
                            ? "border-[var(--accent-line)] bg-[var(--accent-weak)]"
                            : "border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)]"
                        }`}
                        title="Open this conversation thread."
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-base font-medium text-[var(--ink)]">
                            {threadDisplayTitle(thread.subject, viewerRole ?? "owner")}
                          </p>
                          <Badge variant="outline">{thread.messageCount} msg</Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--muted)]">{thread.propertyName}</p>
                        <p className="mt-0.5 truncate text-sm text-[var(--ink-2)]">
                          {thread.latestMessagePreview ?? "No messages yet."}
                        </p>
                      </button>
                    ))}
                  </AnimatedList>
                </div>

                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--domus-shadow-sm)]">
                  {selectedThread ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-base font-medium text-[var(--ink)]">
                          {threadDisplayTitle(selectedThread.subject, viewerRole ?? "owner")}
                        </p>
                        <p className="text-sm text-[var(--muted)]">{selectedThread.propertyName}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="outline">{typeLabel(selectedThread.entityType)}</Badge>
                          {onOpenSection ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              title="Open the related workspace section for this thread."
                              onClick={() =>
                                onOpenSection(mapEntityTypeToSection(selectedThread.entityType))
                              }
                            >
                              Open context
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="max-h-64 overflow-y-auto pr-1">
                        {selectedThread.messages.length === 0 ? (
                          <EmptyState message="No messages in this thread yet." />
                        ) : (
                          <AnimatedList className="space-y-2">
                            {selectedThread.messages.map((message) => (
                              <div
                                key={message.id}
                                className="rounded-xl border border-border/50 bg-[var(--surface-2)] px-3 py-2 shadow-sm"
                              >
                                <p className="text-sm text-[var(--muted)]">
                                  {message.senderEmail ?? "System"} •{" "}
                                  {formatTimestamp(message.createdAt)}
                                </p>
                                <p className="mt-1 text-sm text-[var(--ink)]">{message.body}</p>
                              </div>
                            ))}
                          </AnimatedList>
                        )}
                      </div>

                      <form action={sendMessageAction} className="space-y-2">
                        <input type="hidden" name="threadId" value={selectedThread.id} />
                        <Input name="body" placeholder="Type a message..." required />
                        <div className="flex justify-end">
                          <SubmitButton
                            size="sm"
                            className="min-h-11"
                            title="Send a new in-app message in this thread."
                          >
                            Send message
                          </SubmitButton>
                        </div>
                        {sendMessageState && !sendMessageState.success && (
                          <p className="text-xs text-[var(--crit)]">{sendMessageState.error}</p>
                        )}
                        {sendMessageState && sendMessageState.success && (
                          <p className="text-xs text-[var(--pos)]">Message sent.</p>
                        )}
                      </form>
                    </div>
                  ) : (
                    <EmptyState message="Select a thread to view messages." />
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
