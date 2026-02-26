import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/shared/submit-button";
import { LogOut, CheckCircle2 } from "lucide-react";

interface RoleShellProps {
  title: string;
  subtitle: string;
  bullets: string[];
  onSignOut: (formData: FormData) => Promise<void>;
}

export function RoleShell({ title, subtitle, bullets, onSignOut }: RoleShellProps) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-[#fafafa] px-4 py-12">
      <Card className="w-full max-w-2xl">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">{title}</h1>
              <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
            </div>
            <form action={onSignOut}>
              <SubmitButton variant="outline" size="sm">
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign out
              </SubmitButton>
            </form>
          </div>

          <div className="mt-6 space-y-3">
            {bullets.map((bullet) => (
              <div key={bullet} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-500" />
                <p className="text-sm text-zinc-700">{bullet}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
