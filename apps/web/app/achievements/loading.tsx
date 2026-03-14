export default function AchievementsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="domus-skeleton h-8 w-48" />
      <div className="domus-card p-4">
        <div className="domus-skeleton h-4 w-full rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="domus-card space-y-3 p-5">
            <div className="flex items-center gap-3">
              <div className="domus-skeleton h-10 w-10 rounded-lg" />
              <div className="domus-skeleton h-5 w-32" />
            </div>
            <div className="domus-skeleton h-3 w-full" />
            <div className="domus-skeleton h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
