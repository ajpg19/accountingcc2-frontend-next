import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Si el email autenticado todavía no tiene fila en `members`, la crea
 * con solo el email (sin nombre). El resto de datos (nombre, color)
 * se completan después desde la vista de miembros en Settings.
 */
export async function ensureMemberExists(
  supabase: SupabaseClient,
  email: string
) {
  const { data: existing, error: selectError } = await supabase
    .from("members")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (selectError) {
    console.error("Error comprobando member existente:", selectError);
    return;
  }

  if (existing) return;

  const { error: insertError } = await supabase
    .from("members")
    .insert({ email });

  if (insertError) {
    console.error("Error creando member para", email, insertError);
  }
}
