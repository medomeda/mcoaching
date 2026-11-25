import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({ columns, rows, empty, rowKey }: { columns: Column<T>[]; rows: T[]; empty: string; rowKey: (row: T) => string }) {
  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>{columns.map((c) => <th key={c.header} scope="col" className="px-4 py-3 font-semibold">{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={rowKey(r)}>{columns.map((c) => <td key={c.header} className={`px-4 py-3 ${c.className ?? ""}`}>{c.cell(r)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
