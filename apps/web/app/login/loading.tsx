export default function LoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="domus-card w-full max-w-md space-y-4 p-8">
        <div className="domus-skeleton h-8 w-32" />
        <div className="domus-skeleton h-10 w-full rounded-xl" />
        <div className="domus-skeleton h-10 w-full rounded-xl" />
        <div className="domus-skeleton h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}
