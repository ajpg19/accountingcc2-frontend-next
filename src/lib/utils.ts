import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- occurred_on (movement date/time) helpers -----------------------------
//
// occurred_on is a timestamptz that stores the movement's wall-clock date/time
// encoded as a UTC instant (see migration 0013). We always write and read it in
// UTC so the stored value round-trips to the exact wall-clock time regardless
// of where the code runs (browser vs. server), and so day-based grouping that
// slices the ISO string keeps working.

// Convert a wall-clock "YYYY-MM-DD" or "YYYY-MM-DD[ T]HH:MM[:SS]" string into the
// ISO instant to store in occurred_on. Returns null for empty/invalid input.
export function wallClockToUTC(wall: string | null | undefined): string | null {
  if (!wall) return null
  const m = wall.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  )
  if (!m) return null
  const [, y, mo, d, hh = "00", mi = "00", ss = "00"] = m
  return `${y}-${mo}-${d}T${hh.padStart(2, "0")}:${mi}:${ss.padStart(2, "0")}.000Z`
}

// Format an occurred_on instant for display. Always shows the date; appends the
// time only when the movement carries one (non-midnight), so manual/date-only
// entries stay clean. Read in UTC to recover the stored wall-clock time.
export function formatOccurred(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const date = d.toLocaleDateString("es-ES", { timeZone: "UTC" })
  const hasTime =
    d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0
  if (!hasTime) return date
  const time = d.toLocaleTimeString("es-ES", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  })
  return `${date} ${time}`
}
