export default function CompleteProfileLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="domus-card w-full max-w-lg space-y-4 p-8">
        <div className="domus-skeleton h-8 w-40" />
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="space-y-2"><div className="domus-skeleton h-4 w-24" /><div className="domus-skeleton h-10 w-full rounded-xl" /></div>)}
      </div>
    </div>
  );
}
