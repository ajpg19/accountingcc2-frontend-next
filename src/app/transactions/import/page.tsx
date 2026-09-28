"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { UploadCloudIcon, FileSpreadsheetIcon, XIcon, RefreshCwIcon, AlertTriangleIcon, InfoIcon, DownloadIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { matchCategoryId } from "@/lib/category-rules";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category, Member } from "@/lib/types";

// Radix Select forbids an empty-string item value, so the "no selection"
// option uses this sentinel while state keeps "" for none.
const NONE = "__none__";

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

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeText(s: string): string {
  return stripAccents((s || "").toLowerCase());
}

// Intenta detectar a qué miembro pertenece un movimiento a partir del concepto.
// Ej.: "TRF. ALBERTO JESUS PEREZ GALBAN" -> el miembro cuyo nombre aparece en el
// texto. Puntúa cada miembro por el nº de palabras de su nombre presentes en el
// concepto y solo asigna si hay un ganador claro (sin empates), para evitar
// falsos positivos entre miembros que compartan nombre o apellidos.
function matchMemberIdFromDescription(description: string, members: Member[]): string {
  const words = new Set(
    normalizeText(description).split(/[^a-z0-9]+/).filter(Boolean)
  );
  if (!words.size) return "";

  let best: Member | undefined;
  let bestScore = 0;
  let tie = false;

  for (const m of members) {
    const tokens = normalizeText(m.name || "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);
    if (!tokens.length) continue;
    const score = tokens.filter((t) => words.has(t)).length;
    if (score === 0) continue;
    if (score > bestScore) {
      best = m;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }

  return best && !tie ? best.id : "";
}

// Key used to detect EXACTLY equal movements: same day, amount, type and
// concept (normalized, accent- and case-insensitive). Used to warn about rows
// that already exist in the database even when they have no entry reference.
function exactDuplicateKey(
  occurredOn: string,
  amount: number,
  type: string,
  description: string
): string {
  return [
    (occurredOn || "").slice(0, 10),
    amount.toFixed(2),
    type,
    normalizeText(description).trim(),
  ].join("|");
}

type ImportOrigin = "bank" | "general";

type ImportRow = {
  index: number;
  id?: string;
  entryRef?: string;
  duplicate: boolean;
  dateInvalid: boolean;
  date: string;
  valueDate?: string;
  balance?: number;
  description: string;
  merchant: string;
  amount: number;
  type: "expense" | "income";
  categoryId: string;
  memberId: string;
  notes: string;
  include: boolean;
};

// Auto-note added when a movement is imported without a date: it means the date
// shown is the day it was uploaded, not the real operation date.
const EMPTY_DATE_NOTE =
  "La fecha corresponde al día en que se subió el movimiento.";

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
  const [merchantCol, setMerchantCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [valueDateCol, setValueDateCol] = useState("");
  const [balanceCol, setBalanceCol] = useState("");
  const [idCol, setIdCol] = useState("");
  const [entryRefCol, setEntryRefCol] = useState("");
  const [categoryCol, setCategoryCol] = useState("");
  const [memberCol, setMemberCol] = useState("");
  const [notesCol, setNotesCol] = useState("");
  const [origin, setOrigin] = useState<ImportOrigin>("bank");

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [step, setStep] = useState<"upload" | "map" | "review">("upload");
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [saving, setSaving] = useState(false);

  const isUpdateMode = Boolean(idCol);
  const isDedupMode = Boolean(entryRefCol) && !isUpdateMode;

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
      setDescCol(guessHeader(parsed.headers, ["descripción", "descripcion", "concepto", "tipo movimiento"]));
      setMerchantCol(guessHeader(parsed.headers, ["comercio", "origen"]));
      setAmountCol(guessHeader(parsed.headers, ["importe", "cantidad"]));
      setValueDateCol(guessHeader(parsed.headers, ["fecha valor", "fecha de valor"]));
      setBalanceCol(guessHeader(parsed.headers, ["saldo", "balance"]));
      setIdCol(guessIdColumn(parsed.headers));
      setEntryRefCol(guessHeader(parsed.headers, ["apunte", "nº apunte", "nro. apunte", "numero de apunte", "número de apunte"]));
      setCategoryCol(guessHeader(parsed.headers, ["categoría", "categoria"]));
      setMemberCol(guessHeader(parsed.headers, ["persona", "miembro"]));
      setNotesCol(guessHeader(parsed.headers, ["observaciones", "observación", "observacion", "notas", "nota"]));

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
    setEntryRefCol("");
    setParseError("");
    setStep("upload");
  }

  // Downloads an Excel template for "general" movements. Headers match the ones
  // the importer auto-detects (see the guessHeader() calls), plus a sample row
  // to show the expected date/amount format.
  function downloadGeneralTemplate() {
    const headers = [
      "Fecha",
      "Descripción",
      "Comercio / origen",
      "Importe",
      "Categoría",
      "Persona",
      "Nº Apunte",
      "Observaciones",
    ];
    const example = [
      "",
      "Ejemplo (bórralo o sustitúyelo)",
      "",
      -12.34,
      "",
      "",
      "",
      "Si dejas la fecha vacía se usará la de hoy",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, "plantilla-movimientos-generales.xlsx");
  }

  async function buildRowsAndSuggest() {
    const parsed: ImportRow[] = rawRows.map((r, i) => {
      const amount = parseAmount(r[amountCol]);
      const catName = categoryCol ? r[categoryCol] : "";
      const memName = memberCol ? r[memberCol] : "";
      const cat = catName
        ? categories.find((c) => c.name.toLowerCase() === catName.toLowerCase())
        : undefined;
      // Keyword rules (e.g. "hidralia" -> Agua) as a deterministic fallback
      // when the file has no category column match. Applied before the AI so
      // known payees are always filed the same way.
      const ruleCategoryId = matchCategoryId(r[descCol] || "", categories);
      const mem = memName
        ? members.find((m) => m.name?.toLowerCase() === memName.toLowerCase())
        : undefined;
      const description = r[descCol] || "";
      const merchant = merchantCol ? (r[merchantCol] || "").trim() : "";
      // When the file has no member column, infer it from the concept
      // (e.g. a transfer "TRF. ALBERTO ..." is assigned to that member).
      const memberId =
        mem?.id || matchMemberIdFromDescription(description, members);
      const rawDate = (r[dateCol] || "").trim();
      // An empty date is allowed: it defaults to today (the upload day). Only a
      // non-empty date that can't be parsed is treated as invalid.
      const dateEmpty = rawDate === "";
      const effectiveDate = dateEmpty
        ? new Date().toISOString().slice(0, 10)
        : rawDate;
      const dateInvalid = !dateEmpty && !normalizeDate(rawDate);
      const valueDate = valueDateCol
        ? normalizeDate(r[valueDateCol] || "") || undefined
        : undefined;
      const balanceRaw = balanceCol ? r[balanceCol]?.trim() : "";
      const balance = balanceRaw ? parseAmount(balanceRaw) : undefined;
      const mappedNotes = notesCol ? (r[notesCol] || "").trim() : "";
      // Combine any notes from the file with the auto-note for empty dates.
      const notes = [mappedNotes, dateEmpty ? EMPTY_DATE_NOTE : ""]
        .filter(Boolean)
        .join(" · ");
      return {
        index: i,
        id: idCol ? r[idCol] || undefined : undefined,
        entryRef: entryRefCol ? r[entryRefCol]?.trim() || undefined : undefined,
        duplicate: false,
        dateInvalid,
        date: effectiveDate,
        valueDate,
        balance,
        description,
        merchant,
        amount: Math.abs(amount),
        type: amount < 0 ? "expense" : "income",
        categoryId: cat?.id || ruleCategoryId,
        memberId,
        notes,
        // Rows with an unparseable date are excluded by default so they can't
        // be imported with a wrong date; the user sees a "Fecha inválida" badge.
        include: !dateInvalid,
      };
    });

    // Deduplicación por número de apunte dentro del mismo origen (banco/general).
    // Los que ya existen en la base de datos se marcan como duplicados y se
    // desmarcan para no volver a añadirlos.
    if (isDedupMode) {
      setCheckingDuplicates(true);
      try {
        const refs = Array.from(
          new Set(parsed.map((r) => r.entryRef).filter((v): v is string => Boolean(v)))
        );
        const existing = new Set<string>();
        const chunkSize = 200;
        for (let i = 0; i < refs.length; i += chunkSize) {
          const chunk = refs.slice(i, i + chunkSize);
          const { data } = await supabase
            .from("transactions")
            .select("entry_ref")
            .eq("source", origin)
            .in("entry_ref", chunk);
          (data ?? []).forEach((d: { entry_ref: string | null }) => {
            if (d.entry_ref) existing.add(d.entry_ref);
          });
        }
        // Marca también duplicados dentro del propio archivo (mismo apunte repetido).
        const seen = new Set<string>();
        for (const row of parsed) {
          if (!row.entryRef) continue;
          if (existing.has(row.entryRef) || seen.has(row.entryRef)) {
            row.duplicate = true;
            row.include = false;
          } else {
            seen.add(row.entryRef);
          }
        }
      } finally {
        setCheckingDuplicates(false);
      }
    }

    // Source-aware exact-duplicate detection against the database: same day,
    // amount, type and concept. An entry reference (nº de apunte) only
    // identifies a movement WITHIN its own source, so two movements that share
    // the key are treated as the SAME operation UNLESS they share the source AND
    // both carry an entry reference — only then are they genuinely different
    // (e.g. two identical bank transfers with different references, kept via the
    // (source, entry_ref) dedup above). In practice a row is flagged as
    // duplicate when a matching row exists from a DIFFERENT source, or when
    // either side lacks an entry reference.
    if (!isUpdateMode) {
      const inserts = parsed.filter((r) => !r.id && !r.duplicate);
      const dates = inserts.map((r) => normalizeDate(r.date)).filter(Boolean);
      if (dates.length) {
        setCheckingDuplicates(true);
        try {
          // Source the rows will be written with (they all share it). Must match
          // what confirmImport actually inserts (always `origin`), otherwise the
          // same-source check below reasons about the wrong source.
          const importSource: string = origin;
          const minDate = dates.reduce((a, b) => (a < b ? a : b));
          const maxDate = dates.reduce((a, b) => (a > b ? a : b));
          // Paginate: supabase-js caps a single select at 1000 rows by default,
          // so a wide date range could silently miss existing movements and let
          // duplicates through. Read the whole range in pages.
          const existing: {
            occurred_on: string;
            amount: number | string;
            type: string;
            description: string | null;
            source: string;
            entry_ref: string | null;
          }[] = [];
          const pageSize = 1000;
          for (let from = 0; ; from += pageSize) {
            const { data: page } = await supabase
              .from("transactions")
              .select("occurred_on, amount, type, description, source, entry_ref")
              .gte("occurred_on", minDate)
              .lte("occurred_on", maxDate)
              .range(from, from + pageSize - 1);
            if (!page?.length) break;
            existing.push(...page);
            if (page.length < pageSize) break;
          }
          // Per key: which sources already have a row, and whether any existing
          // row lacks an entry reference.
          const existingSources = new Map<string, Set<string>>();
          const existingNoRef = new Set<string>();
          existing.forEach(
            (d: {
              occurred_on: string;
              amount: number | string;
              type: string;
              description: string | null;
              source: string;
              entry_ref: string | null;
            }) => {
              const key = exactDuplicateKey(
                d.occurred_on,
                Number(d.amount),
                d.type,
                d.description ?? ""
              );
              const set = existingSources.get(key) ?? new Set<string>();
              set.add(d.source);
              existingSources.set(key, set);
              if (!d.entry_ref) existingNoRef.add(key);
            }
          );
          // Track rows already accepted within this same file so repeats are
          // caught too. Every row here shares importSource, so a repeat is a
          // duplicate unless both rows carry an entry reference.
          const seenAny = new Set<string>();
          const seenNoRef = new Set<string>();
          for (const row of parsed) {
            if (row.id || row.duplicate) continue;
            const key = exactDuplicateKey(
              normalizeDate(row.date),
              row.amount,
              row.type,
              row.description
            );
            const srcs = existingSources.get(key);
            const matchesExisting =
              existingNoRef.has(key) ||
              (!!srcs &&
                (Array.from(srcs).some((s) => s !== importSource) ||
                  !row.entryRef));
            const matchesInFile = row.entryRef
              ? seenNoRef.has(key)
              : seenAny.has(key);
            if (matchesExisting || matchesInFile) {
              row.duplicate = true;
              row.include = false;
            } else {
              seenAny.add(key);
              if (!row.entryRef) seenNoRef.add(key);
            }
          }
        } finally {
          setCheckingDuplicates(false);
        }
      }
    }

    setRows(parsed);
    setStep("review");

    const needsSuggestion = parsed.filter((r) => r.include && (!r.categoryId || !r.memberId));
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

      // Never send rows with an unparseable date, even if re-checked manually:
      // occurred_on would be empty and the insert/update would fail.
      const included = rows.filter((r) => r.include && !r.dateInvalid);
      const toUpdate = included.filter((r) => r.id);
      const toInsert = included.filter((r) => !r.id);

      if (toUpdate.length) {
        const results = await Promise.all(
          toUpdate.map((r) =>
            supabase
              .from("transactions")
              .update({
                type: r.type,
                amount: r.amount,
                description: r.description,
                merchant: r.merchant || null,
                occurred_on: normalizeDate(r.date),
                category_id: r.categoryId || null,
                assigned_member_id: r.memberId || null,
                notes: r.notes || null,
              })
              .eq("id", r.id)
          )
        );
        const updateError = results.find((res) => res.error)?.error;
        if (updateError) throw updateError;
      }

      if (toInsert.length) {
        const payload = toInsert.map((r) => ({
          type: r.type,
          amount: r.amount,
          description: r.description,
          merchant: r.merchant || null,
          occurred_on: normalizeDate(r.date),
          category_id: r.categoryId || null,
          assigned_member_id: r.memberId || null,
          notes: r.notes || null,
          // Use the selected origin (bank/general) as the source so bank
          // documents are always stored as "bank". We no longer fall back to
          // "csv" when no entry-ref column is mapped.
          source: origin,
          entry_ref: r.entryRef || null,
          value_date: r.valueDate || null,
          balance: r.balance ?? null,
          raw_import_row: rawRows[r.index],
          created_by: user?.email,
        }));

        // Los duplicados por (origen, nº apunte) ya se descartan en el cliente
        // (buildRowsAndSuggest), así que insertamos directamente. No usamos
        // upsert con onConflict porque el índice único es PARCIAL
        // (where entry_ref is not null) y Postgres no lo admite como árbitro de
        // ON CONFLICT sin su predicado, lo que hacía fallar toda la inserción.
        const { error: insertError } = await supabase
          .from("transactions")
          .insert(payload);
        if (insertError) throw insertError;
      }

      const { error: logError } = await supabase.from("csv_imports").insert({
        filename: fileName,
        imported_by: user?.email,
        row_count: included.length,
      });
      // El registro del import es secundario: si falla, no revertimos la
      // importación ya realizada, solo lo dejamos en consola.
      if (logError) console.error("No se pudo registrar el import:", logError);

      const skippedNote = duplicateCount ? ` (${duplicateCount} duplicado(s) ignorados)` : "";
      toast.success(
        toUpdate.length && toInsert.length
          ? `${toInsert.length} movimiento(s) añadidos y ${toUpdate.length} actualizados.`
          : toUpdate.length
          ? `${toUpdate.length} movimiento(s) actualizados.`
          : `${toInsert.length} movimiento(s) importados.${skippedNote}`
      );

      setStep("upload");
      setRawRows([]);
      setRows([]);
      setFileName("");
    } catch (err) {
      console.error(err);
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
      toast.error(
        message
          ? `No se ha podido completar la importación: ${message}`
          : "No se ha podido completar la importación."
      );
    } finally {
      setSaving(false);
    }
  }

  const includedCount = rows.filter((r) => r.include).length;
  const updateCount = rows.filter((r) => r.include && r.id).length;
  const insertCount = includedCount - updateCount;
  const duplicateCount = rows.filter((r) => r.duplicate).length;
  const invalidCount = rows.filter((r) => r.dateInvalid).length;
  // Show the status column whenever a row can carry a state badge
  // (update/dedup modes) or when exact duplicates / invalid dates were detected.
  const showStatus =
    isUpdateMode || isDedupMode || duplicateCount > 0 || invalidCount > 0;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Importar movimientos"
        description="Sube movimientos del banco o generales (CSV o Excel). Los que ya existan según su nº de apunte se ignoran automáticamente. También puedes volver a subir un archivo exportado desde Movimientos para actualizarlos."
      />

      {step === "upload" && (
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <label className="text-xs font-medium text-slate-600">
              ¿Qué vas a importar?
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOrigin("bank")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  origin === "bank"
                    ? "border-slate-900 bg-slate-50 text-slate-900"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                Movimientos del banco
              </button>
              <button
                type="button"
                onClick={() => setOrigin("general")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  origin === "general"
                    ? "border-slate-900 bg-slate-50 text-slate-900"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                Movimientos generales
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Los movimientos cuyo nº de apunte ya exista en este origen se
              ignorarán automáticamente.
            </p>
          </div>

          {origin === "bank" && (
            <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900">
              <p className="flex items-center gap-2 font-medium">
                <InfoIcon className="size-4 shrink-0" />
                Formato del extracto del banco
              </p>
              <p>
                Sube el mismo tipo de archivo que descargas del banco (CSV o
                Excel), sin modificarlo. Puede traer filas de cabecera con{" "}
                <strong>Nombre</strong> e <strong>IBAN</strong>; se detectan
                solas. La fila de encabezados debe tener estas columnas:
              </p>
              <ul className="ml-1 space-y-0.5">
                <li>
                  · <strong>Fecha de la operación</strong> — fecha del
                  movimiento (DD/MM/AAAA o AAAA-MM-DD).
                </li>
                <li>
                  · <strong>Fecha valor</strong> — opcional.
                </li>
                <li>
                  · <strong>Tipo movimiento</strong> — descripción / concepto.
                </li>
                <li>
                  · <strong>Importe</strong> — negativo para gastos, positivo
                  para ingresos.
                </li>
                <li>
                  · <strong>Saldo</strong> — opcional.
                </li>
                <li>
                  · <strong>Nro. Apunte</strong> — referencia única; sirve para
                  no importar dos veces el mismo movimiento.
                </li>
              </ul>
              <p className="text-sky-700">
                En el siguiente paso podrás revisar y ajustar a qué columna
                corresponde cada dato.
              </p>
            </div>
          )}

          {origin === "general" && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              <p className="flex items-center gap-2 font-medium">
                <InfoIcon className="size-4 shrink-0" />
                Formato de los movimientos generales
              </p>
              <p>
                Son movimientos que no vienen del banco. Descarga la plantilla,
                rellena una fila por movimiento y súbela (CSV o Excel). Columnas:
              </p>
              <ul className="ml-1 space-y-0.5">
                <li>
                  · <strong>Fecha</strong> — opcional. Si la dejas vacía se usa
                  la fecha de hoy y se anota en las observaciones.
                </li>
                <li>
                  · <strong>Descripción</strong> — de qué se trata el
                  movimiento.
                </li>
                <li>
                  · <strong>Comercio / origen</strong> — opcional.
                </li>
                <li>
                  · <strong>Importe</strong> — negativo para gastos, positivo
                  para ingresos.
                </li>
                <li>
                  · <strong>Categoría</strong> — opcional; debe coincidir con
                  una categoría existente.
                </li>
                <li>
                  · <strong>Persona</strong> — opcional; debe coincidir con un
                  miembro existente.
                </li>
                <li>
                  · <strong>Nº Apunte</strong> — opcional; referencia única para
                  no importar dos veces el mismo movimiento.
                </li>
                <li>
                  · <strong>Observaciones</strong> — opcional; notas libres del
                  movimiento.
                </li>
              </ul>
              <p className="text-slate-500">
                La plantilla incluye una fila de ejemplo: bórrala o sustitúyela
                por tus datos.
              </p>
              <button
                type="button"
                onClick={downloadGeneralTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <DownloadIcon className="size-3.5" />
                Descargar plantilla
              </button>
            </div>
          )}

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
          {!isUpdateMode && (
            <p className="text-xs text-slate-500">
              Origen:{" "}
              <strong className="text-slate-700">
                {origin === "bank"
                  ? "Movimientos del banco"
                  : "Movimientos generales"}
              </strong>
              . Los movimientos cuyo nº de apunte ya exista en este origen se
              ignorarán automáticamente.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500">Columna de fecha</label>
              <Select
                value={dateCol || NONE}
                onValueChange={(v) => setDateCol(v === NONE ? "" : v)}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>-</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Columna de concepto</label>
              <Select
                value={descCol || NONE}
                onValueChange={(v) => setDescCol(v === NONE ? "" : v)}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>-</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500">
                Columna de importe (negativo = gasto)
              </label>
              <Select
                value={amountCol || NONE}
                onValueChange={(v) => setAmountCol(v === NONE ? "" : v)}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>-</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500">
                Columna de fecha valor (opcional)
              </label>
              <Select
                value={valueDateCol || NONE}
                onValueChange={(v) => setValueDateCol(v === NONE ? "" : v)}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>-</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500">
                Columna de saldo (opcional)
              </label>
              <Select
                value={balanceCol || NONE}
                onValueChange={(v) => setBalanceCol(v === NONE ? "" : v)}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>-</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isUpdateMode && (
              <div>
                <label className="text-xs text-slate-500">
                  Columna de nº apunte (para no duplicar)
                </label>
                <Select
                  value={entryRefCol || NONE}
                  onValueChange={(v) => setEntryRefCol(v === NONE ? "" : v)}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue placeholder="-" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>-</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
          {isDedupMode && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Origen: <strong>{origin === "bank" ? "Movimientos del banco" : "Movimientos generales"}</strong>.
              {duplicateCount > 0
                ? ` ${duplicateCount} movimiento(s) ya existentes se ignorarán.`
                : " No se han encontrado duplicados."}
            </p>
          )}
          {!isDedupMode && duplicateCount > 0 && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangleIcon className="size-4 shrink-0" />
              {duplicateCount} movimiento(s) ya están dados de alta (mismo día,
              importe y concepto) y se han desmarcado para no duplicarlos.
            </p>
          )}
          {invalidCount > 0 && (
            <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangleIcon className="size-4 shrink-0" />
              {invalidCount} fila(s) tienen una fecha que no se ha podido leer y se
              han excluido. Revisa la columna de fecha o corrígelas en el archivo.
            </p>
          )}
          {checkingDuplicates && (
            <p className="text-sm text-slate-500">Comprobando movimientos ya existentes...</p>
          )}
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
                  {showStatus && (
                    <th className="px-3 py-2 font-normal">Estado</th>
                  )}
                  <th className="px-3 py-2 font-normal">Fecha</th>
                  <th className="px-3 py-2 font-normal">Concepto</th>
                  <th className="px-3 py-2 font-normal">Importe</th>
                  <th className="px-3 py-2 font-normal">Categoría</th>
                  <th className="px-3 py-2 font-normal">Persona</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.index}
                    className={`border-b border-slate-50 ${
                      r.duplicate || r.dateInvalid ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.include}
                        disabled={r.dateInvalid}
                        onChange={(e) =>
                          updateRow(r.index, { include: e.target.checked })
                        }
                      />
                    </td>
                    {showStatus && (
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.dateInvalid
                              ? "bg-red-50 text-red-700"
                              : r.duplicate
                              ? "bg-slate-100 text-slate-500"
                              : r.id
                              ? "bg-amber-50 text-amber-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {r.dateInvalid
                            ? "Fecha inválida"
                            : r.duplicate
                            ? "Ya existe"
                            : r.id
                            ? "Actualizar"
                            : "Nuevo"}
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
                      <Select
                        value={r.categoryId || NONE}
                        onValueChange={(v) =>
                          updateRow(r.index, {
                            categoryId: v === NONE ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>-</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5">
                      <Select
                        value={r.memberId || NONE}
                        onValueChange={(v) =>
                          updateRow(r.index, {
                            memberId: v === NONE ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>-</SelectItem>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name || m.email || "Sin nombre"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
              : isDedupMode
              ? `Importar ${includedCount} nuevos${
                  duplicateCount ? ` (${duplicateCount} ignorados)` : ""
                }`
              : `Importar ${includedCount} movimientos${
                  duplicateCount ? ` (${duplicateCount} ya existentes ignorados)` : ""
                }`}
          </button>
        </div>
      )}
    </div>
  );
}

function normalizeDate(d: string): string {
  // Normalize DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD; leave ISO as is.
  // Returns "" when the date cannot be parsed so the caller can flag the row
  // instead of silently inventing today's date (which would break dedup and
  // file the movement in the wrong month).
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return "";
}
