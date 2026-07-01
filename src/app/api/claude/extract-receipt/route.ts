import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic";

const EXTRACT_TOOL = {
  name: "extraer_ticket",
  description:
    "Extrae toda la información posible de un ticket o factura: comercio, fecha, importes y el detalle de cada línea/artículo comprado (para usarlo como base de conocimiento a futuro).",
  input_schema: {
    type: "object" as const,
    properties: {
      merchant: { type: "string", description: "Nombre del comercio/empresa" },
      receipt_date: {
        type: "string",
        description: "Fecha del ticket en formato YYYY-MM-DD",
      },
      total_amount: { type: "number", description: "Importe total pagado" },
      tax_amount: { type: "number", description: "IVA/impuestos si aparece" },
      currency: { type: "string", description: "Código de moneda, ej. EUR" },
      raw_text: {
        type: "string",
        description: "Todo el texto relevante del ticket, tal cual aparece",
      },
      line_items: {
        type: "array",
        description: "Cada artículo o línea comprada, con el máximo detalle posible",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            reference: {
              type: "string",
              description: "SKU, código o referencia del producto si aparece",
            },
            quantity: { type: "number" },
            unit_price: { type: "number" },
            total_price: { type: "number" },
            color: { type: "string" },
            material: { type: "string" },
            model: { type: "string" },
            category: {
              type: "string",
              description: "Categoría del artículo, ej. mueble, comida, ropa",
            },
            attributes: {
              type: "object",
              description:
                "Cualquier otro detalle relevante detectado (talla, dimensiones, garantía, etc.) como pares clave-valor",
            },
          },
        },
      },
    },
    required: ["merchant", "total_amount", "line_items"],
  },
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { imageBase64, mediaType } = (await req.json()) as {
    imageBase64: string;
    mediaType: string;
  };

  if (!imageBase64) {
    return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  }

  const anthropic = getAnthropicClient();

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extraer_ticket" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as
                | "image/jpeg"
                | "image/png"
                | "image/webp"
                | "image/gif",
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "Extrae con el máximo detalle posible toda la información de este ticket o factura, incluyendo cada artículo comprado con sus referencias, colores, materiales, modelos y cualquier otro atributo visible. Esto se guardará como base de conocimiento, así que no omitas detalles.",
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json(
      { error: "Claude no pudo extraer datos del ticket" },
      { status: 502 }
    );
  }

  return NextResponse.json(toolUse.input);
}
