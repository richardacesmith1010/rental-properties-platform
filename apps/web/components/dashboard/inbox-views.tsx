"use client";

import type { Dispatch, SetStateAction } from "react";
import { useFormState } from "react-dom";
import { DataRow } from "../shared/data-row";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Select } from "../ui/select";
import { Input } from "../ui/input";
import { SubmitButton } from "../shared/submit-button";
import { formatDateTime } from "@/lib/format";
import type { ActionState } from "@/app/actions";
import type { NotificationDTO } from "@/lib/notifications";
import type { InboxThreadDTO } from "@/lib/inbox";

export type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export type ReadFilter = "all" | "unread" | "read";
export type NotificationFilter = "all" | NotificationDTO["type"];
export type InboxTab = "timeline" | "threads";

export interface InboxSectionProps {
  notifications: NotificationDTO[];
  threads: InboxThreadDTO[];
  properties: Array<{ id: string; name: string }>;
  onMarkRead: StatefulAction;
  onMarkAllRead?: StatefulAction;
  onCreateThread?: StatefulAction;
  onSendMessage?: StatefulAction;
  onStartTenantConversation?: StatefulAction;
  threadsReady?: boolean;
  threadsWarning?: string | null;
  onOpenSection?: (sectionId: string) => void;
  messageSectionId?: string;
  currentUserId?: string;
  hasActiveLease?: boolean;
}

export const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Thread actions are unavailable right now."
});

function mapNotificationToSection(type: NotificationDTO["type"]): string {
  if (type === "owner_message") return "inbox";
  if (type === "new_ticket" || type === "ticket_resolved") return "maintenance";
  if (type === "late_rent" || type === "payment_recorded") return "charges";
  if (type === "lease_updated") return "leases";
  if (type === "document_sent" || type === "document_signed") return "documents";
  return "overview";
}

export function mapEntityTypeToSection(entityType: string): string {
  if (entityType === "tenant_profile") return "inbox";
  if (entityType === "maintenance_ticket") return "maintenance";
  if (entityType === "lease") return "leases";
  if (entityType === "rent_charge") return "charges";
  if (entityType === "document_packet") return "documents";
  return "overview";
}

export function typeLabel(type: string) {
  return type.replaceAll("_", " ");
}

export function formatTimestamp(value: string) {
  return formatDateTime(value);
}

export function InboxNotificationRow({
  notification,
  onMarkRead,
  onOpenSection,
  last,
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
        <p className="text-sm font-semibold text-[var(--ink)]">{notification.title}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{notification.body}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="uppercase">
            {typeLabel(notification.type)}
          </Badge>
          {notification.readAt ? (
            <Badge variant="outline">Read</Badge>
          ) : (
            <Badge variant="warning">Unread</Badge>
          )}
        </div>
        <p className="mt-1 text-[11px] text-[var(--faint)]">
          {formatTimestamp(notification.createdAt)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {!notification.readAt && (
          <form action={action}>
            <input type="hidden" name="notificationId" value={notification.id} />
            <SubmitButton size="sm" variant="outline" title="Mark this inbox item as read.">
              Mark read
            </SubmitButton>
            {state && !state.success && (
              <p className="mt-1 text-xs text-[var(--crit)]">{state.error}</p>
            )}
            {state && state.success && (
              <p className="mt-1 text-xs text-[var(--pos)]">Marked read.</p>
            )}
          </form>
        )}
        {onOpenSection ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            title={`Open ${targetSection} context for this inbox event.`}
            onClick={() => onOpenSection(targetSection)}
          >
            Open context
          </Button>
        ) : null}
      </div>
    </DataRow>
  );
}

interface TenantInboxViewProps {
  hasActiveLease: boolean;
  threads: InboxThreadDTO[];
  properties: Array<{ id: string; name: string }>;
  startAction: (formData: FormData) => void;
  startState: ActionState;
  sendMessageAction: (formData: FormData) => void;
  sendMessageState: ActionState;
  selectedThread: InboxThreadDTO | null;
  selectedThreadId: string;
  setSelectedThreadId: Dispatch<SetStateAction<string>>;
  currentUserId?: string;
  homesWithoutThread: Array<{ id: string; name: string }>;
}

