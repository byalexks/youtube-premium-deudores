import { NextResponse } from "next/server";

import { getYearData, setPendienteStatus } from "../../../../lib/sf-store";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { year?: number; requestId?: string; token?: string }
    | null;

  const year = body?.year;
  const requestId = body?.requestId;
  const token = body?.token;

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!year || !Number.isFinite(year) || !requestId) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const data = await getYearData(year);
  const pending = data.pendientes.find((p) => p.id === requestId);
  if (!pending) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (pending.status !== "pending") {
    return NextResponse.json(
      { error: "Already processed", status: pending.status },
      { status: 409 },
    );
  }

  const updatedPending = await setPendienteStatus(year, requestId, "rejected");
  if (!updatedPending) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, pending: updatedPending }, { status: 200 });
}
