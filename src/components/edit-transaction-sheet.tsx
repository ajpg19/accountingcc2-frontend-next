"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
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
    setMemberId(transaction.assigned_member_id ?? NONE)
    setNotes(transaction.notes ?? "")
    setError(null)
  }, [transaction])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!transaction) return
    setSaving(true)
    setError(null)

    const category_id = categoryId === NONE ? null : categoryId
    const assigned_member_id = memberId === NONE ? null : memberId

    const supabase = createClient()
    const { data, error: updateError } = await supabase
      .from("transactions")
      .update({
        type,
        amount: Math.abs(Number(amount)),
        description: description || null,
        merchant: merchant || null,
        occurred_on: occurredOn,
        category_id,
        assigned_member_id,
        notes: notes.trim() || null,
      })
      .eq("id", transaction.id)
      .select("*, categories(id, name, color), members(id, name, color)")
      .single()

    setSaving(false)

    if (updateError || !data) {
      setError(updateError?.message ?? "No se pudo guardar el movimiento.")
      return
    }

    onSaved(data as unknown as Transaction)

    // Keep the linked contribution in sync (amount, date and label).
    if (sibling) {
      const label = (description || merchant || "pago directo").trim()
      const { data: siblingData } = await supabase
        .from("transactions")
        .update({
          amount: Math.abs(Number(amount)),
          occurred_on: occurredOn,
          description: `Aportación · ${label}`,
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
            Modifica los datos del movimiento y guarda los cambios.
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
              <Input
                id="edit-amount"
                required
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-date">Fecha</Label>
              <Input
                id="edit-date"
                required
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-merchant">Comercio / origen</Label>
            <Input
              id="edit-merchant"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Descripción</Label>
            <Input
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
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
            <Label>Asignado a</Label>
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
