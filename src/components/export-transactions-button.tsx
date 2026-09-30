"use client";

import * as XLSX from "xlsx";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Transaction } from "@/lib/types";

export function ExportTransactionsButton({
  data,
  selectedCount = 0,
}: {
  data: Transaction[];
  // Number of rows explicitly selected in the table. When > 0 the button label
  // reflects the selection instead of the generic "download all" wording.
  selectedCount?: number;
}) {
  function handleExport() {
    const rows = data.map((t) => ({
      ID: t.id,
      Fecha: t.occurred_on?.slice(0, 10),
      // Movement time (UTC wall-clock, see lib/utils). Empty for date-only rows.
      Hora: (() => {
        const hhmm = t.occurred_on?.slice(11, 16) || "";
        return hhmm === "00:00" ? "" : hhmm;
      })(),
      Descripción: t.description || t.merchant || "",
      Importe: t.type === "expense" ? -Math.abs(Number(t.amount)) : Math.abs(Number(t.amount)),
      Categoría: t.categories?.name || "",
      Persona: t.members?.name || "",
      "Fecha valor": t.value_date?.slice(0, 10) || "",
      Saldo: t.balance ?? "",
      "Nº Apunte": t.entry_ref || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 36 },
      { wch: 12 },
      { wch: 8 },
      { wch: 40 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `movimientos-${today}.xlsx`);
  }

  const label =
    selectedCount > 0
      ? `Descargar ${selectedCount} movimiento${selectedCount === 1 ? "" : "s"}`
      : "Descargar movimientos";

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={data.length === 0}
      aria-label={label}
    >
      <DownloadIcon />
      {/* Icon-only on mobile; label shows from the sm breakpoint up. */}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
