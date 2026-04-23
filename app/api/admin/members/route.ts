import { NextResponse } from "next/server";

import { addMiembro, removeMiembro, updateMiembro } from "../../../../lib/sf-store";

type Body = {
  token?: string;
  action?: "add" | "update" | "delete";
  year?: number;
  originalNombre?: string;
  miembro?: { nombre?: string; ultimoPago?: string; telefono?: string };
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const token = body?.token;

  if (!token || token !== process.env.ADMIN_TOKEN) return unauthorized();

  const action = body?.action;
  const year = body?.year;
  if (!action || !year || !Number.isFinite(year)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (action === "add") {
    const nombre = (body?.miembro?.nombre ?? "").trim();
    const ultimoPago = (body?.miembro?.ultimoPago ?? "").trim();
    const telefono = (body?.miembro?.telefono ?? "").replace(/[^0-9]/g, "");
    if (!nombre || !ultimoPago) {
      return NextResponse.json({ error: "Invalid miembro" }, { status: 400 });
    }
    const created = await addMiembro(year, { nombre, ultimoPago, telefono });
    if (!created) return NextResponse.json({ error: "Member exists" }, { status: 409 });
    return NextResponse.json({ ok: true, miembro: created }, { status: 200 });
  }

  if (action === "update") {
    const originalNombre = (body?.originalNombre ?? "").trim();
    const nombre = (body?.miembro?.nombre ?? "").trim();
    const ultimoPago = (body?.miembro?.ultimoPago ?? "").trim();
    const telefono = (body?.miembro?.telefono ?? "").replace(/[^0-9]/g, "");
    if (!originalNombre || !nombre || !ultimoPago) {
      return NextResponse.json({ error: "Invalid miembro" }, { status: 400 });
    }
    const updated = await updateMiembro(year, originalNombre, { nombre, ultimoPago, telefono });
    if (updated === "duplicate") return NextResponse.json({ error: "Member exists" }, { status: 409 });
    if (!updated) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    return NextResponse.json({ ok: true, miembro: updated }, { status: 200 });
  }

  if (action === "delete") {
    const nombre = (body?.originalNombre ?? "").trim();
    if (!nombre) return NextResponse.json({ error: "Invalid miembro" }, { status: 400 });
    const removed = await removeMiembro(year, nombre);
    if (!removed) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
