import { createClient } from "@/lib/supabase/server"
import { TransactionsDataTable } from "@/components/transactions-data-table"
import type { Category, Member, Transaction } from "@/lib/types"

export default async function TransactionsPage() {
  const supabase = await createClient()

  const [{ data: transactions }, { data: categories }, { data: members }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*, categories(id, name, color), members(id, name, color)")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
      supabase.from("members").select("*").order("name"),
    ])

  return (
    <div className="space-y-4">
      <TransactionsDataTable
        data={(transactions ?? []) as unknown as Transaction[]}
        categories={(categories ?? []) as Category[]}
        members={(members ?? []) as Member[]}
      />
    </div>
  )
}
