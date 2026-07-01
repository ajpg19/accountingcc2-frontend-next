"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
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
  ListIcon,
  PlusCircleIcon,
  ChartBarIcon,
  HistoryIcon,
  HomeIcon,
  TagsIcon,
} from "lucide-react"

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "Movimientos",
      url: "/transactions",
      icon: <ListIcon />,
    },
    {
      title: "Reportes",
      url: "/transactions/reports",
      icon: <ChartBarIcon />,
    },
    {
      title: "Historial",
      url: "/transactions/historial",
      icon: <HistoryIcon />,
    },
  ],
  navSecondary: [
    {
      title: "Nomencladores",
      url: "/nomenclatures",
      icon: <TagsIcon />,
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
                <span className="text-base font-semibold">Accounting CC2</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} quickCreateUrl="/transactions/new" quickCreateIcon={<PlusCircleIcon />} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
