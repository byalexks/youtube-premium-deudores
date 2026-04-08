import { NextResponse } from "next/server";

import { getYearData } from "../../../../lib/sf-store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ year: string }> },
) {
  const { year: yearRaw } = await ctx.params;
  const year = Number(yearRaw);
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const data = await getYearData(year);
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const isAdmin = !!token && token === process.env.ADMIN_TOKEN;

  return NextResponse.json(
    isAdmin ? { miembros: data.miembros, pendientes: data.pendientes } : { miembros: data.miembros },
    { status: 200 },
  );
}

