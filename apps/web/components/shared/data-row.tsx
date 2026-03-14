interface DataRowProps {
  children: React.ReactNode;
  last?: boolean;
}

export function DataRow({ children, last }: DataRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl px-2 py-3.5 transition-all duration-150 hover:bg-violet-50/60 hover:-translate-y-[0.5px] hover:shadow-sm sm:px-3 ${
        last ? "" : "border-b border-violet-100/70"
      }`}
    >
      {children}
    </div>
  );
}
