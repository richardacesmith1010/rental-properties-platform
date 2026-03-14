export default function TenantLoading() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-64 flex-shrink-0 lg:block">
        <div className="gradient-sidebar h-full space-y-4 p-4">
          <div className="domus-skeleton h-8 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="domus-skeleton h-9 w-full rounded-lg" />)}
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-6 p-6">
        <div className="domus-card space-y-3 p-6">
          <div className="domus-skeleton h-6 w-48" />
          <div className="domus-skeleton h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="domus-card space-y-2 p-5">
              <div className="domus-skeleton h-4 w-20" />
              <div className="domus-skeleton h-8 w-24" />
            </div>
          ))}
        </div>
        <div className="domus-card space-y-4 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="domus-skeleton h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="domus-skeleton h-4 w-1/3" />
                <div className="domus-skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
