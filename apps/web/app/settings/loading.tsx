export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="domus-skeleton h-8 w-32" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="domus-skeleton h-9 w-24 rounded-lg" />)}
      </div>
      <div className="domus-card space-y-4 p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="domus-skeleton h-4 w-20" />
            <div className="domus-skeleton h-10 w-full rounded-xl" />
          </div>
        ))}
        <div className="domus-skeleton h-10 w-32 rounded-xl" />
      </div>
    </div>
  );
}
