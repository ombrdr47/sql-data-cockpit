/**
 * components/DataTable.tsx
 * Interactive TanStack Table for SQL query results.
 *
 * Features:
 *   - Column sorting (click header to sort asc/desc/unsorted)
 *   - Client-side pagination (10 rows/page default)
 *   - Row count badge + column count
 *   - One-click CSV export
 *   - Responsive horizontal scrolling
 *   - Expandable/collapsible with smooth animation
 */
import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { motion, AnimatePresence } from 'framer-motion'

interface DataTableProps {
  columns: string[]
  rows: Record<string, unknown>[]
  totalRows?: number
}

function exportToCsv(columns: string[], rows: Record<string, unknown>[], filename = 'query_results.csv') {
  const header = columns.join(',')
  const body = rows.map(row =>
    columns.map(col => {
      const val = String(row[col] ?? '')
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"`
        : val
    }).join(',')
  ).join('\n')

  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function DataTable({ columns, rows, totalRows }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [isExpanded, setIsExpanded] = useState(true)
  const [pageSize, setPageSize] = useState(10)

  const tableCols = useMemo<ColumnDef<Record<string, unknown>>[]>(() =>
    columns.map(col => ({
      accessorKey: col,
      header: col,
      cell: info => {
        const val = info.getValue()
        if (val === null || val === undefined) {
          return <span className="text-slate-600 italic text-xs">null</span>
        }
        const str = String(val)
        return (
          <span
            className="block max-w-[200px] truncate"
            title={str}
          >
            {str}
          </span>
        )
      },
    })),
    [columns]
  )

  const table = useReactTable({
    data: rows,
    columns: tableCols,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const displayedCount = totalRows ?? rows.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-3"
    >
      <div className="bg-surface-900 border border-slate-700/50 rounded-xl overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            {/* Table icon */}
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 10h18M3 14h18M10 3v18M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z" />
            </svg>
            <span className="text-xs text-slate-300 font-medium">Query Results</span>
            <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
              {displayedCount.toLocaleString()} rows · {columns.length} cols
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Export CSV */}
            <button
              id="export-csv-btn"
              onClick={() => exportToCsv(columns, rows)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-400 transition-colors"
              title="Export to CSV"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              CSV
            </button>

            {/* Collapse/expand */}
            <button
              onClick={() => setIsExpanded(v => !v)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    {table.getHeaderGroups().map(headerGroup => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <th
                            key={header.id}
                            onClick={header.column.getToggleSortingHandler()}
                            className={`
                              px-3 py-2.5 text-left font-medium text-slate-400
                              bg-surface-800 border-b border-slate-700/50
                              whitespace-nowrap select-none
                              ${header.column.getCanSort()
                                ? 'cursor-pointer hover:text-white hover:bg-surface-700'
                                : ''}
                              transition-colors duration-150
                            `}
                          >
                            <div className="flex items-center gap-1">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getCanSort() && (
                                <span className="text-slate-600 ml-0.5">
                                  {header.column.getIsSorted() === 'asc' ? ' ↑' :
                                   header.column.getIsSorted() === 'desc' ? ' ↓' :
                                   ' ⇅'}
                                </span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row, rowIdx) => (
                      <tr
                        key={row.id}
                        className={`
                          border-b border-slate-700/30
                          ${rowIdx % 2 === 0 ? 'bg-transparent' : 'bg-surface-900/40'}
                          hover:bg-white/3 transition-colors duration-100
                        `}
                      >
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} className="px-3 py-2 text-slate-200 max-w-xs">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {table.getRowModel().rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className="px-4 py-6 text-center text-slate-500"
                        >
                          No results
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination bar */}
              {table.getPageCount() > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-700/50 bg-surface-900/50">
                  <span className="text-xs text-slate-500">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                    {' · '}Showing rows {table.getState().pagination.pageIndex * pageSize + 1}–
                    {Math.min((table.getState().pagination.pageIndex + 1) * pageSize, rows.length)}
                    {' '}of {displayedCount.toLocaleString()}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                      className="px-2 py-1 text-xs rounded border border-slate-700 text-slate-400
                                 hover:text-white hover:border-slate-500 disabled:opacity-30
                                 disabled:cursor-not-allowed transition-colors"
                    >
                      ‹ Prev
                    </button>
                    <button
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                      className="px-2 py-1 text-xs rounded border border-slate-700 text-slate-400
                                 hover:text-white hover:border-slate-500 disabled:opacity-30
                                 disabled:cursor-not-allowed transition-colors"
                    >
                      Next ›
                    </button>

                    {/* Page size selector */}
                    <select
                      value={pageSize}
                      onChange={e => {
                        const s = Number(e.target.value)
                        setPageSize(s)
                        table.setPageSize(s)
                      }}
                      className="ml-2 text-xs bg-surface-800 border border-slate-700 text-slate-400
                                 rounded px-1.5 py-1 focus:outline-none focus:border-slate-500"
                    >
                      {[10, 25, 50, 100].map(s => (
                        <option key={s} value={s}>{s} / page</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
