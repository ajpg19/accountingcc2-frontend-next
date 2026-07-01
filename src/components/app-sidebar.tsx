"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  PlusCircleIcon,
  UploadIcon,
  ChartBarIcon,
  HomeIcon,
} from "lucide-react"

const data = {
  navMain: [
    {
      title: "Movimientos",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "Importar CSV",
      url: "/dashboard/importar",
      icon: <UploadIcon />,
    },
    {
      title: "Reportes",
      url: "/dashboard/reportes",
      icon: <ChartBarIcon />,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="/dashboard">
                <HomeIcon className="size-5!" />
                <span className="text-base font-semibold">Gastos Casa</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} quickCreateUrl="/dashboard/nueva" quickCreateIcon={<PlusCircleIcon />} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
