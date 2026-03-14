export default function ReportsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="domus-skeleton h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="domus-skeleton h-40 rounded-2xl" />)}
      </div>
      <div className="domus-card space-y-4 p-6">
        <div className="flex gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="domus-skeleton h-9 w-24 rounded-lg" />)}</div>
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="domus-skeleton h-10 w-full rounded-lg" />)}</div>
      </div>
    </div>
  );
}
