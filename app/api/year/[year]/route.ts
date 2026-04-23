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
  const auth = req.headers.get("authorization") ?? "";
  const hasAuthHeader = auth.startsWith("Bearer ");
  const token = hasAuthHeader ? auth.slice(7).trim() : "";

  if (hasAuthHeader && token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    hasAuthHeader ? { miembros: data.miembros, pendientes: data.pendientes } : { miembros: data.miembros },
    { status: 200 },
  );
}

