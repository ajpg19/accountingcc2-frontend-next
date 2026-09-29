"use client"

import * as React from "react"

import type { Category, Member, MovementLog } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

const ACTION_LABELS: Record<MovementLog["action"], string> = {
  insert: "Creado",
  update: "Editado",
  delete: "Eliminado",
}

const ACTION_VARIANTS: Record<
  MovementLog["action"],
  "default" | "destructive" | "secondary"
> = {
  insert: "default",
  update: "secondary",
  delete: "destructive",
}

// Fields that add no value in the change detail (noise or duplicates of
// other columns).
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
  entry_ref: "Nº Apunte",
  value_date: "Fecha valor",
  balance: "Saldo",
  notes: "Observaciones",
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

export function TransactionHistory({
  data,
  categories,
  members,
}: {
  data: MovementLog[]
  categories: Category[]
  members: Member[]
}) {
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
    if (field === "assigned_member_id")
      return memberById.get(String(value)) || String(value)
    if (field === "amount" || field === "balance") return formatMoney(Number(value))
    if (field === "type") return value === "expense" ? "Gasto" : "Ingreso"
    if (field === "source")
      return (
        { manual: "Manual", receipt: "Ticket", csv: "CSV", bank: "Banco", general: "General" }[
          String(value)
        ] || String(value)
      )
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

  if (data.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        No hay registros de cambios para este movimiento.
      </p>
    )
  }

  return (
    <ul className="divide-y rounded-xl border">
      {data.map((log) => {
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
          <li key={log.id}>
            <button
              type="button"
              onClick={() => toggleExpanded(log.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40"
            >
              {isOpen ? (
                <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <Badge variant={ACTION_VARIANTS[log.action]}>
                {ACTION_LABELS[log.action]}
              </Badge>
              <span className="whitespace-nowrap text-muted-foreground">
                {formatDateTime(log.changed_at)}
              </span>
              <span className="ml-auto truncate text-muted-foreground">
                {log.changed_by || "—"}
              </span>
            </button>

            {isOpen && (
              <div className="bg-muted/40 px-4 py-3">
                {log.action === "update" ? (
                  changedFields.length ? (
                    <ul className="space-y-1 text-sm">
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
                    <p className="text-sm text-muted-foreground">
                      Sin cambios en campos relevantes.
                    </p>
                  )
                ) : (
                  <ul className="space-y-1 text-sm">
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
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}