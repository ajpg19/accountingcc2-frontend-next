import { PageHeader } from "@/components/page-header"
import {
  MemberContributionChart,
  type MemberContribution,
} from "@/components/member-contribution-chart"
import { createClient } from "@/lib/supabase/server"

export default async function ReportsPage() {
  const supabase = await createClient()

  // Reads the aggregated view (see migration 0016). Income per member is
  // pre-grouped in the DB, so this is a single fast query.
  const { data, error } = await supabase
    .from("member_contribution_totals")
    .select("member_name, total_income")
    .order("total_income", { ascending: false })

  if (error) console.error("Error cargando aportación por persona:", error)

  const rows = (data ?? []).map((r) => ({
    member_name: r.member_name,
    total_income: Number(r.total_income),
  })) as MemberContribution[]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reportes"
        description="Visualiza y analiza los movimientos con gráficos."
      />
      <MemberContributionChart data={rows} />
    </div>
  )
}
