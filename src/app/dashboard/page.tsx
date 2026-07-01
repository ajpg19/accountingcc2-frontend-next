import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { SectionCards } from "@/components/section-cards"
import { ChartAreaInteractive, type DailyPoint } from "@/components/chart-area-interactive"
import { Button } from "@/components/ui/button"
import type { Transaction } from "@/lib/types"

function formatMoney(n: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(n)
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from("transactions")
    .select("*, categories(id, name, color), members(id, name, color)")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as Transaction[]

  const now = new Date()
  const thisMonth = rows.filter((t) => {
    const d = new Date(t.occurred_on)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })

  const gastosMes = thisMonth
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0)
  const ingresosMes = thisMonth
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0)

  // Serie diaria de los últimos 90 días para el gráfico
  const dailyMap = new Map<string, { gastos: number; ingresos: number }>()
  const start = new Date()
  start.setDate(start.getDate() - 90)
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    dailyMap.set(d.toISOString().slice(0, 10), { gastos: 0, ingresos: 0 })
  }
  for (const t of rows) {
    const key = t.occurred_on.slice(0, 10)
    const entry = dailyMap.get(key)
    if (entry) {
      if (t.type === "expense") entry.gastos += Number(t.amount)
      else entry.ingresos += Number(t.amount)
    }
  }
  const dailySeries: DailyPoint[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  return (
    <div className="space-y-6">
      <SectionCards
        gastosMes={gastosMes}
        ingresosMes={ingresosMes}
        balanceMes={ingresosMes - gastosMes}
        numMovimientos={rows.length}
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
                    {new Date(t.occurred_on).toLocaleDateString("es-ES")}
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
