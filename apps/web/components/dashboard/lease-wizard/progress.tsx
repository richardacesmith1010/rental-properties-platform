import { LEASE_WIZARD_STEP_TITLES, type LeaseWizardStep } from "../lease-wizard-support";

export function LeaseWizardProgress({ step }: { step: LeaseWizardStep }) {
  const current = step + 1;
  const percent = Math.round((current / LEASE_WIZARD_STEP_TITLES.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">
          Step {current} of {LEASE_WIZARD_STEP_TITLES.length}
        </span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LEASE_WIZARD_STEP_TITLES.map((label, index) => (
          <div
            key={label}
            className={[
              "rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-300",
              step === index
                ? "border-primary/40 bg-primary/10 text-foreground"
                : step > index
                  ? "border-[var(--pos)] bg-[var(--pos-bg)] text-[var(--pos)]"
                  : "border-border bg-card text-muted-foreground"
            ].join(" ")}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

