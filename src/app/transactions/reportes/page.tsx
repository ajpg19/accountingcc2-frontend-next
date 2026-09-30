import { PageHeader } from "@/components/page-header"
import {
  AllContributorsPieChart,
  MemberContributionChart,
  MemberGroupPieChart,
  type MemberContribution,
  type MemberContributionColored,
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

  // All contributors (includes Caja Rural and Juanca), with their member color.
  const { data: allData, error: allError } = await supabase
    .from("member_contribution_totals_all")
    .select("member_name, member_color, total_income")
    .order("total_income", { ascending: false })

  if (allError)
    console.error("Error cargando aportación (todos):", allError)

  const allRows = (allData ?? []).map((r) => ({
    member_name: r.member_name,
    member_color: r.member_color,
    total_income: Number(r.total_income),
  })) as MemberContributionColored[]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reportes"
        description="Visualiza y analiza los movimientos con gráficos."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AllContributorsPieChart data={allRows} />
        <MemberGroupPieChart data={rows} />
        <MemberContributionChart data={rows} />
      </div>
    </div>
  )
}
