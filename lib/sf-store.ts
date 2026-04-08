import { kv } from "@vercel/kv";

const IS_DEV = process.env.NODE_ENV === "development";

export type Miembro = { nombre: string; ultimoPago: string };
export type PagoPendienteStatus = "pending" | "approved" | "rejected";
export type PagoPendiente = {
  id: string;
  nombre: string;
  mes: string;
  createdAt: string;
  status: PagoPendienteStatus;
};

const INITIAL_DATA: Miembro[] = [
  { nombre: "MAGB MAIKOLCHIS", ultimoPago: "Mar 2026" },
  { nombre: "Arianis Arrieta", ultimoPago: "Mar 2026" },
  { nombre: "Dylan Batista", ultimoPago: "Mar 2026" },
  { nombre: "Michael Martinez", ultimoPago: "Mar 2026" },
  { nombre: "Wendy Ortega", ultimoPago: "Mar 2026" },
];

// In-memory store for local development (resets on server restart)
const memStore: Record<string, unknown> = {};
function memGet<T>(key: string): T | null { return (memStore[key] as T) ?? null; }
function memSet(key: string, val: unknown) { memStore[key] = val; }

const KV_ENABLED = !IS_DEV && !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

function miembrosKey(year: number) { return `sf:year:${year}:miembros`; }
function pendientesKey(year: number) { return `sf:year:${year}:pendientes`; }

async function kvGet<T>(key: string): Promise<T | null> {
  if (KV_ENABLED) return kv.get<T>(key);
  return memGet<T>(key);
}
async function kvSet(key: string, val: unknown) {
  if (KV_ENABLED) return kv.set(key, val);
  memSet(key, val);
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
  return {
    miembros: Array.isArray(miembros) ? miembros : [],
    pendientes: Array.isArray(pendientes) ? pendientes : [],
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
  const miembros = Array.isArray(current) ? current : [];
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

