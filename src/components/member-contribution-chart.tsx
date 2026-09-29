"use client"

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export type MemberContribution = {
  member_name: string
  total_income: number
}

const chartConfig = {
  total_income: {
    label: "Aportación",
    // Blue, matching the shadcn charts gallery (the project theme uses a
    // neutral chart palette, so we set the blue explicitly).
    color: "#2563eb",
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
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Aportación por persona</CardTitle>
        <CardDescription>
          Total de ingresos asignados a cada miembro (aportaciones de directos +
          ingresos de banco)
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
