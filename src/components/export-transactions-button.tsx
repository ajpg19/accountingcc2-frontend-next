"use client";

import * as XLSX from "xlsx";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Transaction } from "@/lib/types";

export function ExportTransactionsButton({ data }: { data: Transaction[] }) {
  function handleExport() {
    const rows = data.map((t) => ({
      ID: t.id,
      Fecha: t.occurred_on?.slice(0, 10),
      Descripción: t.description || t.merchant || "",
      Importe: t.type === "expense" ? -Math.abs(Number(t.amount)) : Math.abs(Number(t.amount)),
      Categoría: t.categories?.name || "",
      Persona: t.members?.name || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 36 },
      { wch: 12 },
      { wch: 40 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `movimientos-${today}.xlsx`);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0}>
      <DownloadIcon />
      Descargar movimientos
    </Button>
  );
}
