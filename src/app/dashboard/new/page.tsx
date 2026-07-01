"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ReceiptUploader from "@/components/ReceiptUploader";
import type { Category, ExtractedReceipt, Member } from "@/lib/types";

export default function NewTransactionPage() {
  const router = useRouter();
  const supabase = createClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newMemberName, setNewMemberName] = useState("");

  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [occurredOn, setOccurredOn] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [categoryId, setCategoryId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: cats }, { data: mems }] = await Promise.all([
        supabase.from("categories").select("*").order("name"),
        supabase.from("members").select("*").order("name"),
      ]);
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
    setType("expense");
    suggestCategory(data.merchant, data.line_items?.[0]?.description);
  }

  async function suggestCategory(merchantVal?: string, descVal?: string) {
    setSuggesting(true);
    try {
      const res = await fetch("/api/claude/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: merchantVal,
          description: descVal,
          amount: Number(amount) || undefined,
          type,
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

  async function addMember() {
    if (!newMemberName.trim()) return;
    const { data, error } = await supabase
      .from("members")
      .insert({ name: newMemberName.trim() })
      .select()
      .single();
    if (!error && data) {
      setMembers((m) => [...m, data as Member]);
      setMemberId((data as Member).id);
      setNewMemberName("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: tx, error } = await supabase
        .from("transactions")
        .insert({
          type,
          amount: Number(amount),
          description,
          merchant,
          occurred_on: occurredOn,
          category_id: categoryId || null,
          assigned_member_id: memberId || null,
          source: extracted ? "receipt" : "manual",
          created_by: user?.email,
        })
        .select()
        .single();

      if (error || !tx) throw error;

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

      router.push("/dashboard");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Nuevo movimiento</h1>

      <ReceiptUploader onExtracted={handleExtracted} />

      {extracted && extracted.line_items?.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p className="mb-2 font-medium text-slate-700">
            Detectado en el ticket ({extracted.line_items.length} artículo(s)):
          </p>
          <ul className="space-y-1 text-slate-600">
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

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setType("expense")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              type === "expense"
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-slate-200 text-slate-500"
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
                : "border-slate-200 text-slate-500"
            }`}
          >
            Ingreso
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Importe (€)</label>
            <input
              required
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Fecha</label>
            <input
              required
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500">Comercio / origen</label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500">Descripción</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => !categoryId && suggestCategory(merchant, description)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500">
            Categoría {suggesting && "(sugiriendo con Claude...)"}
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-500">Asignado a</label>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              placeholder="Añadir nueva persona..."
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={addMember}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              Añadir
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar movimiento"}
        </button>
      </form>
    </div>
  );
}
