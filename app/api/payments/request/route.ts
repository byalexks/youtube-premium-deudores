import { NextResponse } from "next/server";

import { addPagoPendiente } from "../../../../lib/sf-store";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
      year?: number;
      nombre?: string;
      mes?: string;
      comprobanteUrl?: string;
      comprobanteNombre?: string;
    }
    | null;

  const year = body?.year;
  const nombre = body?.nombre?.trim();
  const mes = body?.mes?.trim();
  const comprobanteUrl = (body?.comprobanteUrl ?? "").trim();
  const comprobanteNombre = (body?.comprobanteNombre ?? "").trim();

  if (!year || !Number.isFinite(year) || !nombre || !mes) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (comprobanteUrl && !comprobanteUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Invalid comprobante" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await addPagoPendiente(year, {
    id,
    nombre,
    mes,
    createdAt: new Date().toISOString(),
    status: "pending",
    comprobanteUrl: comprobanteUrl || undefined,
    comprobanteNombre: comprobanteNombre || undefined,
  });

  return NextResponse.json({ ok: true, id }, { status: 200 });
}

