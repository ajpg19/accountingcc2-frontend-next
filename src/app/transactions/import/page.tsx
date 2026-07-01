"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { UploadCloudIcon, FileSpreadsheetIcon, XIcon, RefreshCwIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import type { Category, Member } from "@/lib/types";

type RawRow = Record<string, string>;

type ParsedFile = {
  headers: string[];
  rows: RawRow[];
  accountInfo?: { name?: string; iban?: string };
};

// Convierte una celda de Excel (Date, número o texto) a texto homogéneo.
// Las fechas se normalizan a YYYY-MM-DD para que normalizeDate() las reconozca.
function cellToString(cell: unknown): string {
  if (cell instanceof Date) {
    const yyyy = cell.getFullYear();
    const mm = String(cell.getMonth() + 1).padStart(2, "0");
    const dd = String(cell.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof cell === "number") return String(cell);
  return String(cell ?? "").trim();
}

function parseCsvFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        resolve({ headers: result.meta.fields || [], rows: result.data });
      },
      error: reject,
    });
  });
}

// Parsea el Excel de movimientos del banco. El fichero trae unas filas de
// cabecera (Nombre, IBAN), una fila en blanco y luego la fila de encabezados
// reales (Fecha de la operación, Fecha valor, Tipo movimiento, Importe,
// Saldo, Nro. Apunte). Detectamos esa fila buscando la primera que contenga
// "fecha" en vez de asumir una posición fija, para que también funcione si
// el banco cambia el número de filas de cabecera.
async function parseXlsxFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: "",
  }) as unknown[][];

  const accountInfo: { name?: string; iban?: string } = {};
  let headerRowIndex = -1;

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] || [];
    const first = String(row[0] ?? "").toLowerCase().trim();
    if (first === "nombre") accountInfo.name = String(row[1] ?? "");
    if (first === "iban") accountInfo.iban = String(row[1] ?? "");

    const nonEmpty = row.filter((c) => String(c ?? "").trim() !== "");
    const hasFecha = row.some((c) => /fecha/i.test(String(c ?? "")));
    if (headerRowIndex === -1 && nonEmpty.length >= 3 && hasFecha) {
      headerRowIndex = i;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = grid.findIndex(
      (row) => (row || []).filter((c) => String(c ?? "").trim() !== "").length >= 2
    );
    if (headerRowIndex === -1) headerRowIndex = 0;
  }

  const headerRow = (grid[headerRowIndex] || []).map((c) => String(c ?? "").trim());
  const rows: RawRow[] = [];
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    if (row.every((c) => String(c ?? "").trim() === "")) continue;
    const obj: RawRow = {};
    headerRow.forEach((h, j) => {
      if (!h) return;
      obj[h] = cellToString(row[j]);
    });
    rows.push(obj);
  }

  return { headers: headerRow.filter(Boolean), rows, accountInfo };
}

function guessHeader(headers: string[], keywords: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw));
    if (idx !== -1) return headers[idx];
  }
  return "";
}

// Solo consideramos columna de ID si el encabezado es exactamente "id",
// como el que genera el botón "Descargar movimientos". Así evitamos falsos
// positivos con columnas del banco como "Nro. Apunte".
function guessIdColumn(headers: string[]): string {
  return headers.find((h) => h.trim().toLowerCase() === "id") || "";
}

