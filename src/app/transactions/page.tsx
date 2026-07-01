import Link from "next/link"
import { UploadIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { TransactionsDataTable } from "@/components/transactions-data-table"
import { ExportTransactionsButton } from "@/components/export-transactions-button"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import type { Category, Member, Transaction } from "@/lib/types"

export default async function TransactionsPage() {
  const supabase = await createClient()

  const [
    { data: transactions, error: txError },
    { data: categories, error: catsError },
    { data: members, error: memsError },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("*, categories(id, name, color), members(id, name, color)")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*").order("name"),
    supabase.from("members").select("*").order("name"),
  ])

  if (txError) console.error("Error cargando transacciones:", txError)
  if (catsError) console.error("Error cargando categorías:", catsError)
  if (memsError) console.error("Error cargando miembros:", memsError)

  const rows = (transactions ?? []) as unknown as Transaction[]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Movimientos"
        description="Consulta, filtra y gestiona todos los movimientos registrados."
        actions={
          <>
            <ExportTransactionsButton data={rows} />
            <Button asChild variant="outline" size="sm">
              <Link href="/transactions/import">
                <UploadIcon />
                Importar movimientos del banco
              </Link>
            </Button>
          </>
        }
      />
      <TransactionsDataTable
        data={rows}
        categories={(categories ?? []) as Category[]}
        members={(members ?? []) as Member[]}
      />
    </div>
  )
}
