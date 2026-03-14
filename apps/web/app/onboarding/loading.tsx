export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="domus-card w-full max-w-3xl space-y-6 p-8">
        <div className="domus-skeleton h-8 w-40" />
        <div className="domus-skeleton h-3 w-2/3" />
        <div className="domus-skeleton h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
