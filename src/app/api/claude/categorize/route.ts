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

  const body = await req.json();
  const { description, merchant, amount, type } = body as {
    description?: string;
    merchant?: string;
    amount?: number;
    type?: "expense" | "income";
  };

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name");

  const categoryNames = (categories ?? []).map((c) => c.name);

  const anthropic = getAnthropicClient();

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    tools: [
      {
        name: "clasificar_gasto",
        description:
          "Clasifica un gasto o ingreso en una de las categorías disponibles.",
        input_schema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: categoryNames.length ? categoryNames : undefined,
              description: "Nombre exacto de la categoría más adecuada",
            },
            confidence: {
              type: "number",
              description: "Confianza de 0 a 1",
            },
          },
          required: ["category", "confidence"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "clasificar_gasto" },
    messages: [
      {
        role: "user",
        content: `Clasifica este movimiento de la cuenta de una casa.
Tipo: ${type === "income" ? "ingreso" : "gasto"}
Comercio/origen: ${merchant || "desconocido"}
Descripción: ${description || "sin descripción"}
Importe: ${amount ?? "desconocido"}

Categorías disponibles: ${categoryNames.join(", ")}`,
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ category: null, confidence: 0 });
  }

  return NextResponse.json(toolUse.input);
}
