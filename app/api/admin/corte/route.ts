import { NextResponse } from "next/server";

import {
  buildCorteSnapshot,
  getCorteConfig,
  getLastCorteSnapshot,
  setCorteConfig,
  setLastCorteSnapshot,
} from "../../../../lib/sf-store";

type Body = {
  token?: string;
  day?: number;
  destino?: string;
  forceGenerate?: boolean;
  year?: number;
  month?: number;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token !== process.env.ADMIN_TOKEN) return unauthorized();

  const [config, snapshot] = await Promise.all([getCorteConfig(), getLastCorteSnapshot()]);
  return NextResponse.json({ config, snapshot }, { status: 200 });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const token = body?.token;
  if (!token || token !== process.env.ADMIN_TOKEN) return unauthorized();

  const dayRaw = body?.day;
  const destino = (body?.destino ?? "").replace(/[^0-9]/g, "");
  if (!dayRaw || !Number.isFinite(dayRaw)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const config = await setCorteConfig({ day: dayRaw, destino });

  if (body?.forceGenerate) {
    const now = new Date();
    const year = Number.isFinite(body?.year) ? Number(body?.year) : now.getFullYear();
    const month = Number.isFinite(body?.month) ? Number(body?.month) : now.getMonth();
    const snapshot = await buildCorteSnapshot(year, month);
    await setLastCorteSnapshot(snapshot);
    return NextResponse.json({ ok: true, config, snapshot }, { status: 200 });
  }

  return NextResponse.json({ ok: true, config }, { status: 200 });
}
