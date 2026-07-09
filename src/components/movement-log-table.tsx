"use client"

import * as React from "react"

import type { Category, Member, MovementLog } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
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
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

const ACTION_LABELS: Record<MovementLog["action"], string> = {
  insert: "Creado",
  update: "Editado",
  delete: "Eliminado",
}

const ACTION_VARIANTS: Record<MovementLog["action"], "default" | "destructive" | "secondary"> = {
  insert: "default",
  update: "secondary",
  delete: "destructive",
}

// Campos que no aportan nada útil en el detalle de cambios (ruido o
// duplicados de otras columnas).
const IGNORED_FIELDS = new Set(["id", "created_at", "raw_import_row"])

const FIELD_LABELS: Record<string, string> = {
  type: "Tipo",
  amount: "Importe",
  currency: "Moneda",
  description: "Descripción",
  merchant: "Comercio",
  occurred_on: "Fecha",
  category_id: "Categoría",
  assigned_member_id: "Persona",
  source: "Origen",
  created_by: "Creado por",
}

function formatMoney(n: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(n)
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

export function MovementLogTable({
  data,
  categories,
  members,
}: {
  data: MovementLog[]
  categories: Category[]
  members: Member[]
}) {
  const [actionFilter, setActionFilter] = React.useState<string>("all")
  const [search, setSearch] = React.useState("")
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  const categoryById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  )
  const memberById = React.useMemo(
    () => new Map(members.map((m) => [m.id, m.name || "Sin nombre"])),
    [members]
  )

  function resolveValue(field: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—"
    if (field === "category_id") return categoryById.get(String(value)) || String(value)
    if (field === "assigned_member_id") return memberById.get(String(value)) || String(value)
    if (field === "amount") return formatMoney(Number(value))
    if (field === "type") return value === "expense" ? "Gasto" : "Ingreso"
    if (field === "source") return { manual: "Manual", receipt: "Ticket", csv: "CSV", bank: "Banco", general: "General" }[String(value)] || String(value)
    return String(value)
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = React.useMemo(() => {
    return data.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false
      if (search) {
        const record = (log.new_data || log.old_data || {}) as Record<string, unknown>
        const haystack = `${record.description ?? ""} ${record.merchant ?? ""} ${log.changed_by ?? ""}`.toLowerCase()
        if (!haystack.includes(search.toLowerCase())) return false
      }
      return true
    })
  }, [data, actionFilter, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por descripción, comercio o usuario..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="insert">Creado</SelectItem>
            <SelectItem value="update">Editado</SelectItem>
            <SelectItem value="delete">Eliminado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Fecha</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Movimiento</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((log) => {
                const record = (log.new_data || log.old_data || {}) as Record<string, unknown>
                const isOpen = expanded.has(log.id)
                const changedFields =
                  log.action === "update" && log.old_data && log.new_data
                    ? Object.keys({ ...log.old_data, ...log.new_data }).filter(
                        (f) =>
                          !IGNORED_FIELDS.has(f) &&
                          JSON.stringify((log.old_data as Record<string, unknown>)[f]) !==
                            JSON.stringify((log.new_data as Record<string, unknown>)[f])
                      )
                    : []

                return (
                  <React.Fragment key={log.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggleExpanded(log.id)}
                    >
                      <TableCell>
                        {isOpen ? (
                          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(log.changed_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ACTION_VARIANTS[log.action]}>
                          {ACTION_LABELS[log.action]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.changed_by || "—"}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate">
                        {String(record.description ?? record.merchant ?? "—")}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          record.type === "expense" ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {record.amount != null
                          ? `${record.type === "expense" ? "-" : "+"}${formatMoney(
                              Number(record.amount),
                              String(record.currency ?? "EUR")
                            )}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40">
                          {log.action === "update" ? (
                            changedFields.length ? (
                              <ul className="space-y-1 py-1 text-sm">
                                {changedFields.map((field) => (
                                  <li key={field}>
                                    <span className="font-medium">
                                      {FIELD_LABELS[field] || field}:
                                    </span>{" "}
                                    <span className="text-muted-foreground line-through">
                                      {resolveValue(
                                        field,
                                        (log.old_data as Record<string, unknown>)[field]
                                      )}
                                    </span>{" "}
                                    →{" "}
                                    {resolveValue(
                                      field,
                                      (log.new_data as Record<string, unknown>)[field]
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="py-1 text-sm text-muted-foreground">
                                Sin cambios en campos relevantes.
                              </p>
                            )
                          ) : (
                            <ul className="space-y-1 py-1 text-sm">
                              {Object.entries(record)
                                .filter(([f]) => !IGNORED_FIELDS.has(f))
                                .map(([field, value]) => (
                                  <li key={field}>
                                    <span className="font-medium">
                                      {FIELD_LABELS[field] || field}:
                                    </span>{" "}
                                    {resolveValue(field, value)}
                                  </li>
                                ))}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No hay registros en el historial.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        {filtered.length} registro(s)
      </div>
    </div>
  )
}
