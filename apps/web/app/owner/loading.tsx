export default function OwnerLoading() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-64 flex-shrink-0 lg:block">
        <div className="gradient-sidebar h-full space-y-4 p-4">
          <div className="domus-skeleton h-8 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="domus-skeleton h-9 w-full rounded-lg" />)}
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-6 p-6">
        <div className="space-y-2">
          <div className="domus-skeleton h-8 w-64" />
          <div className="domus-skeleton h-4 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="domus-skeleton h-20 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="domus-card space-y-3 p-6">
              <div className="domus-skeleton h-4 w-1/3" />
              <div className="domus-skeleton h-3 w-2/3" />
              <div className="domus-skeleton h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
