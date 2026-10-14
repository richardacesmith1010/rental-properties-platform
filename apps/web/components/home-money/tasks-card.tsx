"use client";
import { useState } from "react";
import type { AccountTask } from "@/lib/account-tasks";
import type { Partner } from "@/lib/partners";
import type { addTask, updateTask, removeTask, markTaskDone, addCommonTasks } from "@/app/actions/account-tasks";
import { TaskSheet } from "./task-sheet";

const frequencyLabel = { monthly: "Monthly", quarterly: "Every 3 months", yearly: "Yearly", as_needed: "As needed" };
function shortDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
export function TasksCard({ accountId, tasks, partners, onAdd, onUpdate, onRemove, onDone, onCommon }: {
  accountId: string; tasks: AccountTask[]; partners: Partner[];
  onAdd: typeof addTask; onUpdate: typeof updateTask; onRemove: typeof removeTask;
  onDone: typeof markTaskDone; onCommon: typeof addCommonTasks;
}) {
  const [sheet, setSheet] = useState<AccountTask | "add" | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const visible = tasks.filter((task) => !removedIds.includes(task.id));
  async function common() {
    setPending(true); const result = await onCommon(accountId); setPending(false);
    if (!result.ok) setError(result.error);
    else window.location.reload();
  }
  return <section className="domus-card space-y-3 rounded-2xl p-4" aria-label="Tasks">
    <h2 className="text-lg font-semibold">Tasks</h2>
    {!visible.length ? <><p className="text-sm text-[var(--muted)]">No shared tasks yet.</p>
      <div className="flex flex-wrap gap-2"><button type="button" title="Add common tasks" onClick={common} disabled={pending}
        className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-[var(--accent-contrast)]">Add common tasks</button>
        <button type="button" title="Add a task" onClick={() => setSheet("add")}
          className="domus-card min-h-11 rounded-xl px-4">Add a task</button></div></> : <>
      <div>{visible.map((task) => {
        const overdue = Boolean(task.nextDueOn && task.nextDueOn < today);
        const due = task.nextDueOn && !doneIds.includes(task.id)
          ? `${overdue ? "Overdue since" : "Due"} ${shortDate(task.nextDueOn)}` : null;
        return <div key={task.id}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 last:border-0">
          <div className="min-w-0 flex-1"><p className="font-medium">{task.title}</p>
            <p className="text-sm text-[var(--muted)]">{frequencyLabel[task.frequency]} · {task.ownerName ?? "Anyone"}
              {due && <> · <span className={overdue ? "text-[var(--warn)]" : ""}>{due}</span></>}</p>
            {doneIds.includes(task.id) && <p className="text-sm text-[var(--muted)]">Done {shortDate(today)}</p>}</div>
          <div className="flex items-center"><button type="button" title={`Done: ${task.title}`} disabled={doneIds.includes(task.id)}
            onClick={async () => {
              const result = await onDone(task.id);
              if (!result.ok) setError(result.error); else setDoneIds([...doneIds, task.id]);
            }} className="min-h-11 rounded-xl px-3 text-[var(--accent)]">Done</button>
            <div className="relative"><button type="button" title={`Options for ${task.title}`} aria-label={`Options for ${task.title}`}
              aria-expanded={menuId === task.id} onClick={() => setMenuId(menuId === task.id ? null : task.id)}
              className="min-h-11 min-w-11">⋯</button>
              {menuId === task.id && <div className="domus-card absolute right-0 z-10 min-w-28 rounded-xl p-1 shadow-lg">
                <button type="button" title={`Edit ${task.title}`} onClick={() => { setSheet(task); setMenuId(null); }}
                  className="min-h-11 w-full text-left px-3">Edit</button>
                <button type="button" title={`Remove ${task.title}`} onClick={async () => {
                  const result = await onRemove(accountId, task.id);
                  if (!result.ok) setError(result.error); else setRemovedIds([...removedIds, task.id]);
                  setMenuId(null);
                }} className="min-h-11 w-full text-left px-3">Remove</button></div>}</div></div>
        </div>;
      })}</div><button type="button" title="Add a task" onClick={() => setSheet("add")}
        className="domus-card min-h-11 rounded-xl px-4">Add a task</button></>}
    {error && <p role="alert" className="text-sm text-[var(--crit)]">{error}</p>}
    {sheet && <TaskSheet accountId={accountId} partners={partners} task={sheet === "add" ? undefined : sheet}
      onClose={() => setSheet(null)} onSave={sheet === "add" ? onAdd : onUpdate} />}
  </section>;
}
