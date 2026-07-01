import { createClient } from "@/lib/supabase/server"
import { MovementLogTable } from "@/components/movement-log-table"
import { PageHeader } from "@/components/page-header"
import type { Category, Member, MovementLog } from "@/lib/types"

export default async function MovementHistoryPage() {
  const supabase = await createClient()

  const [
    { data: logs, error: logsError },
    { data: categories, error: catsError },
    { data: members, error: memsError },
  ] = await Promise.all([
    supabase
      .from("movement_log")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(500),
    supabase.from("categories").select("*").order("name"),
    supabase.from("members").select("*").order("name"),
  ])

  if (logsError) console.error("Error cargando historial:", logsError)
  if (catsError) console.error("Error cargando categorías:", catsError)
  if (memsError) console.error("Error cargando miembros:", memsError)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Historial de movimientos"
        description="Registro de todas las altas, ediciones y borrados sobre los movimientos."
      />
      <MovementLogTable
        data={(logs ?? []) as unknown as MovementLog[]}
        categories={(categories ?? []) as Category[]}
        members={(members ?? []) as Member[]}
      />
    </div>
  )
}
