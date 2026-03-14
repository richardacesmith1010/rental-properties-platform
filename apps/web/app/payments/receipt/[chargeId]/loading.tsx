export default function ReceiptLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="domus-card space-y-4 p-8">
        <div className="domus-skeleton h-8 w-48" />
        <div className="domus-skeleton h-4 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="domus-skeleton h-10 w-full rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}
