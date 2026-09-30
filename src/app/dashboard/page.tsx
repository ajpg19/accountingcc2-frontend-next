import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { SectionCards } from "@/components/section-cards"
import { ChartAreaInteractive, type DailyPoint } from "@/components/chart-area-interactive"
import { Button } from "@/components/ui/button"
import { formatOccurred } from "@/lib/utils"
import type { Transaction } from "@/lib/types"

function formatMoney(n: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(n)
}

// Wall-clock day in UTC as YYYY-MM-DD (matches how the DB views group dates).
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const now = new Date()
  // First day of the current month (UTC), matching transaction_monthly_totals.
  const monthStart = utcDay(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  )
  // Window start for the 90-day series (inclusive of today → 90 points).
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  windowStart.setUTCDate(windowStart.getUTCDate() - 89)

  // Everything is pre-aggregated in the DB (views 0016), so these are small,
  // indexed reads instead of pulling raw transactions and summing in JS.
  const [monthRes, dailyRes, countRes, latestRes] = await Promise.all([
    supabase
      .from("transaction_monthly_totals")
      .select("gastos, ingresos")
      .eq("month", monthStart)
      .maybeSingle(),
    supabase
      .from("transaction_daily_totals")
      .select("day, gastos, ingresos")
      .gte("day", utcDay(windowStart))
      .order("day", { ascending: true }),
    supabase
      .from("transactions")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("transactions")
      .select("*, categories(id, name, color), members(id, name, color)")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  if (monthRes.error) console.error("Error cargando totales del mes:", monthRes.error)
  if (dailyRes.error) console.error("Error cargando serie diaria:", dailyRes.error)
  if (countRes.error) console.error("Error contando movimientos:", countRes.error)
  if (latestRes.error) console.error("Error cargando últimos movimientos:", latestRes.error)

  const gastosMes = Number(monthRes.data?.gastos ?? 0)
  const ingresosMes = Number(monthRes.data?.ingresos ?? 0)
  const numMovimientos = countRes.count ?? 0
  const rows = (latestRes.data ?? []) as unknown as Transaction[]

  // Fill zero-gaps so the area chart is continuous across the 90-day window.
  const dailyByDay = new Map(
    (dailyRes.data ?? []).map((r) => [
      r.day as string,
      { gastos: Number(r.gastos), ingresos: Number(r.ingresos) },
    ]),
  )
  const dailySeries: DailyPoint[] = []
  for (let d = new Date(windowStart); d <= now; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = utcDay(d)
    const v = dailyByDay.get(key) ?? { gastos: 0, ingresos: 0 }
    dailySeries.push({ date: key, ...v })
  }

  return (
    <div className="space-y-6">
      <SectionCards
        gastosMes={gastosMes}
        ingresosMes={ingresosMes}
        balanceMes={ingresosMes - gastosMes}
        numMovimientos={numMovimientos}
      />

      <ChartAreaInteractive data={dailySeries} />

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-medium text-card-foreground">Últimos movimientos</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/transactions">Ver todos</Link>
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-5 py-2 font-normal">Fecha</th>
                <th className="px-5 py-2 font-normal">Descripción</th>
                <th className="px-5 py-2 font-normal">Categoría</th>
                <th className="px-5 py-2 font-normal">Persona</th>
                <th className="px-5 py-2 font-normal text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    Aún no hay movimientos. Añade el primero.
                  </td>
                </tr>
              )}
              {rows.slice(0, 5).map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-5 py-2 text-muted-foreground">
                    {formatOccurred(t.occurred_on)}
                  </td>
                  <td className="px-5 py-2">{t.description || t.merchant || "—"}</td>
                  <td className="px-5 py-2">
                    {t.categories && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs text-white"
                        style={{ backgroundColor: t.categories.color }}
                      >
                        {t.categories.name}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-muted-foreground">{t.members?.name || "—"}</td>
                  <td
                    className={`px-5 py-2 text-right font-medium ${
                      t.type === "expense" ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {t.type === "expense" ? "-" : "+"}
                    {formatMoney(Number(t.amount), t.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
