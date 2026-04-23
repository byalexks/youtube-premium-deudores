import { NextResponse } from "next/server";

import { updateMiembroTelefono } from "../../../../lib/sf-store";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { year?: number; nombre?: string; telefono?: string; token?: string }
    | null;

  const year = body?.year;
  const nombre = body?.nombre?.trim();
  const telefono = (body?.telefono ?? "").trim();
  const token = body?.token;

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!year || !Number.isFinite(year) || !nombre) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const cleaned = telefono.replace(/[^0-9]/g, "");
  const updated = await updateMiembroTelefono(year, nombre, cleaned);
  if (!updated) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, miembro: updated }, { status: 200 });
}