export function TenantInboxView({
  hasActiveLease,
  threads,
  properties,
  startAction,
  startState,
  sendMessageAction,
  sendMessageState,
  selectedThread,
  selectedThreadId,
  setSelectedThreadId,
  currentUserId,
  homesWithoutThread,
}: TenantInboxViewProps) {
  const tenantThread = selectedThread;
  return (
    <Card id="inbox" className="border border-border/50 shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        {!hasActiveLease ? (
          <p className="text-sm text-[var(--muted)]">
            Once your landlord sets up your lease, you can report problems. You can also send
            messages.
          </p>
        ) : null}
        {threads.length === 0 ? (
          <form
            action={hasActiveLease ? startAction : undefined}
            onSubmit={!hasActiveLease ? (event) => event.preventDefault() : undefined}
            className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
          >
            <h2 className="text-lg font-semibold text-[var(--ink)]">Message your landlord</h2>
            {properties.length > 1 ? (
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
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <input type="hidden" name="propertyId" value={properties[0]?.id ?? ""} />
            )}
            <label className="block text-sm text-[var(--ink)]">
              Your message
              <textarea
                name="body"
                required
                maxLength={2000}
                rows={4}
                className="domus-input mt-1 w-full rounded-xl p-3"
                placeholder="Write a message…"
              />
            </label>
            <SubmitButton
              className="min-h-11"
              disabled={!hasActiveLease}
              title="Send your message to your landlord."
            >
              Send
            </SubmitButton>
            {startState && !startState.success ? (
              <p role="alert" className="text-sm text-[var(--crit)]">
                {startState.error}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="space-y-4">
            {threads.length > 1 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--ink)]">Your homes</p>
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={[
                      "min-h-11 w-full rounded-xl border px-3 py-2 text-left",
                      selectedThreadId === thread.id
                        ? "border-[var(--accent-line)] bg-[var(--accent-weak)]"
                        : "border-[var(--line)] bg-[var(--surface-2)]"
                    ].join(" ")}
                    title={`Open messages for ${thread.propertyName}.`}
                  >
                    <span className="font-medium text-[var(--ink)]">{thread.propertyName}</span>
                    <span className="mt-0.5 block truncate text-sm text-[var(--muted)]">
                      {thread.latestMessagePreview ?? "No messages yet."}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {tenantThread ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--ink)]">
                    {tenantThread.propertyName}
                  </h2>
                  <p className="text-sm text-[var(--muted)]">Chat with your landlord</p>
                </div>
                <div className="space-y-3" aria-live="polite">
                  {tenantThread.messages.map((message) => {
                    const mine =
                      message.senderProfileId === currentUserId || message.direction === "inbound";
                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={[
                            "max-w-[85%] rounded-2xl px-3 py-2",
                            mine
                              ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                              : "bg-[var(--surface-2)] text-[var(--ink)]"
                          ].join(" ")}
                        >
                          <p className="text-xs font-semibold">
                            {mine ? "You" : (message.senderName ?? "Your landlord")}
                          </p>
                          <p className="mt-1 text-sm">{message.body}</p>
                          <p
                            className={`mt-1 text-[11px] ${mine ? "opacity-80" : "text-[var(--muted)]"}`}
                          >
                            {formatTimestamp(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form
                  action={hasActiveLease ? sendMessageAction : undefined}
                  onSubmit={!hasActiveLease ? (event) => event.preventDefault() : undefined}
                  className="space-y-2"
                >
                  <input type="hidden" name="threadId" value={tenantThread.id} />
                  <Input name="body" placeholder="Write a message…" required />
                  <div className="flex justify-end">
                    <SubmitButton
                      size="sm"
                      className="min-h-11"
                      disabled={!hasActiveLease}
                      title="Send a message to your landlord."
                    >
                      Send
                    </SubmitButton>
                  </div>
                  {sendMessageState && !sendMessageState.success ? (
                    <p className="text-sm text-[var(--crit)]">{sendMessageState.error}</p>
                  ) : null}
                </form>
              </div>
            ) : null}
            {homesWithoutThread.length > 0 ? (
              <form
                action={hasActiveLease ? startAction : undefined}
                onSubmit={!hasActiveLease ? (event) => event.preventDefault() : undefined}
                className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <h2 className="text-lg font-semibold text-[var(--ink)]">Message your landlord</h2>
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
                <label className="block text-sm text-[var(--ink)]">
                  Your message
                  <textarea
                    name="body"
                    required
                    maxLength={2000}
                    rows={4}
                    className="domus-input mt-1 w-full rounded-xl p-3"
                    placeholder="Write a message…"
                  />
                </label>
                <SubmitButton
                  className="min-h-11"
                  disabled={!hasActiveLease}
                  title="Send your message to your landlord."
                >
                  Send
                </SubmitButton>
              </form>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
