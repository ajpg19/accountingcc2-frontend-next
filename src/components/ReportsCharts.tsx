"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type MonthlyPoint = { month: string; gastos: number; ingresos: number };
type CategorySlice = { name: string; value: number; color: string };
type PersonSummary = { name: string; gastos: number; ingresos: number };

export default function ReportsCharts({
  monthly,
  byCategory,
  byPerson,
}: {
  monthly: MonthlyPoint[];
  byCategory: CategorySlice[];
  byPerson: PersonSummary[];
}) {
  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium text-slate-700">
          Evolución mensual
        </h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="gastos" fill="#ef4444" name="Gastos" />
            <Bar dataKey="ingresos" fill="#10b981" name="Ingresos" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-medium text-slate-700">
            Gasto por categoría
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={byCategory}
                dataKey="value"
                nameKey="name"
                outerRadius={100}
                label={(d) => d.name}
              >
                {byCategory.map((c, i) => (
                  <Cell key={i} fill={c.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-medium text-slate-700">
            Por persona
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byPerson} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
              <Tooltip />
              <Legend />
              <Bar dataKey="gastos" fill="#ef4444" name="Gastos" />
              <Bar dataKey="ingresos" fill="#10b981" name="Ingresos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
