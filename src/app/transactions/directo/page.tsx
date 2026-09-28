"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ReceiptUploader from "@/components/ReceiptUploader";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { matchCategoryId } from "@/lib/category-rules";
import type { Category, ExtractedReceipt, Member } from "@/lib/types";

const NONE = "__none__";

// Dedicated form for "directos": expenses someone paid out of pocket. Manual
// entry is ALWAYS a directo — regular bank movements are imported from Excel.
// Each directo is saved as a linked pair sharing a group_id:
//   * the expense (the real spending, categorized), and
//   * that person's income / contribution ("aportación") to the shared pot.
export default function NewDirectoPage() {
  const router = useRouter();
  const supabase = createClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [occurredOn, setOccurredOn] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [categoryId, setCategoryId] = useState(NONE);
  const [memberId, setMemberId] = useState("");
  const [notes, setNotes] = useState("");
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    (async () => {
      const [
        { data: cats, error: catsError },
        { data: mems, error: memsError },
      ] = await Promise.all([
        supabase.from("categories").select("*").order("name"),
        supabase.from("members").select("*").order("name"),
      ]);
      if (catsError) console.error("Error cargando categorías:", catsError);
      if (memsError) console.error("Error cargando miembros:", memsError);
      setCategories((cats as Category[]) ?? []);
      setMembers((mems as Member[]) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExtracted(data: ExtractedReceipt, file: File) {
    setExtracted(data);
    setReceiptFile(file);
    setMerchant(data.merchant || "");
    setAmount(data.total_amount ? String(data.total_amount) : "");
    if (data.receipt_date) setOccurredOn(data.receipt_date);
    setDescription(
      data.line_items?.length
        ? `${data.line_items.length} artículo(s) - ${data.merchant}`
        : data.merchant || ""
    );
    suggestCategory(data.merchant, data.line_items?.[0]?.description);
  }

  async function suggestCategory(merchantVal?: string, descVal?: string) {
    // Fixed keyword rules take precedence over the AI: known payees
    // (e.g. "hidralia" -> Agua) are always filed the same way.
    const ruleCatId = matchCategoryId(
      `${merchantVal ?? ""} ${descVal ?? ""}`,
      categories
    );
    if (ruleCatId) {
      setCategoryId(ruleCatId);
      return;
    }
    setSuggesting(true);
    try {
      const res = await fetch("/api/claude/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: merchantVal,
          description: descVal,
          amount: Number(amount) || undefined,
          type: "expense",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const match = categories.find(
          (c) => c.name.toLowerCase() === String(data.category).toLowerCase()
        );
        if (match) setCategoryId(match.id);
      }
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A directo always needs to know who paid it out of pocket.
    if (!memberId) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Two linked rows: the expense (money out, categorized) and the
      // contribution (money in, attributed to the person who paid).
      const groupId = crypto.randomUUID();
      const incomeCategoryId =
        categories.find((c) => c.name.toLowerCase() === "ingreso")?.id ?? null;
      const label = description || merchant || "pago directo";
      const { data: inserted, error } = await supabase
        .from("transactions")
        .insert([
          {
            type: "expense",
            amount: Number(amount),
            description,
            merchant,
            occurred_on: occurredOn,
            category_id: categoryId === NONE ? null : categoryId,
            // The expense belongs to the shared pot, not to a person.
            assigned_member_id: null,
            source: extracted ? "receipt" : "manual",
            group_id: groupId,
            notes: notes.trim() || null,
            created_by: user?.email,
          },
          {
            type: "income",
            amount: Number(amount),
            description: `Aportación · ${label}`,
            merchant,
            occurred_on: occurredOn,
            category_id: incomeCategoryId,
            assigned_member_id: memberId,
            source: "manual",
            group_id: groupId,
            created_by: user?.email,
          },
        ])
        .select("id, type");

      if (error || !inserted) throw error;
      // Any receipt is attached to the expense row.
      const tx = inserted.find((r) => r.type === "expense") ?? null;
      if (!tx) throw new Error("No se pudo crear el directo.");

      if (extracted && receiptFile) {
        const path = `${tx.id}/${receiptFile.name}`;
        await supabase.storage.from("receipts").upload(path, receiptFile);

        const { data: receipt } = await supabase
          .from("receipts")
          .insert({
            transaction_id: tx.id,
            storage_path: path,
            merchant: extracted.merchant,
            receipt_date: extracted.receipt_date || occurredOn,
            total_amount: extracted.total_amount,
            tax_amount: extracted.tax_amount,
            raw_text: extracted.raw_text,
            extracted_json: extracted,
          })
          .select()
          .single();

        if (receipt && extracted.line_items?.length) {
          await supabase.from("receipt_items").insert(
            extracted.line_items.map((item) => ({
              receipt_id: receipt.id,
              description: item.description,
              reference: item.reference,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_price: item.total_price,
              color: item.color,
              material: item.material,
              model: item.model,
              category: item.category,
              attributes: item.attributes,
            }))
          );
        }
      }

      router.push("/transactions");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="Nuevo directo"
        description="Registra un gasto que alguien pagó de su bolsillo. Se guarda como gasto del bote y, a la vez, como aportación de esa persona. Los movimientos del banco se importan desde el Excel."
      />

      <ReceiptUploader onExtracted={handleExtracted} />

      {extracted && extracted.line_items?.length > 0 && (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <p className="mb-2 font-medium text-foreground">
            Detectado en el ticket ({extracted.line_items.length} artículo(s)):
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {extracted.line_items.map((item, i) => (
              <li key={i}>
                {item.quantity ?? 1}x {item.description}
                {item.reference ? ` (ref ${item.reference})` : ""}
                {item.color ? `, ${item.color}` : ""}
                {item.material ? `, ${item.material}` : ""}
                {item.model ? `, modelo ${item.model}` : ""}
                {item.total_price ? ` — ${item.total_price}€` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border bg-card p-5"
      >
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Este movimiento se registra por partida doble: un <strong>gasto</strong> del
          bote común y la <strong>aportación</strong> de quien lo pagó.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="directo-amount">
              Importe (€) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="directo-amount"
              required
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="directo-date">
              Fecha <span className="text-red-500">*</span>
            </Label>
            <Input
              id="directo-date"
              required
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="directo-description">
            Descripción <span className="text-red-500">*</span>
          </Label>
          <Input
            id="directo-description"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() =>
              categoryId === NONE && suggestCategory(merchant, description)
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="directo-merchant">
            Comercio / origen{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="directo-merchant"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="directo-notes">
            Observaciones{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <textarea
            id="directo-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="space-y-1.5">
          <Label>
            Categoría{" "}
            {suggesting ? (
              <span className="font-normal text-muted-foreground">
                (sugiriendo con Claude...)
              </span>
            ) : (
              <span className="font-normal text-muted-foreground">(opcional)</span>
            )}
          </Label>
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
          <Label>
            Lo pagó <span className="text-red-500">*</span>
          </Label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona una persona" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name || m.email || "Sin nombre"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          disabled={saving || !memberId}
          className="w-full"
        >
          {saving ? "Guardando..." : "Guardar directo"}
        </Button>
      </form>
    </div>
  );
}