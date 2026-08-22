"use client";

import { ArrowRight, Building2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LlcSetupPromptProps {
  accountName: string;
  memberCount: number;
  propertyCount: number;
  onInviteMembers: () => void;
  onAddProperty: () => void;
}

function StepRow({
  completed,
  label
}: {
  completed: boolean;
  label: string;
}) {
  const Icon = completed ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className={completed ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-muted-foreground"} />
      <span className={completed ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

export function LlcSetupPrompt({
  accountName,
  memberCount,
  propertyCount,
  onInviteMembers,
  onAddProperty
}: LlcSetupPromptProps) {
  const invitedMembers = memberCount > 1;
  const hasProperties = propertyCount > 0;

  return (
    <Card className="border border-border/70 bg-card shadow-sm">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-weak)] text-[var(--accent)]">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold text-foreground">Set up {accountName}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Get your LLC ready in 3 steps.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="space-y-3">
          <StepRow completed label="Create LLC account" />
          <StepRow completed={invitedMembers} label="Invite your co-owners" />
          <StepRow completed={hasProperties} label="Add properties" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={onInviteMembers}
            className="sm:min-w-[180px]"
            title="Open the LLC members page."
          >
            Invite Members
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onAddProperty}
            title="Open the property creation wizard."
          >
            Add Property
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
