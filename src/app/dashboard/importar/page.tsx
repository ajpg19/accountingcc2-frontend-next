import { redirect } from "next/navigation";

// Ruta antigua en español. Se mantiene solo como redirección a la nueva
// ruta en inglés: /dashboard/import
export default function ImportarRedirect() {
  redirect("/dashboard/import");
}
