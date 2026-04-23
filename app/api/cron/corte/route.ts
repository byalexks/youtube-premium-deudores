import { NextResponse } from "next/server";

import { buildCorteSnapshot, getCorteConfig, setLastCorteSnapshot } from "../../../../lib/sf-store";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ""}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const config = await getCorteConfig();
  if (now.getDate() !== config.day) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Not corte day", day: now.getDate() }, { status: 200 });
  }

  const snapshot = await buildCorteSnapshot(now.getFullYear(), now.getMonth());
  await setLastCorteSnapshot(snapshot);

  const waLink = config.destino
    ? `https://wa.me/${config.destino}?text=${encodeURIComponent(snapshot.message)}`
    : null;

  return NextResponse.json({ ok: true, skipped: false, snapshot, waLink }, { status: 200 });
}
