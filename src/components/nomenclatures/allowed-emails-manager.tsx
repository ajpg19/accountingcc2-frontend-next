"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusIcon, Trash2Icon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

export function AllowedEmailsManager() {
  const supabase = createClient();

  const [emails, setEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);

  async function load() {
    const [{ data, error }, { data: userData }] = await Promise.all([
      supabase.from("allowed_emails").select("email").order("email"),
      supabase.auth.getUser(),
    ]);

    if (error) {
      console.error("Error cargando allowed_emails:", error);
      setLoadError(error.message);
      setEmails([]);
    } else {
      setEmails((data ?? []).map((row) => row.email as string));
    }
    setCurrentEmail(userData.user?.email ?? null);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Escribe un email");
      return;
    }
    if (emails.includes(email)) {
      toast.error("Ese email ya tiene acceso");
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("allowed_emails").insert({ email });
    setCreating(false);
    if (error) {
      console.error("Error añadiendo email permitido:", error);
      toast.error(`No se pudo añadir: ${error.message}`);
      return;
    }
    toast.success("Email añadido");
    setEmails((list) => [...list, email].sort());
    setNewEmail("");
  }

  async function deleteEmail(email: string) {
    if (email === currentEmail) {
      toast.error("No puedes quitarte el acceso a ti mismo");
      return;
    }
    if (!window.confirm(`¿Quitar acceso a "${email}"?`)) {
      return;
    }
    setDeletingEmail(email);
    const { error } = await supabase
      .from("allowed_emails")
      .delete()
      .eq("email", email);
    setDeletingEmail(null);
    if (error) {
      console.error("Error borrando email permitido:", error);
      toast.error(`No se pudo quitar: ${error.message}`);
      return;
    }
    toast.success("Email eliminado");
    setEmails((list) => list.filter((e) => e !== email));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2Icon className="size-4 animate-spin" />
        Cargando...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudieron cargar los datos: {loadError}
        <br />
        Revisa que estés autenticado con un email dado de alta en la tabla{" "}
        <code>allowed_emails</code> de Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Solo estos emails pueden iniciar sesión con Google en la app.
      </p>

      {emails.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No hay ningún email permitido visible para tu usuario.
        </div>
      )}

      {emails.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead className="w-40 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((email) => (
                <TableRow key={email}>
                  <TableCell>
                    {email}
                    {email === currentEmail && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        Tú
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        size="icon-sm"
                        variant="destructive"
                        disabled={
                          deletingEmail === email || email === currentEmail
                        }
                        onClick={() => deleteEmail(email)}
                        title={
                          email === currentEmail
                            ? "No puedes quitarte el acceso a ti mismo"
                            : "Quitar acceso"
                        }
                      >
                        {deletingEmail === email ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2Icon className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="mb-3 text-xs font-medium text-slate-500">
          Añadir email permitido
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="nombre@gmail.com"
            className="h-8 w-64"
            type="email"
          />
          <Button size="sm" onClick={addEmail} disabled={creating}>
            {creating ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <PlusIcon className="size-3.5" />
            )}
            Añadir
          </Button>
        </div>
      </div>
    </div>
  );
}
