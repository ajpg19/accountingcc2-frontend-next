"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"

import { createClient } from "@/lib/supabase/client"
import type { Category, Member, Transaction } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  EllipsisVerticalIcon,
} from "lucide-react"

function formatMoney(n: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(n)
}

const SOURCE_LABELS: Record<Transaction["source"], string> = {
  manual: "Manual",
  receipt: "Ticket",
  csv: "CSV",
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
  const [data, setData] = React.useState(initialData)
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "occurred_on", desc: true },
  ])
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")
  const [memberFilter, setMemberFilter] = React.useState<string>("all")

  React.useEffect(() => setData(initialData), [initialData])

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este movimiento? Esta acción no se puede deshacer.")) return
    const supabase = createClient()
    const { error } = await supabase.from("transactions").delete().eq("id", id)
    if (!error) {
      setData((prev) => prev.filter((t) => t.id !== id))
    }
  }

  const filteredData = React.useMemo(() => {
    return data.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false
      if (categoryFilter !== "all" && t.category_id !== categoryFilter) return false
      if (memberFilter !== "all" && t.assigned_member_id !== memberFilter) return false
      return true
    })
  }, [data, typeFilter, categoryFilter, memberFilter])

  const columns = React.useMemo<ColumnDef<Transaction>[]>(
    () => [
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
        cell: ({ row }) =>
          new Date(row.original.occurred_on).toLocaleDateString("es-ES"),
      },
      {
        id: "descripcion",
        header: "Descripción",
        accessorFn: (row) => row.description || row.merchant || "",
        cell: ({ row }) => (
          <div className="max-w-[240px] truncate">
            {row.original.description || row.original.merchant || "—"}
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
            "—"
          ),
      },
      {
        id: "persona",
        header: "Persona",
        accessorFn: (row) => row.members?.name || "",
        cell: ({ row }) => row.original.members?.name || "—",
      },
      {
        id: "fuente",
        header: "Origen",
        cell: ({ row }) => (
          <Badge variant="outline">{SOURCE_LABELS[row.original.source]}</Badge>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-mr-3 h-8 w-full justify-end"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <EllipsisVerticalIcon />
                <span className="sr-only">Abrir menú</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => handleDelete(row.original.id)}
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por descripción o comercio..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="expense">Gastos</SelectItem>
            <SelectItem value="income">Ingresos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={memberFilter} onValueChange={setMemberFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Persona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las personas</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
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

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredData.length} movimiento(s)
        </div>
        <div className="flex items-center gap-2">
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
    </div>
  )
}
