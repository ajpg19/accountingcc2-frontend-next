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
  categories,
  members,
  open,
  onOpenChange,
  onSaved,
}: {
  transaction: Transaction | null
  categories: Category[]
  members: Member[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (updated: Transaction) => void
}) {
  const [type, setType] = React.useState<"expense" | "income">("expense")
  const [amount, setAmount] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [merchant, setMerchant] = React.useState("")
  const [occurredOn, setOccurredOn] = React.useState("")
  const [categoryId, setCategoryId] = React.useState(NONE)
  const [memberId, setMemberId] = React.useState(NONE)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!transaction) return
    setType(transaction.type)
    setAmount(String(transaction.amount))
    setDescription(transaction.description ?? "")
    setMerchant(transaction.merchant ?? "")
    setOccurredOn(transaction.occurred_on?.slice(0, 10) ?? "")
    setCategoryId(transaction.category_id ?? NONE)
    setMemberId(transaction.assigned_member_id ?? NONE)
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
        amount: Number(amount),
        description: description || null,
        merchant: merchant || null,
        occurred_on: occurredOn,
        category_id,
        assigned_member_id,
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
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                type === "expense"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-input text-muted-foreground"
              }`}
            >
              Gasto
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                type === "income"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-input text-muted-foreground"
              }`}
            >
              Ingreso
            </button>
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
