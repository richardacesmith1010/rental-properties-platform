interface DataRowProps {
  children: React.ReactNode;
  last?: boolean;
}

export function DataRow({ children, last }: DataRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3.5 ${
        last ? "" : "border-b border-zinc-100"
      }`}
    >
      {children}
    </div>
  );
}
