"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type SortingState,
} from "@tanstack/react-table"

import { type DateRange } from "react-day-picker"
import { es } from "date-fns/locale"

import { createClient } from "@/lib/supabase/client"
import { ADMIN_EMAIL } from "@/lib/admin"
import type { Category, Member, Transaction } from "@/lib/types"
import { EditTransactionSheet } from "@/components/edit-transaction-sheet"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { cn, formatOccurred } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowUpDownIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  FunnelIcon,
  XIcon,
} from "lucide-react"

function formatMoney(n: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(n)
}

// A direct-payment pair (expense + the payer's contribution) collapsed into a
// single representative row. `_pair` carries both underlying movements so the
// row can be expanded and edited/deleted together.
type PairInfo = { expense: Transaction; income: Transaction; payer: Member | null }
type Row = Transaction & { _pair?: PairInfo }

// Collapse direct-payment pairs (same group_id) into one representative row,
// built from the expense but showing the payer. Rows whose pair is incomplete
// in the current (filtered) set are shown individually so filters still work.
function buildGroupedRows(rows: Transaction[]): Row[] {
  const byGroup = new Map<string, Transaction[]>()
  for (const t of rows) {
    if (!t.group_id) continue
    const arr = byGroup.get(t.group_id) ?? []
    arr.push(t)
    byGroup.set(t.group_id, arr)
  }
  const usedGroups = new Set<string>()
  const result: Row[] = []
  for (const t of rows) {
    if (!t.group_id) {
      result.push(t)
      continue
    }
    const arr = byGroup.get(t.group_id)!
    const expense = arr.find((r) => r.type === "expense")
    const income = arr.find((r) => r.type === "income")
    if (arr.length === 2 && expense && income) {
      if (usedGroups.has(t.group_id)) continue
      usedGroups.add(t.group_id)
      const payer = income.members ?? null
      result.push({ ...expense, members: payer, _pair: { expense, income, payer } })
    } else {
      result.push(t)
    }
  }
  return result
}

// Parse a "YYYY-MM-DD" string into a local Date, avoiding the UTC shift that
// `new Date("YYYY-MM-DD")` would introduce.
function parseISODate(s: string): Date | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

// Format a Date into a "YYYY-MM-DD" string using its local components, matching
// the format stored in the URL and used for the day-string comparison filter.
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Accent- and case-insensitive text, used by the description column filter.
function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

const SOURCE_LABELS: Record<Transaction["source"], string> = {
  manual: "Manual",
  receipt: "Ticket",
  csv: "CSV",
  bank: "Banco",
  general: "General",
}

const SOURCE_OPTIONS = Object.keys(SOURCE_LABELS) as Transaction["source"][]

// Per-origin badge styling. Bank and manual (directos) use two contrasting
// shades of grey; the rest keep the neutral outline look.
const SOURCE_BADGE_CLASS: Partial<Record<Transaction["source"], string>> = {
  bank: "border-transparent bg-slate-700 text-white",
  manual: "border-slate-300 bg-slate-100 text-slate-700",
}

const PER_PAGE_STORAGE_KEY = "transactions-per-page"
const PER_PAGE_QUERY_PARAM = "perPage"
const PER_PAGE_OPTIONS = ["25", "50", "100", "all"] as const
type PerPageOption = (typeof PER_PAGE_OPTIONS)[number]

function isPerPageOption(value: string | null | undefined): value is PerPageOption {
  return !!value && (PER_PAGE_OPTIONS as readonly string[]).includes(value)
}

// Parse a comma-separated multi-select URL param into an array of values.
function parseListParam(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : []
}

// Default table order: most recent movement first. Kept out of the URL so a
// shared link only carries an explicit `sort` when the user changed it.
const DEFAULT_SORT: SortingState = [{ id: "occurred_on", desc: true }]

function parseSortParam(value: string | null): SortingState {
  if (value) {
    const [id, dir] = value.split(":")
    if (id) return [{ id, desc: dir !== "asc" }]
  }
  return DEFAULT_SORT
}

// Serialize to "<column>:<asc|desc>", returning "" when it matches the default.
function serializeSort(sorting: SortingState): string {
  const s = sorting[0]
  if (!s) return ""
  if (s.id === DEFAULT_SORT[0].id && s.desc) return ""
  return `${s.id}:${s.desc ? "desc" : "asc"}`
}

