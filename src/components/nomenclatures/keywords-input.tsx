"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Chips-style editor for a list of keywords: type and press Enter (or comma) to
// add, click the X on a chip to remove it, Backspace on an empty input removes
// the last one. Duplicates (case-insensitive) are ignored.
export function KeywordsInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState("");

  function addKeyword(raw: string) {
    const kw = raw.trim();
    setDraft("");
    if (!kw) return;
    if (value.some((v) => v.toLowerCase() === kw.toLowerCase())) return;
    onChange([...value, kw]);
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className
      )}
    >
      {value.map((kw, i) => (
        <span
          key={`${kw}-${i}`}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
        >
          {kw}
          <button
            type="button"
            onClick={() => removeAt(i)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Quitar ${kw}`}
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        // Commit a half-typed keyword when focus leaves, so it isn't lost.
        onBlur={() => addKeyword(draft)}
        placeholder={value.length ? "" : placeholder}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
