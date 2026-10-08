"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function YourDataSettings() {
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setError("");
    setDownloading(true);
    try {
      const response = await fetch("/api/account/export", { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Download is unavailable. Please try again.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="(domus-my-data-\d{4}-\d{2}-\d{2}\.json)"/)?.[1] ?? "domus-my-data.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Download is unavailable. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return <div className="space-y-4">
    <p className="text-sm text-[var(--ink-2)]">Get a copy of your Domus data as a file.</p>
    <Button type="button" onClick={download} disabled={downloading} title="Download your Domus data as a JSON file.">
      {downloading ? "Preparing download…" : "Download my data"}
    </Button>
    {error ? <p role="alert" className="text-sm text-[var(--crit)]">{error}</p> : null}
    <p className="text-sm text-[var(--ink-2)]">
      Want your account deleted? Tell us with Send feedback. We will reply by email.
    </p>
  </div>;
}
