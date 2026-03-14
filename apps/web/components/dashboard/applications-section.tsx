"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { ChevronDown, ChevronUp, FileSearch, MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { EmptyState } from "@/components/shared/empty-state";
import type { ActionState } from "@/app/actions";
import type { ApplicationDTO } from "@/lib/applications";
import type { RentalListingDTO } from "@/lib/leasing";
import { formatDate, formatDateTime } from "@/lib/format";
import { Alert } from "@/components/ui/alert";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface ApplicationsSectionProps {
  applications: ApplicationDTO[];
  listings: RentalListingDTO[];
  properties: Array<{ id: string; name: string }>;
  pipelineReady?: boolean;
  pipelineWarning?: string | null;
  onCreateApplication?: StatefulAction;
  onReviewApplication?: StatefulAction;
  onAddApplicationNote?: StatefulAction;
  onRecordScreeningScore?: StatefulAction;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Application actions are unavailable right now."
});

const sections: Array<{
  id: "submitted" | "in_review" | "approved" | "rejected";
  heading: string;
  badgeVariant: "warning" | "outline" | "success" | "destructive";
  statuses: ApplicationDTO["status"][];
}> = [
  {
    id: "submitted",
    heading: "Submitted",
    badgeVariant: "warning",
    statuses: ["submitted"]
  },
  {
    id: "in_review",
    heading: "In Review",
    badgeVariant: "outline",
    statuses: ["in_review"]
  },
  {
    id: "approved",
    heading: "Approved",
    badgeVariant: "success",
    statuses: ["approved"]
  },
  {
    id: "rejected",
    heading: "Rejected",
    badgeVariant: "destructive",
    statuses: ["rejected", "withdrawn"]
  }
];

function statusVariant(status: ApplicationDTO["status"]) {
  if (status === "submitted") return "warning" as const;
  if (status === "approved") return "success" as const;
  if (status === "rejected" || status === "withdrawn") return "destructive" as const;
  return "outline" as const;
}

function statusLabel(status: ApplicationDTO["status"]) {
  if (status === "in_review") {
    return "in review";
  }
  return status;
}

function ScreeningBadge({ score, status }: { score: number | null; status: ApplicationDTO["screeningStatus"] }) {
  if (score === null) {
    if (!status) {
      return null;
    }
    return <Badge variant={status === "failed" ? "destructive" : "outline"}>Screening: {status}</Badge>;
  }

  return <Badge variant="success">Score: {score}</Badge>;
}