export function TransactionsDataTable({
  data: initialData,
  categories,
  members,
}: {
  data: Transaction[]
  categories: Category[]
  members: Member[]
}) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [data, setData] = React.useState(initialData)
  // Initialize every per-column filter, sort and pagination value from the URL
  // so the view is fully shareable. useSearchParams returns the same value on
  // the server and on the client for this dynamic page: no hydration mismatch.
  const [sorting, setSorting] = React.useState<SortingState>(() =>
    parseSortParam(searchParams.get("sort"))
  )
  const [descFilter, setDescFilter] = React.useState(
    () => searchParams.get("q") ?? ""
  )
  // Categorical filters are multi-select: an array of selected ids/values.
  // Empty means "no filter". Serialized to the URL as a comma-separated list.
  const [categoryFilter, setCategoryFilter] = React.useState<string[]>(() =>
    parseListParam(searchParams.get("category"))
  )
  const [memberFilter, setMemberFilter] = React.useState<string[]>(() =>
    parseListParam(searchParams.get("member"))
  )
  const [sourceFilter, setSourceFilter] = React.useState<string[]>(() =>
    parseListParam(searchParams.get("source"))
  )
  const [dateFrom, setDateFrom] = React.useState(
    () => searchParams.get("from") ?? ""
  )
  const [dateTo, setDateTo] = React.useState(() => searchParams.get("to") ?? "")
  const [amountMin, setAmountMin] = React.useState(
    () => searchParams.get("min") ?? ""
  )
  const [amountMax, setAmountMax] = React.useState(
    () => searchParams.get("max") ?? ""
  )
  const [editing, setEditing] = React.useState<Transaction | null>(null)
  // The paired contribution row when editing a direct payment (kept in sync).
  const [editingSibling, setEditingSibling] = React.useState<Transaction | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [expanded, setExpanded] = React.useState<ExpandedState>({})
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [perPage, setPerPage] = React.useState<PerPageOption>(() => {
    const fromQuery = searchParams.get(PER_PAGE_QUERY_PARAM)
    return isPerPageOption(fromQuery) ? fromQuery : "25"
  })
  const [pageIndex, setPageIndex] = React.useState(() => {
    const page = Number(searchParams.get("page"))
    return Number.isInteger(page) && page > 1 ? page - 1 : 0
  })

  React.useEffect(() => setData(initialData), [initialData])

  // When the URL carries no explicit perPage, fall back to the last value the
  // user chose (persisted in localStorage). The URL always wins over storage.
  React.useEffect(() => {
    if (searchParams.get(PER_PAGE_QUERY_PARAM)) return
    const fromStorage = window.localStorage.getItem(PER_PAGE_STORAGE_KEY)
    if (isPerPageOption(fromStorage)) setPerPage(fromStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect the current state back into the URL without reloading the page or
  // re-running the server component (native History API integrates with the
  // Next.js router), so the link can be copied and shared.
  React.useEffect(() => {
    const params = new URLSearchParams()
    if (descFilter) params.set("q", descFilter)
    if (categoryFilter.length) params.set("category", categoryFilter.join(","))
    if (memberFilter.length) params.set("member", memberFilter.join(","))
    if (sourceFilter.length) params.set("source", sourceFilter.join(","))
    if (dateFrom) params.set("from", dateFrom)
    if (dateTo) params.set("to", dateTo)
    if (amountMin) params.set("min", amountMin)
    if (amountMax) params.set("max", amountMax)
    const sort = serializeSort(sorting)
    if (sort) params.set("sort", sort)
    if (perPage !== "25") params.set(PER_PAGE_QUERY_PARAM, perPage)
    if (pageIndex > 0) params.set("page", String(pageIndex + 1))
    const qs = params.toString()
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname
    )
  }, [
    descFilter,
    categoryFilter,
    memberFilter,
    sourceFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    sorting,
    perPage,
    pageIndex,
  ])

  // Any filter change returns to the first page so the matching results are
  // visible. Skipped on the initial mount so a shared ?page=N link is honored.
  const isFirstFilterRun = React.useRef(true)
  React.useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false
      return
    }
    setPageIndex(0)
  }, [
    descFilter,
    categoryFilter,
    memberFilter,
    sourceFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
  ])

  function handlePerPageChange(value: string) {
    if (!isPerPageOption(value)) return
    setPerPage(value)
    setPageIndex(0)
    window.localStorage.setItem(PER_PAGE_STORAGE_KEY, value)
  }

  const hasActiveFilters =
    descFilter !== "" ||
    categoryFilter.length > 0 ||
    memberFilter.length > 0 ||
    sourceFilter.length > 0 ||
    dateFrom !== "" ||
    dateTo !== "" ||
    amountMin !== "" ||
    amountMax !== ""

  function clearFilters() {
    setDescFilter("")
    setCategoryFilter([])
    setMemberFilter([])
    setSourceFilter([])
    setDateFrom("")
    setDateTo("")
    setAmountMin("")
    setAmountMax("")
  }

  React.useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(user?.email === ADMIN_EMAIL)
    })
  }, [])

  function handleEdit(row: Row) {
    if (row._pair) {
      // Edit the expense; the contribution is synced from within the sheet.
      setEditing(row._pair.expense)
      setEditingSibling(row._pair.income)
    } else {
      setEditing(row)
      setEditingSibling(null)
    }
    setEditOpen(true)
  }

  function handleView(row: Row) {
    // Direct-payment pairs use the expense as the representative row.
    const id = row._pair ? row._pair.expense.id : row.id
    router.push(`/transactions/${id}`)
  }

  function handleSaved(updated: Transaction) {
    setData((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }

  // Inline assignment for still-undefined category/member from the list.
  // Once a value is set, it becomes read-only here and can only be changed
  // from the edit sheet.
  const handleAssign = React.useCallback(
    async (
      transaction: Transaction,
      field: "category_id" | "assigned_member_id",
      value: string
    ) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("transactions")
        .update({ [field]: value })
        .eq("id", transaction.id)
        .select("*, categories(id, name, color), members(id, name, color)")
        .single()
      if (!error && data) {
        setData((prev) =>
          prev.map((t) =>
            t.id === transaction.id ? (data as unknown as Transaction) : t
          )
        )
      }
    },
    []
  )

  async function handleDelete(row: Row) {
    const supabase = createClient()
    if (row._pair) {
      const groupId = row.group_id
      if (
        !groupId ||
        !confirm(
          "Este movimiento es un pago directo (gasto + atribución). Se eliminarán los dos apuntes. ¿Continuar?"
        )
      )
        return
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("group_id", groupId)
      if (!error) {
        setData((prev) => prev.filter((t) => t.group_id !== groupId))
      }
      return
    }
    if (!confirm("¿Eliminar este movimiento? Esta acción no se puede deshacer.")) return
    const { error } = await supabase.from("transactions").delete().eq("id", row.id)
    if (!error) {
      setData((prev) => prev.filter((t) => t.id !== row.id))
    }
  }

  const filteredData = React.useMemo(() => {
    const needle = normalizeText(descFilter.trim())
    const min = amountMin ? Number(amountMin) : null
    const max = amountMax ? Number(amountMax) : null
    return data.filter((t) => {
      if (categoryFilter.length && !categoryFilter.includes(t.category_id ?? ""))
        return false
      if (
        memberFilter.length &&
        !memberFilter.includes(t.assigned_member_id ?? "")
      )
        return false
      if (sourceFilter.length && !sourceFilter.includes(t.source)) return false
      if (needle) {
        const hay = normalizeText(`${t.description ?? ""} ${t.merchant ?? ""}`)
        if (!hay.includes(needle)) return false
      }
      const day = (t.occurred_on ?? "").slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      const amount = Number(t.amount)
      if (min !== null && !Number.isNaN(min) && amount < min) return false
      if (max !== null && !Number.isNaN(max) && amount > max) return false
      return true
    })
  }, [
    data,
    descFilter,
    categoryFilter,
    memberFilter,
    sourceFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
  ])

  // Collapse direct-payment pairs after filtering, so a pair counts as one row.
  const groupedData = React.useMemo(
    () => buildGroupedRows(filteredData),
    [filteredData]
  )

  // Only offer origins actually present in the data, in the canonical order, so
  // the filter doesn't list sources that are never used (e.g. legacy csv/general).
  const availableSources = React.useMemo(() => {
    const present = new Set(data.map((t) => t.source))
    return SOURCE_OPTIONS.filter((s) => present.has(s))
  }, [data])

  const columns = React.useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: "expander",
        header: () => null,
        cell: ({ row }) => {
          const pair = (row.original as Row)._pair
          if (!pair) return null
          return (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={row.getToggleExpandedHandler()}
              aria-label={row.getIsExpanded() ? "Contraer" : "Expandir"}
            >
              <ChevronDownIcon
                className={`size-4 transition-transform ${
                  row.getIsExpanded() ? "rotate-180" : ""
                }`}
              />
            </Button>
          )
        },
      },
      {
        accessorKey: "occurred_on",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Fecha
            <ArrowUpDownIcon className="ml-1 size-3.5" />
          </Button>
        ),
        cell: ({ row }) => formatOccurred(row.original.occurred_on),
      },
      {
        id: "descripcion",
        header: "Descripción",
        accessorFn: (row) => row.description || row.merchant || "",
        cell: ({ row }) => (
          <div className="max-w-[240px]">
            <div className="truncate">
              {row.original.description || row.original.merchant || "—"}
            </div>
            {(row.original as Row)._pair && (
              <span className="text-xs text-muted-foreground">Pago directo</span>
            )}
          </div>
        ),
      },
      {
        id: "categoria",
        header: "Categoría",
        accessorFn: (row) => row.categories?.name || "",
        cell: ({ row }) =>
          row.original.categories ? (
            <span
              className="rounded-full px-2 py-0.5 text-xs text-white"
              style={{ backgroundColor: row.original.categories.color }}
            >
              {row.original.categories.name}
            </span>
          ) : (
            <Select
              onValueChange={(v) => handleAssign(row.original, "category_id", v)}
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue placeholder="Asignar..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ),
      },
      {
        id: "persona",
        header: "Persona",
        accessorFn: (row) => row.members?.name || "",
        cell: ({ row }) =>
          row.original.members ? (
            row.original.members.name || row.original.members.email || "—"
          ) : row.original.type !== "income" ? (
            "—"
          ) : (
            <Select
              onValueChange={(v) =>
                handleAssign(row.original, "assigned_member_id", v)
              }
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue placeholder="Asignar..." />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.email || "Sin nombre"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ),
      },
      {
        id: "fuente",
        header: "Origen",
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={SOURCE_BADGE_CLASS[row.original.source]}
          >
            {SOURCE_LABELS[row.original.source]}
          </Badge>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Importe
            <ArrowUpDownIcon className="ml-1 size-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div
            className={`text-right font-medium ${
              row.original.type === "expense" ? "text-red-600" : "text-emerald-600"
            }`}
          >
            {row.original.type === "expense" ? "-" : "+"}
            {formatMoney(Number(row.original.amount), row.original.currency)}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => handleView(row.original as Row)}
            >
              <EyeIcon />
              <span className="sr-only">Ver detalles</span>
            </Button>
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <EllipsisVerticalIcon />
                <span className="sr-only">Abrir menú</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isAdmin && (
                <DropdownMenuItem onClick={() => handleEdit(row.original as Row)}>
                  Editar
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => handleDelete(row.original as Row)}
                >
                  Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        ),
      } as ColumnDef<Transaction>,
    ],
    [isAdmin, categories, members, handleAssign]
  )

  const pageSize =
    perPage === "all" ? Math.max(groupedData.length, 1) : Number(perPage)

  const table = useReactTable({
    data: groupedData,
    columns,
    state: { sorting, pagination: { pageIndex, pageSize }, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getRowCanExpand: (row) => Boolean((row.original as Row)._pair),
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex, pageSize })
          : updater
      setPageIndex(next.pageIndex)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  // Whether a given column currently has an active filter (drives the funnel
  // icon's highlighted state).
  function isColumnFiltered(columnId: string): boolean {
    switch (columnId) {
      case "occurred_on":
        return Boolean(dateFrom || dateTo)
      case "descripcion":
        return descFilter !== ""
      case "categoria":
        return categoryFilter.length > 0
      case "persona":
        return memberFilter.length > 0
      case "fuente":
        return sourceFilter.length > 0
      case "amount":
        return Boolean(amountMin || amountMax)
      default:
        return false
    }
  }

  // The filter control shown inside the column's funnel popover. Each column
  // gets the control that fits its data type: searchable multi-select for
  // categorical columns, text for description, and range inputs for date/amount.
  function renderFilterPanel(columnId: string): React.ReactNode {
    switch (columnId) {
      case "occurred_on": {
        const range: DateRange | undefined =
          dateFrom || dateTo
            ? { from: parseISODate(dateFrom), to: parseISODate(dateTo) }
            : undefined
        return (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Rango de fechas
            </p>
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={range?.from}
              selected={range}
              onSelect={(next) => {
                setDateFrom(next?.from ? toISODate(next.from) : "")
                setDateTo(next?.to ? toISODate(next.to) : "")
              }}
              locale={es}
              autoFocus
            />
            <div className="flex justify-end border-t pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={!dateFrom && !dateTo}
                onClick={() => {
                  setDateFrom("")
                  setDateTo("")
                }}
              >
                Limpiar
              </Button>
            </div>
          </div>
        )
      }
      case "descripcion":
        return (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Buscar en descripción
            </p>
            <Input
              value={descFilter}
              onChange={(e) => setDescFilter(e.target.value)}
              placeholder="Texto..."
              className="h-8 text-xs"
              autoFocus
            />
            <div className="flex justify-end border-t pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={!descFilter}
                onClick={() => setDescFilter("")}
              >
                Limpiar
              </Button>
            </div>
          </div>
        )
      case "categoria":
        return (
          <MultiSelectFilter
            options={categories.map((c) => ({
              value: c.id,
              label: c.name,
              color: c.color,
            }))}
            selected={categoryFilter}
            onChange={setCategoryFilter}
            searchPlaceholder="Buscar categoría..."
            emptyLabel="Sin categorías"
          />
        )
      case "persona":
        return (
          <MultiSelectFilter
            options={members.map((m) => ({
              value: m.id,
              label: m.name || m.email || "Sin nombre",
              color: m.color,
            }))}
            selected={memberFilter}
            onChange={setMemberFilter}
            searchPlaceholder="Buscar persona..."
            emptyLabel="Sin personas"
          />
        )
      case "fuente":
        return (
          <MultiSelectFilter
            options={availableSources.map((s) => ({
              value: s,
              label: SOURCE_LABELS[s],
            }))}
            selected={sourceFilter}
            onChange={setSourceFilter}
            searchPlaceholder="Buscar origen..."
            emptyLabel="Sin orígenes"
          />
        )
      case "amount":
        return (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Rango de importe
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                placeholder="Mín"
                aria-label="Importe mínimo"
                className="h-8 text-xs"
              />
              <span className="text-xs text-muted-foreground">a</span>
              <Input
                type="number"
                inputMode="decimal"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                placeholder="Máx"
                aria-label="Importe máximo"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex justify-end border-t pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={!amountMin && !amountMax}
                onClick={() => {
                  setAmountMin("")
                  setAmountMax("")
                }}
              >
                Limpiar
              </Button>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  // Funnel button + popover placed next to each filterable column header, so no
  // extra header row is needed and no data row is pushed off-screen.
  function renderColumnFunnel(columnId: string) {
    const panel = renderFilterPanel(columnId)
    if (!panel) return null
    const active = isColumnFiltered(columnId)
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-6 shrink-0",
              active
                ? "text-primary hover:text-primary"
                : "text-muted-foreground/50"
            )}
            aria-label="Filtrar columna"
          >
            <FunnelIcon className={cn("size-3.5", active && "fill-current")} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={columnId === "occurred_on" ? "w-auto" : "w-64"}
        >
          {panel}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          "flex items-center gap-1",
                          header.column.id === "amount" && "justify-end"
                        )}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {renderColumnFunnel(header.column.id)}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const pair = (row.original as Row)._pair
                return (
                  <React.Fragment key={row.id}>
                    <TableRow>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {row.getIsExpanded() && pair && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={row.getVisibleCells().length} className="py-2">
                          <div className="space-y-1 pl-10 text-sm">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">
                                Gasto · {pair.expense.categories?.name || "sin categoría"}
                              </span>
                              <span className="font-medium text-red-600">
                                -{formatMoney(Number(pair.expense.amount), pair.expense.currency)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">
                                Atribución ·{" "}
                                {pair.payer?.name || pair.payer?.email || "sin persona"}
                              </span>
                              <span className="font-medium text-emerald-600">
                                +{formatMoney(Number(pair.income.amount), pair.income.currency)}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No hay movimientos que coincidan con los filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {filteredData.length} movimiento(s)
          </span>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={clearFilters}
            >
              <XIcon className="size-3.5" />
              Limpiar filtros
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Por página</span>
          <Select value={perPage} onValueChange={handlePerPageChange}>
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="text-sm font-medium">
            Página {table.getState().pagination.pageIndex + 1} de{" "}
            {Math.max(table.getPageCount(), 1)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>

      <EditTransactionSheet
        transaction={editing}
        sibling={editingSibling}
        categories={categories}
        members={members}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={handleSaved}
      />
    </div>
  )
}
