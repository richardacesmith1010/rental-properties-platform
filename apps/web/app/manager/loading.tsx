export default function Loading() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-56 border-r border-zinc-200 bg-zinc-50 p-4 md:block">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-8 animate-pulse rounded-lg bg-zinc-200" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-zinc-200" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-zinc-100" />
      </div>
    </div>
  );
}
