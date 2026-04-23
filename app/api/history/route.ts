import { NextResponse } from "next/server";

import { getYearData } from "../../../lib/sf-store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const nombre = (searchParams.get("nombre") ?? "").trim();

  if (!year || !Number.isFinite(year) || !nombre) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const data = await getYearData(year);
  const history = data.pendientes
    .filter((p) => p.nombre === nombre)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ history }, { status: 200 });
}
