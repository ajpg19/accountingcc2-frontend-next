import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, DownloadIcon, FileTextIcon } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ReceiptItem, Transaction } from "@/lib/types"

const SOURCE_LABELS: Record<Transaction["source"], string> = {
  manual: "Manual",
  receipt: "Ticket",
  csv: "CSV",
  bank: "Banco",
  general: "General",
}

const TX_SELECT = "*, categories(id, name, color), members(id, name, color)"

function formatMoney(n: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(n)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-ES")
}

function isImagePath(path: string) {
  return /\.(png|jpe?g|webp|gif|avif|heic)$/i.test(path)
}

type ReceiptRow = {
  id: string
  storage_path: string | null
  merchant: string | null
  receipt_date: string | null
  receipt_items?: ReceiptItem[]
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: current } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq("id", id)
    .single()

  if (!current) notFound()

  const tx = current as unknown as Transaction

  // For a direct payment, load both rows so we can show the pair. The expense is
  // the primary movement; the income is the payer's contribution.
  let expense = tx
  let income: Transaction | null = null
  if (tx.group_id) {
    const { data: pair } = await supabase
      .from("transactions")
      .select(TX_SELECT)
      .eq("group_id", tx.group_id)
    const rows = (pair as unknown as Transaction[]) ?? []
    expense = rows.find((r) => r.type === "expense") ?? tx
    income = rows.find((r) => r.type === "income") ?? null
  }

  // Receipts attached to the movement (and its pair). Sign each file so the
  // private bucket can be previewed/downloaded.
  const receiptTxIds = [expense.id, income?.id].filter(Boolean) as string[]
  const { data: receiptData } = await supabase
    .from("receipts")
    .select(
      "id, storage_path, merchant, receipt_date, receipt_items(*)"
    )
    .in("transaction_id", receiptTxIds)

  const receipts = await Promise.all(
    ((receiptData as ReceiptRow[] | null) ?? []).map(async (r) => {
      if (!r.storage_path) return { ...r, url: null as string | null }
      const { data: signed } = await supabase.storage
        .from("receipts")
        .createSignedUrl(r.storage_path, 60 * 60)
      return { ...r, url: signed?.signedUrl ?? null }
    })
  )

  const isExpense = expense.type === "expense"
  const category = expense.categories
  const member = expense.members

  return (
    <div className="max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/transactions">
          <ArrowLeftIcon />
          Volver a movimientos
        </Link>
      </Button>

      <PageHeader
        title={expense.description || expense.merchant || "Movimiento"}
        description="Detalle completo del movimiento y su documentación."
      />

      {/* Amount + type headline */}
      <div className="flex items-center justify-between rounded-xl border bg-card p-4">
        <Badge
          variant="outline"
          className={
            isExpense
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }
        >
          {isExpense ? "Gasto" : "Ingreso"}
        </Badge>
        <span
          className={`text-2xl font-semibold ${
            isExpense ? "text-red-600" : "text-emerald-600"
          }`}
        >
          {isExpense ? "-" : "+"}
          {formatMoney(Number(expense.amount), expense.currency)}
        </span>
      </div>

      {/* Details: one homogeneous list, all fields always shown for a
          consistent layout across every movement. */}
      <dl className="divide-y rounded-xl border">
        <Field label="Fecha">{formatDate(expense.occurred_on)}</Field>
        <Field label="Descripción">{expense.description || "—"}</Field>
        <Field label="Comercio / origen">{expense.merchant || "—"}</Field>
        <Field label="Categoría">
          {category ? (
            <span
              className="rounded-full px-2 py-0.5 text-xs text-white"
              style={{ backgroundColor: category.color }}
            >
              {category.name}
            </span>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Persona">{member?.name || member?.email || "—"}</Field>
        <Field label="Origen">{SOURCE_LABELS[expense.source]}</Field>
        <Field label="Nº Apunte">{expense.entry_ref || "—"}</Field>
        <Field label="Fecha valor">
          {expense.value_date ? formatDate(expense.value_date) : "—"}
        </Field>
        <Field label="Saldo">
          {expense.balance != null
            ? formatMoney(Number(expense.balance), expense.currency)
            : "—"}
        </Field>
        <Field label="Observaciones">{expense.notes || "—"}</Field>
      </dl>

      {/* Direct-payment pair summary */}
      {income && (
        <div className="space-y-1 rounded-xl border bg-muted/40 p-4 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Pago directo (partida doble)
          </p>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Gasto · {category?.name || "sin categoría"}
            </span>
            <span className="font-medium text-red-600">
              -{formatMoney(Number(expense.amount), expense.currency)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Aportación ·{" "}
              {income.members?.name || income.members?.email || "sin persona"}
            </span>
            <span className="font-medium text-emerald-600">
              +{formatMoney(Number(income.amount), income.currency)}
            </span>
          </div>
        </div>
      )}

      {/* Documentation */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Documentación
        </h2>
        {receipts.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay documentos adjuntos a este movimiento.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {receipts.map((r) => (
              <div key={r.id} className="space-y-3 rounded-xl border p-4">
                {r.url && r.storage_path && isImagePath(r.storage_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.url}
                    alt={r.merchant || "Documento"}
                    className="max-h-96 w-full rounded-lg border object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileTextIcon className="size-4 shrink-0" />
                    {r.merchant || "Documento adjunto"}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {r.merchant || "Documento"}
                    {r.receipt_date ? ` · ${formatDate(r.receipt_date)}` : ""}
                  </span>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                    >
                      <DownloadIcon className="size-3.5" />
                      Descargar
                    </a>
                  )}
                </div>

                {r.receipt_items && r.receipt_items.length > 0 && (
                  <ul className="space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
                    {r.receipt_items.map((item, i) => (
                      <li key={i}>
                        {item.quantity ?? 1}x {item.description}
                        {item.total_price ? ` — ${item.total_price}€` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}
