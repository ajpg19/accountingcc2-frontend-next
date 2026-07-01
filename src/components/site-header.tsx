"use client"

import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/transactions": "Movimientos",
  "/transactions/new": "Nuevo movimiento",
  "/transactions/import": "Importar movimientos del banco",
  "/transactions/reports": "Reportes",
  "/transactions/historial": "Historial de movimientos",
  "/nomenclatures": "Nomencladores",
  "/nomenclatures/categories": "Nomencladores · Categorías",
  "/nomenclatures/members": "Nomencladores · Miembros",
  "/nomenclatures/allowed-emails": "Nomencladores · Emails permitidos",
}

export function SiteHeader() {
  const pathname = usePathname()
  const title = TITLES[pathname] || "Accounting CC2"

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
      </div>
    </header>
  )
}
