import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { rows } = (await req.json()) as {
    rows: { index: number; description: string; amount: number }[];
  };

  const { data: categories } = await supabase.from("categories").select("name");
  const { data: members } = await supabase.from("members").select("name");

  const categoryNames = (categories ?? []).map((c) => c.name);
  const memberNames = (members ?? []).map((m) => m.name);

  const anthropic = getAnthropicClient();

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    tools: [
      {
        name: "sugerir_filas",
        description:
          "Sugiere categoría y persona asignada para cada movimiento importado de un CSV bancario.",
        input_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "number" },
                  category: { type: "string", enum: categoryNames.length ? categoryNames : undefined },
                  member: {
                    type: "string",
                    description:
                      "Nombre de la persona a la que asignar el movimiento, si se detecta por el texto (ej. una transferencia con su nombre). Vacío si no hay pista suficiente.",
                  },
                  confidence: { type: "number" },
                },
                required: ["index", "category", "confidence"],
              },
            },
          },
          required: ["suggestions"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "sugerir_filas" },
    messages: [
      {
        role: "user",
        content: `Estos son movimientos bancarios de la cuenta de una casa compartida. Para cada uno sugiere la categoría más adecuada y, si el texto menciona o insinúa a alguna de estas personas (${memberNames.join(
          ", "
        )}), asígnaselo. Si no hay pista, deja "member" vacío.

Categorías disponibles: ${categoryNames.join(", ")}

Movimientos:
${rows
  .map((r) => `[${r.index}] ${r.description} | importe: ${r.amount}`)
  .join("\n")}`,
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ suggestions: [] });
  }

  return NextResponse.json(toolUse.input);
}
