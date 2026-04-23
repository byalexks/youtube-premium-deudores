import { createClient } from "@vercel/kv";

const IS_DEV = process.env.NODE_ENV === "development";

export type Miembro = { nombre: string; ultimoPago: string; telefono: string };
export type PagoPendienteStatus = "pending" | "approved" | "rejected";
export type PagoPendiente = {
  id: string;
  nombre: string;
  mes: string;
  createdAt: string;
  status: PagoPendienteStatus;
  comprobanteUrl?: string;
  comprobanteNombre?: string;
};

export type CorteConfig = {
  day: number;
  destino: string;
};

export type CorteSnapshot = {
  year: number;
  generatedAt: string;
  corteMes: string;
  totalDeuda: number;
  morosos: Array<{ nombre: string; meses: string[]; total: number }>;
  message: string;
};

const INITIAL_DATA: Miembro[] = [
  { nombre: "MAGB MAIKOLCHIS", ultimoPago: "Mar 2026", telefono: "" },
  { nombre: "Arianis Arrieta", ultimoPago: "Mar 2026", telefono: "" },
  { nombre: "Dylan Batista", ultimoPago: "Mar 2026", telefono: "" },
  { nombre: "Michael Martinez", ultimoPago: "Mar 2026", telefono: "" },
  { nombre: "Wendy Ortega", ultimoPago: "Mar 2026", telefono: "" },
];

// In-memory store for local development (resets on server restart)
const memStore: Record<string, unknown> = {};
function memGet<T>(key: string): T | null { return (memStore[key] as T) ?? null; }
function memSet(key: string, val: unknown) { memStore[key] = val; }

function getKV() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!IS_DEV && url.startsWith("https://") && token) return createClient({ url, token });
  return null;
}

function miembrosKey(year: number) { return `sf:year:${year}:miembros`; }
function pendientesKey(year: number) { return `sf:year:${year}:pendientes`; }
const corteConfigKey = "sf:corte:config";
const corteSnapshotKey = "sf:corte:last";