function ApplicationCard({
  application,
  onReviewApplication,
  onAddApplicationNote,
  onRecordScreeningScore
}: {
  application: ApplicationDTO;
  onReviewApplication?: StatefulAction;
  onAddApplicationNote?: StatefulAction;
  onRecordScreeningScore?: StatefulAction;
}) {
  const [reviewState, reviewAction] = useFormState(onReviewApplication ?? unavailableAction, null);
  const [noteState, noteAction] = useFormState(onAddApplicationNote ?? unavailableAction, null);
  const [scoreState, scoreAction] = useFormState(onRecordScreeningScore ?? unavailableAction, null);

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showScoreForm, setShowScoreForm] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {application.applicantName?.trim() || application.applicantEmail}
            </p>
            <p className="text-xs text-zinc-500">{application.applicantEmail}</p>
            {application.applicantPhone && (
              <p className="text-xs text-zinc-500">{application.applicantPhone}</p>
            )}
          </div>
          <Badge variant={statusVariant(application.status)} className="uppercase">
            {statusLabel(application.status)}
          </Badge>
        </div>

        <div className="text-xs text-zinc-600">
          <p>
            <span className="font-semibold">Listing:</span> {application.listingHeadline}
          </p>
          <p>
            <span className="font-semibold">Property:</span> {application.propertyName}
          </p>
          <p>
            <span className="font-semibold">Submitted:</span> {formatDate(application.submittedAt)}
          </p>
          {application.reviewedAt && (
            <p>
              <span className="font-semibold">Reviewed:</span> {formatDateTime(application.reviewedAt)}
              {application.reviewedByEmail ? ` by ${application.reviewedByEmail}` : ""}
            </p>
          )}
          {application.source && (
            <p>
              <span className="font-semibold">Source:</span> {application.source}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <ScreeningBadge score={application.screeningScore} status={application.screeningStatus} />
          {application.notes && (
            <Badge variant="outline" className="max-w-full truncate" title={application.notes}>
              Note: {application.notes}
            </Badge>
          )}
        </div>

        {application.status === "submitted" && (
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Review actions</p>
            <Input
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              placeholder="Optional review note"
            />
            <form action={reviewAction} className="flex items-center justify-end">
              <input type="hidden" name="applicationId" value={application.id} />
              <input type="hidden" name="status" value="in_review" />
              <input type="hidden" name="notes" value={reviewNotes} />
              <SubmitButton size="sm" variant="outline" title="Move this application into review.">
                Start review
              </SubmitButton>
            </form>
            {reviewState && !reviewState.success && (
              <p className="text-xs text-red-600">{reviewState.error}</p>
            )}
            {reviewState && reviewState.success && (
              <p className="text-xs text-emerald-600">Application moved to in review.</p>
            )}
          </div>
        )}

        {application.status === "in_review" && (
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Decision</p>
            <Input
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              placeholder="Optional decision note"
            />
            <div className="flex flex-wrap items-center gap-2">
              <form action={reviewAction}>
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="status" value="approved" />
                <input type="hidden" name="notes" value={reviewNotes} />
                <SubmitButton size="sm" title="Approve this application.">
                  Approve
                </SubmitButton>
              </form>
              <form action={reviewAction}>
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="status" value="rejected" />
                <input type="hidden" name="notes" value={reviewNotes} />
                <SubmitButton size="sm" variant="destructive" title="Reject this application.">
                  Reject
                </SubmitButton>
              </form>
            </div>
            {reviewState && !reviewState.success && (
              <p className="text-xs text-red-600">{reviewState.error}</p>
            )}
            {reviewState && reviewState.success && (
              <p className="text-xs text-emerald-600">Application review decision saved.</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Add an internal note to this application timeline."
            onClick={() => setShowNoteForm((value) => !value)}
          >
            <MessageSquareText className="mr-1 h-4 w-4" />
            Add note
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Record a screening score for this applicant."
            onClick={() => setShowScoreForm((value) => !value)}
          >
            <FileSearch className="mr-1 h-4 w-4" />
            Record score
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Show or hide timeline events for this application."
            onClick={() => setShowEvents((value) => !value)}
          >
            {showEvents ? (
              <ChevronUp className="mr-1 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-1 h-4 w-4" />
            )}
            Timeline
          </Button>
        </div>

        {showNoteForm && (
          <form action={noteAction} className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <input type="hidden" name="applicationId" value={application.id} />
            <Textarea name="message" placeholder="Add context for your team" required />
            <div className="flex justify-end">
              <SubmitButton size="sm" variant="outline" title="Save this application note.">
                Save note
              </SubmitButton>
            </div>
            {noteState && !noteState.success && <p className="text-xs text-red-600">{noteState.error}</p>}
            {noteState && noteState.success && (
              <p className="text-xs text-emerald-600">Application note saved.</p>
            )}
          </form>
        )}

        {showScoreForm && (
          <form action={scoreAction} className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <input type="hidden" name="applicationId" value={application.id} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                name="score"
                type="number"
                min={0}
                max={1000}
                step={1}
                placeholder="Score (0-1000)"
                required
              />
              <Input name="summary" placeholder="Summary (optional)" />
            </div>
            <div className="flex justify-end">
              <SubmitButton size="sm" variant="outline" title="Save manual screening score.">
                Save score
              </SubmitButton>
            </div>
            {scoreState && !scoreState.success && (
              <p className="text-xs text-red-600">{scoreState.error}</p>
            )}
            {scoreState && scoreState.success && (
              <p className="text-xs text-emerald-600">Screening score saved.</p>
            )}
          </form>
        )}

        {showEvents && (
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Event timeline</p>
            {application.events.length === 0 ? (
              <EmptyState message="No timeline events recorded yet for this application." />
            ) : (
              <div className="space-y-2">
                {application.events.map((event) => (
                  <div key={event.id} className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="outline" className="uppercase">
                        {event.eventType.replaceAll("_", " ")}
                      </Badge>
                      <p className="text-[11px] text-zinc-500">{formatDateTime(event.createdAt)}</p>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">
                      {event.actorEmail ? `By ${event.actorEmail}` : "System event"}
                    </p>
                    {event.message && <p className="mt-1 text-xs text-zinc-700">{event.message}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ApplicationsSection({
  applications,
  listings,
  properties,
  pipelineReady = true,
  pipelineWarning = null,
  onCreateApplication,
  onReviewApplication,
  onAddApplicationNote,
  onRecordScreeningScore
}: ApplicationsSectionProps) {
  const [createState, createAction] = useFormState(onCreateApplication ?? unavailableAction, null);
  const [selectedListingId, setSelectedListingId] = useState(listings[0]?.id ?? "");

  const listingToProperty = useMemo(
    () => new Map(listings.map((listing) => [listing.id, listing.propertyId])),
    [listings]
  );

  const selectedPropertyId = selectedListingId ? listingToProperty.get(selectedListingId) ?? "" : "";

  const groupedApplications = useMemo(() => {
    const grouped = new Map<"submitted" | "in_review" | "approved" | "rejected", ApplicationDTO[]>();

    for (const section of sections) {
      grouped.set(section.id, applications.filter((application) => section.statuses.includes(application.status)));
    }

    return grouped;
  }, [applications]);

  const propertyNameById = useMemo(
    () => new Map(properties.map((property) => [property.id, property.name])),
    [properties]
  );

  return (
    <div id="applications" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Applications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-600">
            Review tenant applications, track screening outcomes, and document decisions before lease creation.
          </p>
          {!pipelineReady && (
            <Alert variant="warning" className="text-xs font-normal">
              {pipelineWarning ?? "Application pipeline requires a database update before it can be used."}
            </Alert>
          )}
          <form action={createAction} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Create application</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select
                name="listingId"
                value={selectedListingId}
                onChange={(event) => setSelectedListingId(event.target.value)}
                required
              >
                <option value="">Select listing</option>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.headline} — {propertyNameById.get(listing.propertyId) ?? listing.propertyName}
                  </option>
                ))}
              </Select>
              <Input name="applicantEmail" placeholder="Applicant email" type="email" required />
              <Input name="applicantName" placeholder="Applicant name" />
              <Input name="applicantPhone" placeholder="Applicant phone" />
              <Input name="source" placeholder="Application source (optional)" />
            </div>
            <Textarea name="notes" className="mt-2" placeholder="Internal note (optional)" />
            <input type="hidden" name="propertyId" value={selectedPropertyId} />
            <div className="mt-2 flex justify-end">
              <SubmitButton size="sm" title="Create a submitted application for review.">
                Create application
              </SubmitButton>
            </div>
            {createState && !createState.success && (
              <p className="mt-2 text-xs text-red-600">{createState.error}</p>
            )}
            {createState && createState.success && (
              <p className="mt-2 text-xs text-emerald-600">Application created.</p>
            )}
          </form>
        </CardContent>
      </Card>

      {applications.length === 0 ? (
        <EmptyState message="No applications yet. Create one from a listing to start the review pipeline." />
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const sectionApplications = groupedApplications.get(section.id) ?? [];

            return (
              <Card key={section.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">{section.heading}</CardTitle>
                  <Badge variant={section.badgeVariant}>{sectionApplications.length}</Badge>
                </CardHeader>
                <CardContent>
                  {sectionApplications.length === 0 ? (
                    <EmptyState message={`No ${section.heading.toLowerCase()} applications right now.`} />
                  ) : (
                    <div className="space-y-3">
                      {sectionApplications.map((application) => (
                        <ApplicationCard
                          key={application.id}
                          application={application}
                          onReviewApplication={onReviewApplication}
                          onAddApplicationNote={onAddApplicationNote}
                          onRecordScreeningScore={onRecordScreeningScore}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="text-xs text-zinc-500">
        <p>
          Screening scores are manually recorded (0-1000). Use timeline notes to document reviewer rationale.
        </p>
        {applications[0]?.submittedAt && (
          <p className="mt-1">Most recent submission: {formatDateTime(applications[0].submittedAt)}</p>
        )}
      </div>
    </div>
  );
}
