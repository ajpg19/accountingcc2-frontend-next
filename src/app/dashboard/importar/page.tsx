"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import type { Category, Member } from "@/lib/types";

type RawRow = Record<string, string>;

type ImportRow = {
  index: number;
  date: string;
  description: string;
  amount: number;
  type: "expense" | "income";
  categoryId: string;
  memberId: string;
  include: boolean;
};

export default function ImportarCsvPage() {
  const supabase = createClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [amountCol, setAmountCol] = useState("");

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [step, setStep] = useState<"upload" | "map" | "review">("upload");
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);

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

  function handleFile(file: File) {
    setFileName(file.name);
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setHeaders(result.meta.fields || []);
        setRawRows(result.data);
        setStep("map");
      },
    });
  }

  async function buildRowsAndSuggest() {
    const parsed: ImportRow[] = rawRows.map((r, i) => {
      const amount = parseFloat(
        (r[amountCol] || "0").replace(/\./g, "").replace(",", ".")
      ) || parseFloat(r[amountCol] || "0");
      return {
        index: i,
        date: r[dateCol] || "",
        description: r[descCol] || "",
        amount: Math.abs(amount),
        type: amount < 0 ? "expense" : "income",
        categoryId: "",
        memberId: "",
        include: true,
      };
    });
    setRows(parsed);
    setStep("review");

    setLoadingSuggestions(true);
    try {
      const chunkSize = 25;
      const updated = [...parsed];
      for (let i = 0; i < parsed.length; i += chunkSize) {
        const chunk = parsed.slice(i, i + chunkSize);
        const res = await fetch("/api/claude/suggest-csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: chunk.map((r) => ({
              index: r.index,
              description: r.description,
              amount: r.type === "expense" ? -r.amount : r.amount,
            })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          for (const s of data.suggestions || []) {
            const row = updated.find((r) => r.index === s.index);
            if (row) {
              const cat = categories.find(
                (c) => c.name.toLowerCase() === String(s.category).toLowerCase()
              );
              const mem = members.find(
                (m) => m.name.toLowerCase() === String(s.member).toLowerCase()
              );
              if (cat) row.categoryId = cat.id;
              if (mem) row.memberId = mem.id;
            }
          }
          setRows([...updated]);
        }
      }
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function updateRow(index: number, patch: Partial<ImportRow>) {
    setRows((prev) =>
      prev.map((r) => (r.index === index ? { ...r, ...patch } : r))
    );
  }

  async function confirmImport() {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const toInsert = rows
        .filter((r) => r.include)
        .map((r) => ({
          type: r.type,
          amount: r.amount,
          description: r.description,
          occurred_on: normalizeDate(r.date),
          category_id: r.categoryId || null,
          assigned_member_id: r.memberId || null,
          source: "csv" as const,
          raw_import_row: rawRows[r.index],
          created_by: user?.email,
        }));

      if (toInsert.length) {
        await supabase.from("transactions").insert(toInsert);
      }

      await supabase.from("csv_imports").insert({
        filename: fileName,
        imported_by: user?.email,
        row_count: toInsert.length,
      });

      setStep("upload");
      setRawRows([]);
      setRows([]);
      setFileName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Importar CSV del banco</h1>

      {step === "upload" && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <label className="cursor-pointer">
            <span className="text-sm text-slate-600">
              Sube el CSV exportado de tu banco
            </span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <div className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Elegir archivo CSV
            </div>
          </label>
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">
            {rawRows.length} filas detectadas en <strong>{fileName}</strong>.
            Indica qué columna es cada cosa:
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500">Columna de fecha</label>
              <select
                value={dateCol}
                onChange={(e) => setDateCol(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">-</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Columna de concepto</label>
              <select
                value={descCol}
                onChange={(e) => setDescCol(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">-</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">
                Columna de importe (negativo = gasto)
              </label>
              <select
                value={amountCol}
                onChange={(e) => setAmountCol(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">-</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            disabled={!dateCol || !descCol || !amountCol}
            onClick={buildRowsAndSuggest}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Continuar
          </button>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          {loadingSuggestions && (
            <p className="text-sm text-slate-500">
              Claude está sugiriendo categoría y persona para cada fila...
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-3 py-2 font-normal"></th>
                  <th className="px-3 py-2 font-normal">Fecha</th>
                  <th className="px-3 py-2 font-normal">Concepto</th>
                  <th className="px-3 py-2 font-normal">Importe</th>
                  <th className="px-3 py-2 font-normal">Categoría</th>
                  <th className="px-3 py-2 font-normal">Persona</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.index} className="border-b border-slate-50">
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) =>
                          updateRow(r.index, { include: e.target.checked })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{r.date}</td>
                    <td className="px-3 py-1.5 text-slate-900">{r.description}</td>
                    <td
                      className={`px-3 py-1.5 font-medium ${
                        r.type === "expense" ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {r.type === "expense" ? "-" : "+"}
                      {r.amount.toFixed(2)}€
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={r.categoryId}
                        onChange={(e) =>
                          updateRow(r.index, { categoryId: e.target.value })
                        }
                        className="rounded border border-slate-300 px-1 py-1 text-xs"
                      >
                        <option value="">-</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={r.memberId}
                        onChange={(e) =>
                          updateRow(r.index, { memberId: e.target.value })
                        }
                        className="rounded border border-slate-300 px-1 py-1 text-xs"
                      >
                        <option value="">-</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={confirmImport}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Importando..." : `Importar ${rows.filter((r) => r.include).length} movimientos`}
          </button>
        </div>
      )}
    </div>
  );
}

function normalizeDate(d: string): string {
  // Intenta normalizar DD/MM/YYYY o DD-MM-YYYY a YYYY-MM-DD; si ya viene en ISO, la deja igual.
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}
