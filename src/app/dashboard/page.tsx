import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { SectionCards } from "@/components/section-cards"
import { ChartAreaInteractive, type DailyPoint } from "@/components/chart-area-interactive"
import { Button } from "@/components/ui/button"
import type { Transaction } from "@/lib/types"

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

      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href="/dashboard/movimientos">Ver todos los movimientos</Link>
        </Button>
      </div>
    </div>
  )
}
