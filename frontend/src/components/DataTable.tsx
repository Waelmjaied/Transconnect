import type { ReactNode } from 'react'

export type Column<T> = { key: string; header: string; render: (row: T) => ReactNode; className?: string }

export function DataTable<T>({ columns, rows, rowKey, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number; empty?: string }) {
  if (rows.length === 0 && empty) return <p className="mini-empty">{empty}</p>
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col">{c.header}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((c) => <td key={c.key} className={c.className} data-label={c.header}>{c.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
