import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fuente de la verdad: la tabla `allowed_emails` en Supabase (gestionable
 * desde /nomenclatures/allowed-emails). Antes se comprobaba contra la env
 * var ALLOWED_EMAILS; ahora vive en la base de datos para poder añadir o
 * quitar acceso desde la app sin redeploy.
 */
export async function isEmailAllowed(
  supabase: SupabaseClient,
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const { data } = await supabase
    .from("allowed_emails")
    .select("email")
    .ilike("email", email)
    .maybeSingle();
  return Boolean(data);
}
