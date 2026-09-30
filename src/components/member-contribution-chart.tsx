"use client"

import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export type MemberContribution = {
  member_name: string
  total_income: number
}

export type MemberContributionColored = MemberContribution & {
  member_color: string | null
}

// Converts a #rrggbb hex to an rgba() string with the given alpha, so member
// colors get the same soft, pastel-with-transparency look as the other charts.
function hexToRgba(hex: string | null, alpha: number): string {
  const fallback = `rgba(148, 163, 184, ${alpha})` // slate-400
  if (!hex) return fallback
  const normalized = hex.replace("#", "").trim()
  if (normalized.length !== 6) return fallback
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return fallback
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Turns a member name into a safe key usable both as a chart-config key and in
// a CSS custom property (`--color-<key>`).
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

const chartConfig = {
  total_income: {
    label: "Aportación",
    // Pastel blue with alpha, matching the group pie chart.
    color: "rgba(96, 165, 250, 0.55)",
  },
} satisfies ChartConfig

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
})

export function MemberContributionChart({
  data,
}: {
  data: MemberContribution[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aportación por persona</CardTitle>
        <CardDescription>
          Total de ingresos asignados a cada miembro
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="member_name"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value) => currency.format(Number(value))}
                />
              }
            />
            <Bar
              dataKey="total_income"
              fill="var(--color-total_income)"
              radius={8}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// Groups Alberto + Glenda together and keeps Juan_Fer on its own. The `key`
// doubles as the chart config key so tooltip/legend can resolve label + color.
const GROUPS = [
  { key: "alberto_glenda", members: ["alberto", "glenda"] },
  { key: "juan_fer", members: ["juan_fer"] },
] as const

const groupChartConfig = {
  // Pastel tones with alpha for a softer look.
  alberto_glenda: { label: "Alberto_Glenda", color: "rgba(96, 165, 250, 0.55)" },
  juan_fer: { label: "Juan_Fer", color: "rgba(251, 146, 60, 0.55)" },
} satisfies ChartConfig

export function MemberGroupPieChart({
  data,
}: {
  data: MemberContribution[]
}) {
  const chartData = GROUPS.map((group) => ({
    group: group.key,
    // Per-slice fill via the CSS var ChartContainer derives from the config.
    fill: `var(--color-${group.key})`,
    value: data
      .filter((row) =>
        (group.members as readonly string[]).includes(
          row.member_name.trim().toLowerCase(),
        ),
      )
      .reduce((sum, row) => sum + row.total_income, 0),
  })).filter((slice) => slice.value > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aportación por grupo</CardTitle>
        <CardDescription>Alberto_Glenda - Juan_Fer</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={groupChartConfig} className="h-[220px] w-full">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  nameKey="group"
                  formatter={(value) => currency.format(Number(value))}
                />
              }
            />
            <Pie data={chartData} dataKey="value" nameKey="group" />
            <ChartLegend content={<ChartLegendContent nameKey="group" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function AllContributorsPieChart({
  data,
}: {
  data: MemberContributionColored[]
}) {
  // Build the config and slices from the data so any member with income shows
  // up (including Caja Rural and Juanca), each with its own pastel color.
  const slices = data
    .filter((row) => row.total_income > 0)
    .map((row) => {
      const key = slugify(row.member_name)
      return {
        key,
        label: row.member_name,
        color: hexToRgba(row.member_color, 0.55),
        value: row.total_income,
      }
    })

  const config = slices.reduce<ChartConfig>((acc, slice) => {
    acc[slice.key] = { label: slice.label, color: slice.color }
    return acc
  }, {})

  const chartData = slices.map((slice) => ({
    group: slice.key,
    value: slice.value,
    fill: slice.color,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aportación (todos)</CardTitle>
        <CardDescription>Todos los que han hecho ingresos</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[220px] w-full">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  nameKey="group"
                  formatter={(value) => currency.format(Number(value))}
                />
              }
            />
            <Pie data={chartData} dataKey="value" nameKey="group" />
            <ChartLegend content={<ChartLegendContent nameKey="group" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
