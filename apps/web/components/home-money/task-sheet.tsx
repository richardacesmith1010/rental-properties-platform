"use client";
import { useState } from "react";
import type { AccountTask, TaskFrequency } from "@/lib/account-tasks";
import type { Partner } from "@/lib/partners";
import type { addTask, updateTask } from "@/app/actions/account-tasks";

export function TaskSheet({ accountId, partners, task, onClose, onSave }: {
  accountId: string; partners: Partner[]; task?: AccountTask; onClose: () => void;
  onSave: typeof addTask | typeof updateTask;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [frequency, setFrequency] = useState<TaskFrequency>(task?.frequency ?? "monthly");
  const [nextDueOn, setNextDueOn] = useState(task?.nextDueOn ?? new Date().toISOString().slice(0, 10));
  const [ownerPartnerId, setOwnerPartnerId] = useState(task?.ownerPartnerId ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setPending(true);
    const input = { accountId, title, frequency, nextDueOn: frequency === "as_needed" ? null : nextDueOn,
      ownerPartnerId: ownerPartnerId || null };
    const result = task ? await (onSave as typeof updateTask)({ ...input, taskId: task.id })
      : await (onSave as typeof addTask)(input);
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    onClose();
  }
  return <div role="dialog" aria-modal="true" aria-label={task ? "Edit" : "Add a task"}
    className="domus-card rounded-2xl p-4">
    <form onSubmit={save} className="space-y-3">
      <h3 className="text-lg font-semibold">{task ? "Edit" : "Add a task"}</h3>
      <label className="block text-sm font-medium">Title
        <input className="domus-input mt-1 min-h-11 w-full" value={title} maxLength={80} required
          onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="block text-sm font-medium">How often
        <select className="domus-input mt-1 min-h-11 w-full" value={frequency}
          onChange={(event) => setFrequency(event.target.value as TaskFrequency)}>
          <option value="monthly">Monthly</option><option value="quarterly">Every 3 months</option>
          <option value="yearly">Yearly</option><option value="as_needed">As needed</option>
        </select></label>
      {frequency !== "as_needed" && <label className="block text-sm font-medium">Next due
        <input className="domus-input mt-1 min-h-11 w-full" type="date" value={nextDueOn} required
          onChange={(event) => setNextDueOn(event.target.value)} /></label>}
      <label className="block text-sm font-medium">Who does it
        <select className="domus-input mt-1 min-h-11 w-full" value={ownerPartnerId}
          onChange={(event) => setOwnerPartnerId(event.target.value)}>
          <option value="">Anyone</option>{partners.filter((partner) => partner.active).map((partner) =>
            <option key={partner.id} value={partner.id}>{partner.displayName}</option>)}</select></label>
      {error && <p role="alert" className="text-sm text-[var(--crit)]">{error}</p>}
      <div className="flex gap-2"><button type="button" title="Close" onClick={onClose}
        className="domus-card min-h-11 rounded-xl px-4">Close</button>
        <button type="submit" title="Save" disabled={pending}
          className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-[var(--accent-contrast)]">Save</button></div>
    </form>
  </div>;
}
