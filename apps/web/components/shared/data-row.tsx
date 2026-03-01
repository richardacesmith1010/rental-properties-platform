interface DataRowProps {
  children: React.ReactNode;
  last?: boolean;
}

export function DataRow({ children, last }: DataRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl px-2 py-3.5 transition-colors hover:bg-indigo-50/40 sm:px-3 ${
        last ? "" : "border-b border-indigo-100/70"
      }`}
    >
      {children}
    </div>
  );
}
