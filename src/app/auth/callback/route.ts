import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/allowed-emails";
import { ensureMemberExists } from "@/lib/members";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (!(await isEmailAllowed(supabase, data.user.email))) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=not_allowed`);
      }

      await ensureMemberExists(supabase, data.user.email!);

      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
