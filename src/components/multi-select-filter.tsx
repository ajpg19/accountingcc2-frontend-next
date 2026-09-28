"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

export type MultiSelectOption = {
  value: string
  label: string
  // Optional color swatch shown before the label (e.g. category color).
  color?: string
}

// Accent- and case-insensitive text for the in-panel search.
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

// Searchable, multi-select filter panel meant to live inside a Popover. Sel
// state is fully controlled by the parent (an array of selected values).
export function MultiSelectFilter({
  options,
  selected,
  onChange,
  searchPlaceholder = "Buscar...",
  emptyLabel = "Sin resultados",
}: {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  searchPlaceholder?: string
  emptyLabel?: string
}) {
  const [query, setQuery] = React.useState("")

  const filtered = React.useMemo(() => {
    const needle = normalize(query.trim())
    if (!needle) return options
    return options.filter((o) => normalize(o.label).includes(needle))
  }, [options, query])

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    )
  }

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        className="h-8 text-xs"
        autoFocus
      />
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(o.value)}
                className="pointer-events-none"
              />
              {o.color && (
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: o.color }}
                />
              )}
              <span className="truncate">{o.label}</span>
            </button>
          ))
        )}
      </div>
      <div className="flex items-center justify-between border-t pt-2">
        <span className="text-xs text-muted-foreground">
          {selected.length} seleccionada(s)
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={selected.length === 0}
          onClick={() => onChange([])}
        >
          Limpiar
        </Button>
      </div>
    </div>
  )
}