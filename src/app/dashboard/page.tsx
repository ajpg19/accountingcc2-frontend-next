import { createClient } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";

function formatMoney(n: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(
    n
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*, categories(id, name, color), members(id, name, color)")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (transactions ?? []) as unknown as Transaction[];

  const now = new Date();
  const thisMonth = rows.filter((t) => {
    const d = new Date(t.occurred_on);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });

  const totalGastos = thisMonth
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalIngresos = thisMonth
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Gastos este mes</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">
            {formatMoney(totalGastos)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Ingresos este mes</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">
            {formatMoney(totalIngresos)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-medium text-slate-700">
            Últimos movimientos
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
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
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    Aún no hay movimientos. Añade el primero.
                  </td>
                </tr>
              )}
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 text-slate-600">
                    {new Date(t.occurred_on).toLocaleDateString("es-ES")}
                  </td>
                  <td className="px-5 py-2 text-slate-900">
                    {t.description || t.merchant || "—"}
                  </td>
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
                  <td className="px-5 py-2 text-slate-600">
                    {t.members?.name || "—"}
                  </td>
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
  );
}
