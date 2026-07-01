import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { NomenclaturesTabsNav } from "@/components/nomenclatures/nomenclatures-tabs-nav"
import { PageHeader } from "@/components/page-header"

export default function NomenclaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
              <div className="max-w-3xl space-y-6">
                <PageHeader
                  title="Nomencladores"
                  description="Gestiona los nomencladores usados en los movimientos: categorías, miembros de la casa y emails con acceso."
                />
                <NomenclaturesTabsNav />
                {children}
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
