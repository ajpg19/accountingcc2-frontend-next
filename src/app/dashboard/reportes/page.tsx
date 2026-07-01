import { createClient } from "@/lib/supabase/server";
import ReportsCharts from "@/components/ReportsCharts";
import type { Transaction } from "@/lib/types";

export default async function ReportesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("transactions")
    .select("*, categories(id, name, color), members(id, name, color)")
    .order("occurred_on", { ascending: true });

  const rows = (data ?? []) as unknown as Transaction[];

  const monthlyMap = new Map<string, { gastos: number; ingresos: number }>();
  const categoryMap = new Map<string, { value: number; color: string }>();
  const personMap = new Map<string, { gastos: number; ingresos: number }>();

  for (const t of rows) {
    const monthKey = t.occurred_on.slice(0, 7);
    const m = monthlyMap.get(monthKey) || { gastos: 0, ingresos: 0 };
    if (t.type === "expense") m.gastos += Number(t.amount);
    else m.ingresos += Number(t.amount);
    monthlyMap.set(monthKey, m);

    if (t.type === "expense" && t.categories) {
      const c = categoryMap.get(t.categories.name) || {
        value: 0,
        color: t.categories.color,
      };
      c.value += Number(t.amount);
      categoryMap.set(t.categories.name, c);
    }

    const personName = t.members?.name || "Sin asignar";
    const p = personMap.get(personName) || { gastos: 0, ingresos: 0 };
    if (t.type === "expense") p.gastos += Number(t.amount);
    else p.ingresos += Number(t.amount);
    personMap.set(personName, p);
  }

  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  const byCategory = Array.from(categoryMap.entries()).map(([name, v]) => ({
    name,
    ...v,
  }));

  const byPerson = Array.from(personMap.entries()).map(([name, v]) => ({
    name,
    ...v,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Reportes</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aún no hay movimientos suficientes para generar reportes.
        </p>
      ) : (
        <ReportsCharts monthly={monthly} byCategory={byCategory} byPerson={byPerson} />
      )}
    </div>
  );
}
