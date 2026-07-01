import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-semibold text-slate-900">
            Gastos Casa
          </Link>
          <nav className="flex items-center gap-5 text-sm text-slate-600">
            <Link href="/dashboard" className="hover:text-slate-900">
              Movimientos
            </Link>
            <Link href="/dashboard/nueva" className="hover:text-slate-900">
              Añadir
            </Link>
            <Link href="/dashboard/importar" className="hover:text-slate-900">
              Importar CSV
            </Link>
            <Link href="/dashboard/reportes" className="hover:text-slate-900">
              Reportes
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
