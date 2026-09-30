import { Suspense } from "react"
import Link from "next/link"
import { UploadIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { TransactionsDataTable } from "@/components/transactions-data-table"
import {
  TransactionsExportButton,
  TransactionsExportProvider,
} from "@/components/transactions-export"
import {
  TransactionsViewSettingsButton,
  TransactionsViewSettingsProvider,
} from "@/components/transactions-view-settings"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { isAdminEmail } from "@/lib/admin"
import type { Category, Member, Transaction } from "@/lib/types"

export default async function TransactionsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAdmin = isAdminEmail(user?.email)

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
    <TransactionsViewSettingsProvider>
      <TransactionsExportProvider initialData={rows}>
        <div className="space-y-4">
          <PageHeader
            title="Movimientos"
            description="Consulta, filtra y gestiona todos los movimientos registrados."
            actions={
              <>
                <TransactionsExportButton />
                {isAdmin && (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/transactions/import" aria-label="Importar movimientos">
                      <UploadIcon />
                      {/* Icon-only on mobile; label shows from the sm breakpoint up. */}
                      <span className="hidden sm:inline">Importar movimientos</span>
                    </Link>
                  </Button>
                )}
                <TransactionsViewSettingsButton />
              </>
            }
          />
          <Suspense fallback={null}>
            <TransactionsDataTable
              data={rows}
              categories={(categories ?? []) as Category[]}
              members={(members ?? []) as Member[]}
            />
          </Suspense>
        </div>
      </TransactionsExportProvider>
    </TransactionsViewSettingsProvider>
  )
}
