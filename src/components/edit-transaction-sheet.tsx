"use client"

import * as React from "react"
import { CopyIcon } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { wallClockToUTC } from "@/lib/utils"
import type { Category, Member, Transaction } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const NONE = "__none__"

// Copy button shown to the right of read-only fields (bank movements) so the
// value can still be copied even though it cannot be edited.
function CopyButton({ value }: { value: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0"
      aria-label="Copiar"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          toast.success("Copiado al portapapeles")
        } catch {
          toast.error("No se pudo copiar")
        }
      }}
    >
      <CopyIcon />
    </Button>
  )
}

export function EditTransactionSheet({
  transaction,
  sibling = null,
  categories,
  members,
  open,
  onOpenChange,
  onSaved,
}: {
  transaction: Transaction | null
  // When editing a direct-payment expense, the linked contribution row. Its
  // amount and date are kept in sync with the expense.
  sibling?: Transaction | null
  categories: Category[]
  members: Member[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (updated: Transaction) => void
}) {
  const [amount, setAmount] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [merchant, setMerchant] = React.useState("")
  const [occurredOn, setOccurredOn] = React.useState("")
  const [categoryId, setCategoryId] = React.useState(NONE)
  const [memberId, setMemberId] = React.useState(NONE)
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // The type is derived from the sign of the amount, not chosen manually:
  // a negative amount is an expense, a positive one an income.
  const type: "expense" | "income" = Number(amount) < 0 ? "expense" : "income"

  // Bank movements come straight from the bank statement, so their factual
  // data (amount, date, merchant, description) must stay untouched. Only the
  // classification fields — category, assigned member and notes — are editable.
  const isBank = transaction?.source === "bank"

  // A directo is edited through its expense row; `sibling` is the linked
  // "Atribución" income that carries the payer. The person shown/edited here is
  // therefore the sibling's member, while the expense itself belongs to the pot.
  const isDirecto = Boolean(sibling)

  React.useEffect(() => {
    if (!transaction) return
    // Show the amount signed so the derived type matches the stored one.
    const signed =
      transaction.type === "expense"
        ? -Math.abs(transaction.amount)
        : Math.abs(transaction.amount)
    setAmount(String(signed))
    setDescription(transaction.description ?? "")
    setMerchant(transaction.merchant ?? "")
    setOccurredOn(transaction.occurred_on?.slice(0, 10) ?? "")
    setCategoryId(transaction.category_id ?? NONE)
    // For a directo the payer lives on the sibling (income), not the expense.
    setMemberId(
      (sibling ? sibling.assigned_member_id : transaction.assigned_member_id) ??
        NONE
    )
    setNotes(transaction.notes ?? "")
    setError(null)
  }, [transaction, sibling])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!transaction) return
    setSaving(true)
    setError(null)

    const category_id = categoryId === NONE ? null : categoryId
    const assigned_member_id = memberId === NONE ? null : memberId

    // For bank movements only the classification fields can change; the factual
    // data from the statement is left as-is.
    const payload = isBank
      ? {
          category_id,
          assigned_member_id,
          notes: notes.trim() || null,
        }
      : {
          type,
          amount: Math.abs(Number(amount)),
          description: description || null,
          merchant: merchant || null,
          occurred_on: wallClockToUTC(occurredOn),
          category_id,
          // A directo expense belongs to the shared pot; the payer is stored on
          // the sibling (atribución), updated below.
          assigned_member_id: isDirecto ? null : assigned_member_id,
          notes: notes.trim() || null,
        }

    const supabase = createClient()
    const { data, error: updateError } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", transaction.id)
      .select("*, categories(id, name, color), members(id, name, color)")
      .single()

    setSaving(false)

    if (updateError || !data) {
      setError(updateError?.message ?? "No se pudo guardar el movimiento.")
      return
    }

    onSaved(data as unknown as Transaction)

    // Keep the linked atribución in sync (amount, date, label and payer).
    if (sibling) {
      const label = (description || merchant || "pago directo").trim()
      const { data: siblingData } = await supabase
        .from("transactions")
        .update({
          amount: Math.abs(Number(amount)),
          occurred_on: wallClockToUTC(occurredOn),
          description: `Atribución · ${label}`,
          assigned_member_id,
        })
        .eq("id", sibling.id)
        .select("*, categories(id, name, color), members(id, name, color)")
        .single()
      if (siblingData) onSaved(siblingData as unknown as Transaction)
    }

    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Editar movimiento</SheetTitle>
          <SheetDescription>
            {isBank
              ? "Este movimiento proviene del banco: solo puedes cambiar la categoría, la persona asignada y las observaciones."
              : "Modifica los datos del movimiento y guarda los cambios."}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSave}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          {/* Read-only indicator: the type follows the sign of the amount. */}
          <div className="flex gap-3">
            <div
              className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium ${
                type === "expense"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-input text-muted-foreground"
              }`}
            >
              Gasto
            </div>
            <div
              className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium ${
                type === "income"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-input text-muted-foreground"
              }`}
            >
              Ingreso
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-amount">Importe (€)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-amount"
                  required
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isBank}
                />
                {isBank && <CopyButton value={amount} />}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-date">Fecha</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-date"
                  required
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  disabled={isBank}
                />
                {isBank && <CopyButton value={occurredOn} />}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Descripción</Label>
            <div className="flex items-start gap-2">
              <textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isBank}
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {isBank && <CopyButton value={description} />}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-merchant">Comercio / origen</Label>
            <div className="flex items-center gap-2">
              <Input
                id="edit-merchant"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                disabled={isBank}
              />
              {isBank && <CopyButton value={merchant} />}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin categoría</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{isDirecto ? "Atribuido a" : "Asignado a"}</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin asignar</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.email || "Sin nombre"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Observaciones</Label>
            <textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
