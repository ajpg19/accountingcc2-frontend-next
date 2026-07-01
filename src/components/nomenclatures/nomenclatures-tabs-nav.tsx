"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/nomenclatures/categories", label: "Categorías" },
  { href: "/nomenclatures/members", label: "Miembros" },
  { href: "/nomenclatures/allowed-emails", label: "Emails permitidos" },
];

export function NomenclaturesTabsNav() {
  const pathname = usePathname();

  return (
    <div className="inline-flex w-fit items-center gap-[3px] rounded-lg bg-muted p-[3px]">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
