"use client";

export function LegalBackBar() {
  function back() {
    let sameOrigin = false;
    try { sameOrigin = new URL(document.referrer).origin === window.location.origin; } catch { /* No usable referrer. */ }
    if (sameOrigin) window.history.back();
    else window.location.assign("/login");
  }
  return <div className="sticky top-0 z-10 bg-[var(--surface)]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
    <button type="button" onClick={back} className="min-h-11 px-4 text-[var(--accent)]">‹ Back</button>
  </div>;
}
