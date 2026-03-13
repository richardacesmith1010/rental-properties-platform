import { describe, expect, it, vi } from "vitest";
import {
  getMaintenanceTimeline,
  logMaintenanceStatusChange
} from "../maintenance";

describe("maintenance timeline helpers", () => {
  it("inserts a status history row when logging changes", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert
      })
    };

    await logMaintenanceStatusChange(
      supabase as never,
      "ticket-1",
      "submitted",
      "in_progress",
      "user-1",
      "Vendor assigned"
    );

    expect(supabase.from).toHaveBeenCalledWith("maintenance_status_history");
    expect(insert).toHaveBeenCalledWith({
      ticket_id: "ticket-1",
      from_status: "submitted",
      to_status: "in_progress",
      changed_by: "user-1",
      notes: "Vendor assigned"
    });
  });

  it("returns ordered timeline entries from the status history table", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "history-1",
          ticket_id: "ticket-1",
          from_status: null,
          to_status: "submitted",
          changed_by: null,
          notes: null,
          created_at: "2026-03-10T09:00:00.000Z"
        },
        {
          id: "history-2",
          ticket_id: "ticket-1",
          from_status: "submitted",
          to_status: "reviewed",
          changed_by: null,
          notes: "Reviewed by team",
          created_at: "2026-03-10T10:00:00.000Z"
        }
      ],
      error: null
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ in: eq });
    const supabase = {
      from: vi.fn().mockReturnValue({ select })
    };

    const timeline = await getMaintenanceTimeline(supabase as never, "ticket-1");

    expect(timeline).toEqual([
      {
        id: "history-1",
        ticketId: "ticket-1",
        fromStatus: null,
        toStatus: "submitted",
        changedBy: null,
        changedByName: "Domus",
        notes: null,
        createdAt: "2026-03-10T09:00:00.000Z"
      },
      {
        id: "history-2",
        ticketId: "ticket-1",
        fromStatus: "submitted",
        toStatus: "reviewed",
        changedBy: null,
        changedByName: "Domus",
        notes: "Reviewed by team",
        createdAt: "2026-03-10T10:00:00.000Z"
      }
    ]);
  });
});
