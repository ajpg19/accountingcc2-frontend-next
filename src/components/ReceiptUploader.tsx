"use client";

import { useState } from "react";
import type { ExtractedReceipt } from "@/lib/types";

type Props = {
  onExtracted: (data: ExtractedReceipt, file: File) => void;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ReceiptUploader({ onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/claude/extract-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType: file.type }),
      });
      if (!res.ok) throw new Error("No se pudo procesar el ticket");
      const data = (await res.json()) as ExtractedReceipt;
      onExtracted(data, file);
    } catch {
      setError("No se pudo leer el ticket. Puedes rellenar los datos a mano.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
      <label className="flex cursor-pointer flex-col items-center gap-1 text-sm text-slate-600">
        <span>{loading ? "Leyendo ticket con Claude..." : "Subir foto de ticket o factura"}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <span className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
          Elegir archivo
        </span>
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
