import { redirect } from "next/navigation";

// Ruta antigua (anidada bajo /dashboard). Se mantiene solo como redirección
// a la nueva ruta en inglés y sin prefijo: /transactions
export default function MovimientosRedirect() {
  redirect("/transactions");
}
