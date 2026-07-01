import { redirect } from "next/navigation";

// Ruta antigua en español. Se mantiene solo como redirección a la nueva
// ruta en inglés: /dashboard/reports
export default function ReportesRedirect() {
  redirect("/dashboard/reports");
}