// Soporta tanto "1.234,56" (formato español con coma decimal) como "928.55"
// (número plano, tal y como llega desde una celda de Excel).
function parseAmount(raw: string): number {
  const s = (raw || "0").trim();
  if (s.includes(",")) {
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return parseFloat(s) || 0;
}

type ImportRow = {
  index: number;
  id?: string;
  date: string;
  description: string;
  amount: number;
  type: "expense" | "income";
  categoryId: string;
  memberId: string;
  include: boolean;
};

export default function ImportCsvPage() {
  const supabase = createClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [accountInfo, setAccountInfo] = useState<{ name?: string; iban?: string }>({});
  const [parseError, setParseError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [idCol, setIdCol] = useState("");
  const [categoryCol, setCategoryCol] = useState("");
  const [memberCol, setMemberCol] = useState("");

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [step, setStep] = useState<"upload" | "map" | "review">("upload");
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);

  const isUpdateMode = Boolean(idCol);

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

  async function handleFile(file: File) {
    setFileName(file.name);
    setParseError("");
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const parsed = isExcel ? await parseXlsxFile(file) : await parseCsvFile(file);

      if (!parsed.rows.length) {
        setParseError("No se han detectado movimientos en el archivo.");
        return;
      }

      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setAccountInfo(parsed.accountInfo || {});

      setDateCol(guessHeader(parsed.headers, ["fecha de la operación", "fecha operación", "fecha"]));
      setDescCol(guessHeader(parsed.headers, ["concepto", "tipo movimiento", "descripcion", "descripción"]));
      setAmountCol(guessHeader(parsed.headers, ["importe", "cantidad"]));
      setIdCol(guessIdColumn(parsed.headers));
      setCategoryCol(guessHeader(parsed.headers, ["categoría", "categoria"]));
      setMemberCol(guessHeader(parsed.headers, ["persona", "miembro"]));

      setStep("map");
    } catch {
      setParseError("No se ha podido leer el archivo. Comprueba que sea un CSV o Excel válido.");
    }
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function resetUpload() {
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setParseError("");
    setStep("upload");
  }

  async function buildRowsAndSuggest() {
    const parsed: ImportRow[] = rawRows.map((r, i) => {
      const amount = parseAmount(r[amountCol]);
      const catName = categoryCol ? r[categoryCol] : "";
      const memName = memberCol ? r[memberCol] : "";
      const cat = catName
        ? categories.find((c) => c.name.toLowerCase() === catName.toLowerCase())
        : undefined;
      const mem = memName
        ? members.find((m) => m.name?.toLowerCase() === memName.toLowerCase())
        : undefined;
      return {
        index: i,
        id: idCol ? r[idCol] || undefined : undefined,
        date: r[dateCol] || "",
        description: r[descCol] || "",
        amount: Math.abs(amount),
        type: amount < 0 ? "expense" : "income",
        categoryId: cat?.id || "",
        memberId: mem?.id || "",
        include: true,
      };
    });
    setRows(parsed);
    setStep("review");

    const needsSuggestion = parsed.filter((r) => !r.categoryId || !r.memberId);
    if (!needsSuggestion.length) return;

    setLoadingSuggestions(true);
    try {
      const chunkSize = 25;
      const updated = [...parsed];
      for (let i = 0; i < needsSuggestion.length; i += chunkSize) {
        const chunk = needsSuggestion.slice(i, i + chunkSize);
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
                (m) => m.name?.toLowerCase() === String(s.member).toLowerCase()
              );
              if (cat && !row.categoryId) row.categoryId = cat.id;
              if (mem && !row.memberId) row.memberId = mem.id;
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

      const included = rows.filter((r) => r.include);
      const toUpdate = included.filter((r) => r.id);
      const toInsert = included.filter((r) => !r.id);

      if (toUpdate.length) {
        await Promise.all(
          toUpdate.map((r) =>
            supabase
              .from("transactions")
              .update({
                type: r.type,
                amount: r.amount,
                description: r.description,
                occurred_on: normalizeDate(r.date),
                category_id: r.categoryId || null,
                assigned_member_id: r.memberId || null,
              })
              .eq("id", r.id)
          )
        );
      }

      if (toInsert.length) {
        await supabase.from("transactions").insert(
          toInsert.map((r) => ({
            type: r.type,
            amount: r.amount,
            description: r.description,
            occurred_on: normalizeDate(r.date),
            category_id: r.categoryId || null,
            assigned_member_id: r.memberId || null,
            source: "csv" as const,
            raw_import_row: rawRows[r.index],
            created_by: user?.email,
          }))
        );
      }

      await supabase.from("csv_imports").insert({
        filename: fileName,
        imported_by: user?.email,
        row_count: included.length,
      });

      toast.success(
        toUpdate.length && toInsert.length
          ? `${toInsert.length} movimiento(s) añadidos y ${toUpdate.length} actualizados.`
          : toUpdate.length
          ? `${toUpdate.length} movimiento(s) actualizados.`
          : `${toInsert.length} movimiento(s) importados.`
      );

      setStep("upload");
      setRawRows([]);
      setRows([]);
      setFileName("");
    } catch (err) {
      console.error(err);
      toast.error("No se ha podido completar la importación.");
    } finally {
      setSaving(false);
    }
  }

  const includedCount = rows.filter((r) => r.include).length;
  const updateCount = rows.filter((r) => r.include && r.id).length;
  const insertCount = includedCount - updateCount;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Importar movimientos del banco"
        description="Sube el extracto de tu banco (CSV o Excel) para añadir movimientos nuevos, o vuelve a subir un archivo descargado desde Movimientos para actualizarlos."
      />

      {step === "upload" && (
        <div className="space-y-3">
          <label
            htmlFor="import-file-input"
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors ${
              dragActive
                ? "border-slate-900 bg-slate-50"
                : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-slate-100">
              <UploadCloudIcon className="size-6 text-slate-500" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-700">
                Arrastra aquí tu archivo o haz clic para elegirlo
              </p>
              <p className="text-xs text-slate-500">
                Extracto del banco o archivo exportado desde Movimientos · CSV, XLSX o XLS
              </p>
            </div>
            <span className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Elegir archivo
            </span>
            <input
              id="import-file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          {parseError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{parseError}</p>
          )}
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <FileSpreadsheetIcon className="size-4 shrink-0 text-slate-400" />
              <span>
                {rawRows.length} filas detectadas en <strong>{fileName}</strong>. Indica qué
                columna es cada cosa:
              </span>
            </div>
            <button
              onClick={resetUpload}
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Quitar archivo"
            >
              <XIcon className="size-4" />
            </button>
          </div>
          {(accountInfo.name || accountInfo.iban) && (
            <p className="text-xs text-slate-500">
              Cuenta detectada: {accountInfo.name}
              {accountInfo.iban ? ` · ${accountInfo.iban}` : ""}
            </p>
          )}
          {isUpdateMode && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <RefreshCwIcon className="size-3.5 shrink-0" />
              Se ha detectado una columna de ID: los movimientos existentes se actualizarán y
              las filas sin ID se añadirán como nuevas.
            </p>
          )}
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
                  {isUpdateMode && <th className="px-3 py-2 font-normal">Estado</th>}
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
                    {isUpdateMode && (
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.id
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {r.id ? "Actualizar" : "Nuevo"}
                        </span>
                      </td>
                    )}
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
                            {m.name || m.email || "Sin nombre"}
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
            disabled={saving || includedCount === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving
              ? "Guardando..."
              : isUpdateMode
              ? `Guardar (${insertCount} nuevos, ${updateCount} actualizados)`
              : `Importar ${includedCount} movimientos`}
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
