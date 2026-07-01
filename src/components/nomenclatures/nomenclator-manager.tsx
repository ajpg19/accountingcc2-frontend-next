"use client";

import { useEffect, useMemo, useState } from "react";
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

type Item = {
  id: string;
  name: string | null;
  color: string;
  email?: string | null;
};

function byName(a: Item, b: Item) {
  return (a.name ?? "").localeCompare(b.name ?? "");
}

export function NomenclatorManager({
  table,
  usageColumn,
  label,
  withEmail = false,
}: {
  /** Nombre de la tabla en Supabase: "categories" o "members" */
  table: "categories" | "members";
  /** Columna en `transactions` que referencia esta tabla */
  usageColumn: "category_id" | "assigned_member_id";
  /** Etiqueta singular para mensajes, ej. "categoría" / "miembro" */
  label: string;
  /** Si true, muestra también un campo de email (para miembros) */
  withEmail?: boolean;
}) {
  const supabase = createClient();

  const [items, setItems] = useState<Item[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#94a3b8");
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, Item>>({});

  async function load() {
    const [{ data, error }, { data: usageRows, error: usageError }] =
      await Promise.all([
        supabase.from(table).select("*").order("name"),
        supabase.from("transactions").select(usageColumn),
      ]);

    if (error) {
      console.error(`Error cargando ${table}:`, error);
      setLoadError(error.message);
      setItems([]);
    } else {
      setItems((data as Item[]) ?? []);
    }

    if (usageError) {
      console.error("Error calculando uso:", usageError);
    } else {
      const counts: Record<string, number> = {};
      for (const row of (usageRows as Record<string, string | null>[]) ?? []) {
        const id = row[usageColumn];
        if (!id) continue;
        counts[id] = (counts[id] ?? 0) + 1;
      }
      setUsage(counts);
    }

    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftFor = useMemo(
    () => (item: Item) => drafts[item.id] ?? item,
    [drafts]
  );

  function updateDraft(item: Item, patch: Partial<Item>) {
    setDrafts((d) => ({ ...d, [item.id]: { ...draftFor(item), ...patch } }));
  }

  function isDirty(item: Item) {
    const d = drafts[item.id];
    if (!d) return false;
    return (
      d.name !== item.name ||
      d.color !== item.color ||
      (withEmail && d.email !== item.email)
    );
  }

  async function saveItem(item: Item) {
    const draft = draftFor(item);
    if (!draft.name?.trim()) {
      toast.error(`El nombre no puede estar vacío`);
      return;
    }
    setSavingId(item.id);
    const payload: Record<string, unknown> = {
      name: draft.name.trim(),
      color: draft.color,
    };
    if (withEmail) payload.email = draft.email || null;

    const { error } = await supabase.from(table).update(payload).eq("id", item.id);
    setSavingId(null);
    if (error) {
      console.error(`Error guardando ${table}:`, error);
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success(`${label} actualizada`);
    setDrafts((d) => {
      const next = { ...d };
      delete next[item.id];
      return next;
    });
    setItems((items) =>
      items
        .map((i) => (i.id === item.id ? { ...i, ...payload } : i))
        .sort(byName)
    );
  }

  async function deleteItem(item: Item) {
    const count = usage[item.id] ?? 0;
    if (count > 0) {
      toast.error(
        `No se puede borrar "${item.name}": ${count} movimiento(s) la usan`
      );
      return;
    }
    if (!window.confirm(`¿Borrar "${item.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeletingId(item.id);
    const { error } = await supabase.from(table).delete().eq("id", item.id);
    setDeletingId(null);
    if (error) {
      console.error(`Error borrando ${table}:`, error);
      toast.error(`No se pudo borrar: ${error.message}`);
      return;
    }
    toast.success(`${label} borrada`);
    setItems((items) => items.filter((i) => i.id !== item.id));
  }

  async function createItem() {
    if (!newName.trim()) {
      toast.error("Escribe un nombre");
      return;
    }
    setCreating(true);
    const payload: Record<string, unknown> = {
      name: newName.trim(),
      color: newColor,
    };
    if (withEmail) payload.email = newEmail.trim() || null;

    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select()
      .single();
    setCreating(false);
    if (error) {
      console.error(`Error creando ${table}:`, error);
      toast.error(`No se pudo crear: ${error.message}`);
      return;
    }
    toast.success(`${label} creada`);
    setItems((items) => [...items, data as Item].sort(byName));
    setNewName("");
    setNewColor("#94a3b8");
    setNewEmail("");
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
        <code>allowed_emails</code> de Supabase, y que las políticas RLS de{" "}
        <code>{table}</code> permitan lectura para tu usuario.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No hay ninguna fila en <code>{table}</code> visible para tu usuario.
          Si sabes que la tabla tiene datos, es casi seguro un problema de
          permisos (RLS) — abre la consola del navegador para ver el error
          exacto de Supabase.
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Color</TableHead>
                <TableHead>Nombre</TableHead>
                {withEmail && <TableHead>Email</TableHead>}
                <TableHead className="w-28 text-right">Uso</TableHead>
                <TableHead className="w-40 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const draft = draftFor(item);
                const dirty = isDirty(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <input
                        type="color"
                        value={draft.color}
                        onChange={(e) =>
                          updateDraft(item, { color: e.target.value })
                        }
                        className="size-8 cursor-pointer rounded border border-slate-200 p-0.5"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.name ?? ""}
                        placeholder="Sin nombre todavía"
                        onChange={(e) =>
                          updateDraft(item, { name: e.target.value })
                        }
                        className="h-8"
                      />
                    </TableCell>
                    {withEmail && (
                      <TableCell>
                        <Input
                          value={draft.email ?? ""}
                          onChange={(e) =>
                            updateDraft(item, { email: e.target.value })
                          }
                          placeholder="opcional"
                          className="h-8"
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-right text-slate-500">
                      {usage[item.id] ?? 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          disabled={!dirty || savingId === item.id}
                          onClick={() => saveItem(item)}
                        >
                          {savingId === item.id ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            "Guardar"
                          )}
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="destructive"
                          disabled={deletingId === item.id}
                          onClick={() => deleteItem(item)}
                          title="Borrar"
                        >
                          {deletingId === item.id ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2Icon className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="mb-3 text-xs font-medium text-slate-500">
          Añadir {label}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="size-8 cursor-pointer rounded border border-slate-200 p-0.5"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`Nombre de ${label}`}
            className="h-8 w-56"
          />
          {withEmail && (
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email (opcional)"
              className="h-8 w-56"
            />
          )}
          <Button size="sm" onClick={createItem} disabled={creating}>
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
