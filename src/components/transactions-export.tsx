"use client"

import * as React from "react"

import type { Transaction } from "@/lib/types"
import { ExportTransactionsButton } from "@/components/export-transactions-button"

type ExportState = {
  // Rows the export should produce: the current selection when there is one,
  // otherwise every row matching the active filters.
  data: Transaction[]
  // Number of rows explicitly selected in the table (0 when none).
  selectedCount: number
}

type ExportContextValue = ExportState & {
  setExportState: (state: ExportState) => void
}

const ExportContext = React.createContext<ExportContextValue | null>(null)

// Shares the table's live export data with the header button, which renders
// outside the table and therefore can't reach its filter/selection state.
export function TransactionsExportProvider({
  initialData,
  children,
}: {
  initialData: Transaction[]
  children: React.ReactNode
}) {
  const [state, setState] = React.useState<ExportState>({
    data: initialData,
    selectedCount: 0,
  })
  const setExportState = React.useCallback(
    (next: ExportState) => setState(next),
    []
  )
  const value = React.useMemo(
    () => ({ ...state, setExportState }),
    [state, setExportState]
  )
  return (
    <ExportContext.Provider value={value}>{children}</ExportContext.Provider>
  )
}

export function useTransactionsExport() {
  const ctx = React.useContext(ExportContext)
  if (!ctx) {
    throw new Error(
      "useTransactionsExport must be used within a TransactionsExportProvider"
    )
  }
  return ctx
}

// Header button: reads the export data published by the table via context.
export function TransactionsExportButton() {
  const { data, selectedCount } = useTransactionsExport()
  return <ExportTransactionsButton data={data} selectedCount={selectedCount} />
}