async function kvGet<T>(key: string): Promise<T | null> {
  const client = getKV();
  if (client) return client.get<T>(key);
  return memGet<T>(key);
}
async function kvSet(key: string, val: unknown) {
  const client = getKV();
  if (client) return client.set(key, val);
  memSet(key, val);
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function parseMesLabel(label: string) {
  const [mesRaw, yearRaw] = label.trim().split(/\s+/);
  return { month: MESES.indexOf(mesRaw ?? ""), year: Number(yearRaw) };
}

function getMesLabel(year: number, month: number) {
  return `${MESES[month]} ${year}`;
}

function generarMeses(startYear: number, startMonth: number, endYear: number, endMonth: number) {
  const meses: string[] = [];
  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    meses.push(getMesLabel(y, m));
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return meses;
}

function calcularPendientes(ultimoPago: string, endYear: number, endMonth: number) {
  const parsed = parseMesLabel(ultimoPago);
  let startMonth = parsed.month + 1;
  let startYear = parsed.year;
  if (startMonth > 11) {
    startMonth = 0;
    startYear += 1;
  }
  if (parsed.year > endYear || (parsed.year === endYear && parsed.month >= endMonth)) return [];
  return generarMeses(startYear, startMonth, endYear, endMonth);
}

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export async function ensureSeedForYear(year: number) {
  const existing = await kvGet<Miembro[]>(miembrosKey(year));
  if (Array.isArray(existing) && existing.length > 0) return;
  await kvSet(miembrosKey(year), INITIAL_DATA);
  const existingPend = await kvGet<PagoPendiente[]>(pendientesKey(year));
  if (!Array.isArray(existingPend)) await kvSet(pendientesKey(year), []);
}

export async function getYearData(year: number) {
  await ensureSeedForYear(year);
  const [miembros, pendientes] = await Promise.all([
    kvGet<Miembro[]>(miembrosKey(year)),
    kvGet<PagoPendiente[]>(pendientesKey(year)),
  ]);
  const normalizedMiembros = Array.isArray(miembros)
    ? miembros.map((m) => ({ ...m, telefono: typeof m.telefono === "string" ? m.telefono : "" }))
    : [];
  const normalizedPendientes = Array.isArray(pendientes)
    ? pendientes.map((p) => ({
      ...p,
      comprobanteUrl: typeof p.comprobanteUrl === "string" ? p.comprobanteUrl : undefined,
      comprobanteNombre: typeof p.comprobanteNombre === "string" ? p.comprobanteNombre : undefined,
    }))
    : [];
  return {
    miembros: normalizedMiembros,
    pendientes: normalizedPendientes,
  };
}

export async function addPagoPendiente(year: number, pending: PagoPendiente) {
  await ensureSeedForYear(year);
  const current = (await kvGet<PagoPendiente[]>(pendientesKey(year))) ?? [];
  const list = Array.isArray(current) ? current : [];
  list.unshift(pending);
  await kvSet(pendientesKey(year), list);
}

export async function setPendienteStatus(
  year: number,
  id: string,
  status: PagoPendienteStatus,
) {
  await ensureSeedForYear(year);
  const current = (await kvGet<PagoPendiente[]>(pendientesKey(year))) ?? [];
  const list = Array.isArray(current) ? current : [];
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated: PagoPendiente = { ...list[idx]!, status };
  list[idx] = updated;
  await kvSet(pendientesKey(year), list);
  return updated;
}

export async function applyPagoToMiembroIfNewer(
  year: number,
  nombre: string,
  mes: string,
  mesLabelToIndex: (label: string) => number,
) {
  await ensureSeedForYear(year);
  const current = (await kvGet<Miembro[]>(miembrosKey(year))) ?? [];
  const miembros = Array.isArray(current)
    ? current.map((m) => ({ ...m, telefono: typeof m.telefono === "string" ? m.telefono : "" }))
    : [];
  const idx = miembros.findIndex((m) => m.nombre === nombre);
  if (idx === -1) return null;

  const m = miembros[idx]!;
  const mesIdx = mesLabelToIndex(mes);
  const ultimoIdx = mesLabelToIndex(m.ultimoPago);
  const next = mesIdx > ultimoIdx ? { ...m, ultimoPago: mes } : m;

  miembros[idx] = next;
  await kvSet(miembrosKey(year), miembros);
  return next;
}

export async function updateMiembroTelefono(year: number, nombre: string, telefono: string) {
  await ensureSeedForYear(year);
  const current = (await kvGet<Miembro[]>(miembrosKey(year))) ?? [];
  const miembros = Array.isArray(current)
    ? current.map((m) => ({ ...m, telefono: typeof m.telefono === "string" ? m.telefono : "" }))
    : [];
  const idx = miembros.findIndex((m) => m.nombre === nombre);
  if (idx === -1) return null;
  const updated = { ...miembros[idx]!, telefono };
  miembros[idx] = updated;
  await kvSet(miembrosKey(year), miembros);
  return updated;
}

export async function addMiembro(year: number, miembro: Miembro) {
  await ensureSeedForYear(year);
  const current = (await kvGet<Miembro[]>(miembrosKey(year))) ?? [];
  const miembros = Array.isArray(current)
    ? current.map((m) => ({ ...m, telefono: typeof m.telefono === "string" ? m.telefono : "" }))
    : [];
  if (miembros.some((m) => m.nombre === miembro.nombre)) return null;
  miembros.push(miembro);
  await kvSet(miembrosKey(year), miembros);
  return miembro;
}

export async function updateMiembro(year: number, originalNombre: string, next: Miembro) {
  await ensureSeedForYear(year);
  const current = (await kvGet<Miembro[]>(miembrosKey(year))) ?? [];
  const miembros = Array.isArray(current)
    ? current.map((m) => ({ ...m, telefono: typeof m.telefono === "string" ? m.telefono : "" }))
    : [];
  const idx = miembros.findIndex((m) => m.nombre === originalNombre);
  if (idx === -1) return null;
  if (next.nombre !== originalNombre && miembros.some((m) => m.nombre === next.nombre)) return "duplicate";
  miembros[idx] = next;
  await kvSet(miembrosKey(year), miembros);

  if (next.nombre !== originalNombre) {
    const pendingCurrent = (await kvGet<PagoPendiente[]>(pendientesKey(year))) ?? [];
    const pendings = Array.isArray(pendingCurrent)
      ? pendingCurrent.map((p) => (p.nombre === originalNombre ? { ...p, nombre: next.nombre } : p))
      : [];
    await kvSet(pendientesKey(year), pendings);
  }

  return next;
}

export async function removeMiembro(year: number, nombre: string) {
  await ensureSeedForYear(year);
  const current = (await kvGet<Miembro[]>(miembrosKey(year))) ?? [];
  const miembros = Array.isArray(current)
    ? current.map((m) => ({ ...m, telefono: typeof m.telefono === "string" ? m.telefono : "" }))
    : [];
  const filtered = miembros.filter((m) => m.nombre !== nombre);
  if (filtered.length === miembros.length) return false;
  await kvSet(miembrosKey(year), filtered);
  return true;
}

export async function getCorteConfig() {
  const current = await kvGet<CorteConfig>(corteConfigKey);
  const dayRaw = current?.day;
  const destinoRaw = current?.destino;
  const day = typeof dayRaw === "number" && Number.isFinite(dayRaw) ? Math.max(1, Math.min(31, Math.floor(dayRaw))) : 5;
  const destino = typeof destinoRaw === "string" ? destinoRaw : "";
  return { day, destino } satisfies CorteConfig;
}

export async function setCorteConfig(config: CorteConfig) {
  const next: CorteConfig = {
    day: Math.max(1, Math.min(31, Math.floor(config.day))),
    destino: config.destino,
  };
  await kvSet(corteConfigKey, next);
  return next;
}

export async function getLastCorteSnapshot() {
  const snap = await kvGet<CorteSnapshot>(corteSnapshotKey);
  if (!snap || typeof snap !== "object") return null;
  return snap;
}

export async function setLastCorteSnapshot(snapshot: CorteSnapshot) {
  await kvSet(corteSnapshotKey, snapshot);
  return snapshot;
}

export async function buildCorteSnapshot(year: number, month: number) {
  const data = await getYearData(year);
  const corteMes = getMesLabel(year, month);
  const morosos = data.miembros
    .map((m) => {
      const meses = calcularPendientes(m.ultimoPago, year, month);
      return { nombre: m.nombre, meses, total: meses.length * 13000 };
    })
    .filter((m) => m.meses.length > 0);
  const totalDeuda = morosos.reduce((sum, m) => sum + m.total, 0);

  let message = `▶️ *YouTube Premium Familiar — Corte automático*\n📅 Corte: ${corteMes}\n\n`;
  if (morosos.length === 0) {
    message += "No hay pagos pendientes. Todos están al día.";
  } else {
    message += "⚠️ *Morosos del corte:*\n";
    morosos.forEach((m) => {
      message += `\n👤 *${m.nombre}*\n`;
      message += `   📌 Meses: ${m.meses.join(", ")}\n`;
      message += `   💸 Total: ${formatCOP(m.total)}\n`;
    });
    message += `\n💰 *Total adeudado: ${formatCOP(totalDeuda)}*`;
  }

  return {
    year,
    generatedAt: new Date().toISOString(),
    corteMes,
    totalDeuda,
    morosos,
    message,
  } satisfies CorteSnapshot;
}
