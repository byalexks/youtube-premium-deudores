"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PagoPendienteStatus = "pending" | "approved" | "rejected";
type PagoPendiente = {
  id: string;
  nombre: string;
  mes: string;
  createdAt: string;
  status: PagoPendienteStatus;
  comprobanteUrl?: string;
  comprobanteNombre?: string;
};

type Miembro = { nombre: string; ultimoPago: string; telefono: string };

type AdminYearPayload = {
  miembros: Miembro[];
  pendientes: PagoPendiente[];
};

type MonthlyAccounting = {
  mes: string;
  esperado: number;
  recaudado: number;
  diferencia: number;
};

type MemberAccounting = {
  nombre: string;
  mesesPagados: number;
  totalAportado: number;
};

type PhoneUpdatePayload = { ok: boolean; miembro: Miembro };
type CorteConfig = { day: number; destino: string };
type CorteSnapshot = {
  year: number;
  generatedAt: string;
  corteMes: string;
  totalDeuda: number;
  morosos: Array<{ nombre: string; meses: string[]; total: number }>;
  message: string;
};

type CortePayload = { config: CorteConfig; snapshot: CorteSnapshot | null };

const CUOTA = 13000;
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const getMesLabel = (year: number, month: number) => `${MESES[month]} ${year}`;

const generarMeses = (startYear: number, startMonth: number, endYear: number, endMonth: number) => {
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
};

const calcularPendientes = (ultimoPago: string, endYear: number, endMonth: number) => {
  const parsed = parseMesLabel(ultimoPago);
  let startMonth = parsed.month + 1;
  let startYear = parsed.year;
  if (startMonth > 11) {
    startMonth = 0;
    startYear += 1;
  }
  if (parsed.year > endYear || (parsed.year === endYear && parsed.month >= endMonth)) return [];
  return generarMeses(startYear, startMonth, endYear, endMonth);
};

const formatCOP = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const parseMesLabel = (label: string) => {
  const [mesRaw, yearRaw] = label.trim().split(/\s+/);
  return { month: MESES.indexOf(mesRaw ?? ""), year: Number(yearRaw) };
};

async function apiGetAdminYear(year: number, token: string): Promise<AdminYearPayload> {
  const res = await fetch(`/api/year/${year}`, {
    method: "GET",
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load admin data");
  return (await res.json()) as AdminYearPayload;
}

async function apiApprove(year: number, requestId: string, token: string) {
  const res = await fetch("/api/payments/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ year, requestId, token }),
  });
  if (!res.ok) throw new Error("Approve failed");
}

async function apiReject(year: number, requestId: string, token: string) {
  const res = await fetch("/api/payments/reject", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ year, requestId, token }),
  });
  if (!res.ok) throw new Error("Reject failed");
}

async function apiUpdatePhone(year: number, nombre: string, telefono: string, token: string) {
  const res = await fetch("/api/members/phone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ year, nombre, telefono, token }),
  });
  if (!res.ok) throw new Error("Phone update failed");
  return (await res.json()) as PhoneUpdatePayload;
}

type MemberMutateAction = "add" | "update" | "delete";

async function apiMutateMember(params: {
  action: MemberMutateAction;
  year: number;
  token: string;
  originalNombre?: string;
  miembro?: Miembro;
}) {
  const res = await fetch("/api/admin/members", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Member mutation failed");
}

async function apiGetCorte(token: string): Promise<CortePayload> {
  const res = await fetch("/api/admin/corte", {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Corte fetch failed");
  return (await res.json()) as CortePayload;
}

async function apiSaveCorteConfig(params: {
  token: string;
  day: number;
  destino: string;
  forceGenerate?: boolean;
  year?: number;
  month?: number;
}) {
  const res = await fetch("/api/admin/corte", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Corte save failed");
  return (await res.json()) as { config: CorteConfig; snapshot?: CorteSnapshot };
}

export default function AdminPage() {
  const [token, setToken] = useState<string>("");
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [data, setData] = useState<AdminYearPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<Record<string, string>>({});
  const [savingPhoneName, setSavingPhoneName] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newMember, setNewMember] = useState<Miembro>({ nombre: "", ultimoPago: getMesLabel(year, new Date().getMonth()), telefono: "" });
  const [editingMemberName, setEditingMemberName] = useState<string | null>(null);
  const [editingMembers, setEditingMembers] = useState<Record<string, Miembro>>({});
  const [savingMember, setSavingMember] = useState<string | null>(null);
  const [corteConfig, setCorteConfig] = useState<CorteConfig>({ day: 5, destino: "" });
  const [corteSnapshot, setCorteSnapshot] = useState<CorteSnapshot | null>(null);
  const [savingCorte, setSavingCorte] = useState(false);
  const reloadRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get("token");
    if (t) setToken(t);
  }, []);

  const pendientes = useMemo(
    () => (data?.pendientes ?? []).filter((p) => p.status === "pending"),
    [data],
  );

  const accounting = useMemo(() => {
    const miembros = data?.miembros ?? [];
    const approved = (data?.pendientes ?? []).filter((p) => p.status === "approved");
    const byMonth = new Map<string, number>();
    const byMember = new Map<string, number>();

    approved.forEach((p) => {
      const parsed = parseMesLabel(p.mes);
      if (parsed.year !== year || parsed.month < 0) return;
      byMonth.set(p.mes, (byMonth.get(p.mes) ?? 0) + 1);
      byMember.set(p.nombre, (byMember.get(p.nombre) ?? 0) + 1);
    });

    const monthly: MonthlyAccounting[] = MESES.map((mes) => {
      const label = `${mes} ${year}`;
      const recaudado = (byMonth.get(label) ?? 0) * CUOTA;
      const esperado = miembros.length * CUOTA;
      return { mes: label, esperado, recaudado, diferencia: esperado - recaudado };
    });

    const members: MemberAccounting[] = miembros.map((m) => {
      const mesesPagados = byMember.get(m.nombre) ?? 0;
      return {
        nombre: m.nombre,
        mesesPagados,
        totalAportado: mesesPagados * CUOTA,
      };
    });

    const totalEsperado = monthly.reduce((sum, row) => sum + row.esperado, 0);
    const totalRecaudado = monthly.reduce((sum, row) => sum + row.recaudado, 0);
    const porcentajeCumplimiento = totalEsperado > 0 ? (totalRecaudado / totalEsperado) * 100 : 0;

    return {
      monthly,
      members,
      totalEsperado,
      totalRecaudado,
      porcentajeCumplimiento,
    };
  }, [data, year]);

  const pendientesPorMiembro = useMemo(() => {
    const currentMonth = new Date().getMonth();
    const result = new Map<string, string[]>();
    (data?.miembros ?? []).forEach((m) => {
      result.set(m.nombre, calcularPendientes(m.ultimoPago, year, currentMonth));
    });
    return result;
  }, [data, year]);

  useEffect(() => {
    if (!data?.miembros) return;
    setEditingPhone((prev) => {
      const next: Record<string, string> = { ...prev };
      data.miembros.forEach((m) => {
        if (!(m.nombre in next)) next[m.nombre] = m.telefono ?? "";
      });
      return next;
    });
    setEditingMembers((prev) => {
      const next: Record<string, Miembro> = { ...prev };
      data.miembros.forEach((m) => {
        next[m.nombre] = next[m.nombre] ?? { ...m };
      });
      return next;
    });
  }, [data]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const reload = async () => {
    if (!token) {
      setData(null);
      return;
    }
    try {
      setLoading(true);
      const [next, corte] = await Promise.all([
        apiGetAdminYear(year, token),
        apiGetCorte(token),
      ]);
      setData(next);
      setCorteConfig(corte.config);
      setCorteSnapshot(corte.snapshot);
      setLastUpdated(new Date());
    } catch {
      setData(null);
      showToast("No autorizado o error cargando datos");
    } finally {
      setLoading(false);
    }
  };

  reloadRef.current = reload;

  useEffect(() => {
    void reloadRef.current();
  }, [year, token]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => void reloadRef.current(), 30_000);
    return () => clearInterval(id);
  }, [token]);

  const onApprove = async (id: string) => {
    setBusyId(id);
    try {
      await apiApprove(year, id, token);
    } catch {
      showToast("Error aprobando");
      setBusyId(null);
      return;
    }
    setBusyId(null);
    showToast("Aprobado");
    await reload().catch(() => undefined);
  };

  const onReject = async (id: string) => {
    setBusyId(id);
    try {
      await apiReject(year, id, token);
    } catch {
      showToast("Error rechazando");
      setBusyId(null);
      return;
    }
    setBusyId(null);
    showToast("Rechazado");
    await reload().catch(() => undefined);
  };

  const onSavePhone = async (nombre: string) => {
    if (!token) return;
    const telefono = editingPhone[nombre] ?? "";
    setSavingPhoneName(nombre);
    try {
      await apiUpdatePhone(year, nombre, telefono, token);
      showToast("Teléfono actualizado");
      await reload();
    } catch {
      showToast("Error guardando teléfono");
    } finally {
      setSavingPhoneName(null);
    }
  };

  const onRemind = (miembro: Miembro) => {
    const telefono = (miembro.telefono ?? "").replace(/[^0-9]/g, "");
    if (!telefono) {
      showToast("Este miembro no tiene teléfono");
      return;
    }
    const meses = pendientesPorMiembro.get(miembro.nombre) ?? [];
    if (meses.length === 0) {
      showToast("Este miembro está al día");
      return;
    }
    const total = meses.length * CUOTA;
    const texto = `Hola ${miembro.nombre}, te recordamos los meses pendientes: ${meses.join(", ")}. Total adeudado: ${formatCOP(total)}. Gracias.`;
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`, "_blank");
  };

  const onAddMember = async () => {
    if (!token) return;
    const payload = {
      nombre: newMember.nombre.trim(),
      ultimoPago: newMember.ultimoPago.trim(),
      telefono: (newMember.telefono ?? "").replace(/[^0-9]/g, ""),
    };
    if (!payload.nombre || !payload.ultimoPago) {
      showToast("Completa nombre y último pago");
      return;
    }
    setSavingMember("__new__");
    try {
      await apiMutateMember({ action: "add", year, token, miembro: payload });
      setNewMember({ nombre: "", ultimoPago: getMesLabel(year, new Date().getMonth()), telefono: "" });
      showToast("Miembro agregado");
      await reload();
    } catch {
      showToast("Error agregando miembro");
    } finally {
      setSavingMember(null);
    }
  };

  const onSaveMember = async (originalNombre: string) => {
    if (!token) return;
    const current = editingMembers[originalNombre];
    if (!current || !current.nombre.trim() || !current.ultimoPago.trim()) {
      showToast("Datos inválidos de miembro");
      return;
    }
    setSavingMember(originalNombre);
    try {
      await apiMutateMember({
        action: "update",
        year,
        token,
        originalNombre,
        miembro: {
          nombre: current.nombre.trim(),
          ultimoPago: current.ultimoPago.trim(),
          telefono: (current.telefono ?? "").replace(/[^0-9]/g, ""),
        },
      });
      setEditingMemberName(null);
      showToast("Miembro actualizado");
      await reload();
    } catch {
      showToast("Error actualizando miembro");
    } finally {
      setSavingMember(null);
    }
  };

  const onDeleteMember = async (nombre: string) => {
    if (!token) return;
    if (!window.confirm(`Eliminar miembro ${nombre}?`)) return;
    setSavingMember(nombre);
    try {
      await apiMutateMember({ action: "delete", year, token, originalNombre: nombre });
      showToast("Miembro eliminado");
      await reload();
    } catch {
      showToast("Error eliminando miembro");
    } finally {
      setSavingMember(null);
    }
  };

  const onSaveCorte = async (forceGenerate: boolean) => {
    if (!token) return;
    setSavingCorte(true);
    try {
      const res = await apiSaveCorteConfig({
        token,
        day: corteConfig.day,
        destino: corteConfig.destino,
        forceGenerate,
        year,
        month: new Date().getMonth(),
      });
      setCorteConfig(res.config);
      if (res.snapshot) setCorteSnapshot(res.snapshot);
      showToast(forceGenerate ? "Corte generado" : "Configuración de corte guardada");
      if (!res.snapshot) await reload();
    } catch {
      showToast("Error guardando corte");
    } finally {
      setSavingCorte(false);
    }
  };

  const openCorteWhatsApp = () => {
    if (!corteSnapshot) return;
    const destino = (corteConfig.destino ?? "").replace(/[^0-9]/g, "");
    if (!destino) {
      showToast("Configura el número destino");
      return;
    }
    window.open(`https://wa.me/${destino}?text=${encodeURIComponent(corteSnapshot.message)}`, "_blank");
  };

  const exportAccountingCsv = () => {
    const lines: string[] = [];
    lines.push(["Resumen", String(year)].join(","));
    lines.push(["Total esperado", String(accounting.totalEsperado)].join(","));
    lines.push(["Total recaudado", String(accounting.totalRecaudado)].join(","));
    lines.push(["Cumplimiento %", accounting.porcentajeCumplimiento.toFixed(2)].join(","));
    lines.push("");
    lines.push(["Tabla mensual"].join(","));
    lines.push(["Mes", "Esperado", "Recaudado", "Diferencia"].join(","));
    accounting.monthly.forEach((row) => {
      lines.push([row.mes, String(row.esperado), String(row.recaudado), String(row.diferencia)].join(","));
    });
    lines.push("");
    lines.push(["Tabla por miembro"].join(","));
    lines.push(["Nombre", "Meses pagados", "Total aportado"].join(","));
    accounting.members.forEach((row) => {
      lines.push([row.nombre, String(row.mesesPagados), String(row.totalAportado)].join(","));
    });

    const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `contabilidad-${year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <div style={styles.page}>
      <style>{`
        .adm-header { flex-wrap: wrap; gap: 12px; }
        .adm-controls { display: grid; grid-template-columns: 160px 1fr; gap: 12px; margin-top: 16px; }
        .adm-item { display: flex; justify-content: space-between; gap: 16px; padding: 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); align-items: center; }
        .adm-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
        @media (max-width: 600px) {
          .adm-controls { grid-template-columns: 1fr !important; }
          .adm-header { flex-direction: column; align-items: flex-start !important; }
          .adm-item { flex-direction: column; align-items: flex-start !important; }
          .adm-actions { width: 100%; }
          .adm-actions button { flex: 1; }
        }
      `}</style>
      <div style={styles.card}>
        <div style={styles.header} className="adm-header">
          <div>
            <h1 style={styles.title}>Admin — YouTube Premium Familiar</h1>
            <p style={styles.subtitle}>Aprueba o rechaza solicitudes de pago</p>
          </div>
          <div style={styles.headerRight}>
            {token && (
              <span style={styles.autoRefreshTag}>
                ⟳ Auto {lastUpdated ? `· ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
              </span>
            )}
            <button style={styles.refreshBtn} onClick={() => void reload()} disabled={loading}>
              {loading ? "..." : "↻"}
            </button>
          </div>
        </div>

        <div className="adm-controls">
          <label style={styles.label}>
            Año
            <input
              style={styles.input}
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <label style={styles.label}>
            Token
            <input
              style={styles.input}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Pega tu token (o entra por /admin?token=...)"
            />
          </label>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Pendientes ({pendientes.length})</h2>
          </div>

          {pendientes.length === 0 ? (
            <div style={styles.empty}>No hay solicitudes pendientes.</div>
          ) : (
            <div style={styles.list}>
              {pendientes.map((p) => (
                <div key={p.id} className="adm-item">
                  <div style={styles.itemMain}>
                    <div style={styles.itemName}>{p.nombre}</div>
                    <div style={styles.itemMeta}>
                      Mes: <b>{p.mes}</b> · {new Date(p.createdAt).toLocaleString()}
                    </div>
                    {p.comprobanteUrl && (
                      <a href={p.comprobanteUrl} target="_blank" rel="noreferrer" style={styles.itemLink}>
                        Ver comprobante{p.comprobanteNombre ? `: ${p.comprobanteNombre}` : ""}
                      </a>
                    )}
                    <div style={styles.itemId}>id: {p.id}</div>
                  </div>
                  <div className="adm-actions">
                    <button
                      style={{ ...styles.btn, ...styles.btnApprove }}
                      onClick={() => void onApprove(p.id)}
                      disabled={busyId === p.id || loading}
                    >
                      {busyId === p.id ? "..." : "Aprobar"}
                    </button>
                    <button
                      style={{ ...styles.btn, ...styles.btnReject }}
                      onClick={() => void onReject(p.id)}
                      disabled={busyId === p.id || loading}
                    >
                      {busyId === p.id ? "..." : "Rechazar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Recordatorios</h2>
          </div>
          <div style={styles.list}>
            {(data?.miembros ?? []).map((m) => {
              const meses = pendientesPorMiembro.get(m.nombre) ?? [];
              const total = meses.length * CUOTA;
              return (
                <div key={m.nombre} className="adm-item">
                  <div style={styles.itemMain}>
                    <div style={styles.itemName}>{m.nombre}</div>
                    <div style={styles.itemMeta}>
                      Pendiente: {meses.length > 0 ? meses.join(", ") : "Al día"}
                    </div>
                    <div style={styles.itemMeta}>Total: {formatCOP(total)}</div>
                  </div>
                  <div className="adm-actions">
                    <input
                      style={styles.inputPhone}
                      value={editingPhone[m.nombre] ?? ""}
                      onChange={(e) => setEditingPhone((prev) => ({ ...prev, [m.nombre]: e.target.value }))}
                      placeholder="573001112233"
                    />
                    <button
                      style={{ ...styles.btn, ...styles.btnSave }}
                      onClick={() => void onSavePhone(m.nombre)}
                      disabled={savingPhoneName === m.nombre || loading}
                    >
                      {savingPhoneName === m.nombre ? "..." : "Guardar"}
                    </button>
                    <button
                      style={{ ...styles.btn, ...styles.btnWarn }}
                      onClick={() => onRemind(m)}
                      disabled={loading}
                    >
                      Recordar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Gestión de miembros</h2>
          </div>

          <div style={styles.memberFormGrid}>
            <input
              style={styles.input}
              value={newMember.nombre}
              onChange={(e) => setNewMember((prev) => ({ ...prev, nombre: e.target.value }))}
              placeholder="Nombre"
            />
            <input
              style={styles.input}
              value={newMember.ultimoPago}
              onChange={(e) => setNewMember((prev) => ({ ...prev, ultimoPago: e.target.value }))}
              placeholder="Último pago (Ej: Mar 2026)"
            />
            <input
              style={styles.input}
              value={newMember.telefono}
              onChange={(e) => setNewMember((prev) => ({ ...prev, telefono: e.target.value }))}
              placeholder="Teléfono"
            />
            <button
              style={{ ...styles.btn, ...styles.btnSave }}
              onClick={() => void onAddMember()}
              disabled={savingMember === "__new__" || loading}
            >
              {savingMember === "__new__" ? "..." : "Agregar"}
            </button>
          </div>

          <div style={styles.list}>
            {(data?.miembros ?? []).map((m) => {
              const isEditing = editingMemberName === m.nombre;
              const editing = editingMembers[m.nombre] ?? m;
              return (
                <div key={m.nombre} className="adm-item">
                  <div style={{ ...styles.itemMain, width: "100%" }}>
                    {isEditing ? (
                      <div style={styles.memberEditGrid}>
                        <input
                          style={styles.input}
                          value={editing.nombre}
                          onChange={(e) => setEditingMembers((prev) => ({
                            ...prev,
                            [m.nombre]: { ...editing, nombre: e.target.value },
                          }))}
                        />
                        <input
                          style={styles.input}
                          value={editing.ultimoPago}
                          onChange={(e) => setEditingMembers((prev) => ({
                            ...prev,
                            [m.nombre]: { ...editing, ultimoPago: e.target.value },
                          }))}
                        />
                        <input
                          style={styles.input}
                          value={editing.telefono}
                          onChange={(e) => setEditingMembers((prev) => ({
                            ...prev,
                            [m.nombre]: { ...editing, telefono: e.target.value },
                          }))}
                        />
                      </div>
                    ) : (
                      <>
                        <div style={styles.itemName}>{m.nombre}</div>
                        <div style={styles.itemMeta}>Último pago: {m.ultimoPago}</div>
                        <div style={styles.itemMeta}>Teléfono: {m.telefono || "—"}</div>
                      </>
                    )}
                  </div>
                  <div className="adm-actions">
                    {isEditing ? (
                      <>
                        <button
                          style={{ ...styles.btn, ...styles.btnSave }}
                          onClick={() => void onSaveMember(m.nombre)}
                          disabled={savingMember === m.nombre || loading}
                        >
                          {savingMember === m.nombre ? "..." : "Guardar"}
                        </button>
                        <button
                          style={{ ...styles.btn, ...styles.btnReject }}
                          onClick={() => setEditingMemberName(null)}
                          disabled={savingMember === m.nombre || loading}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          style={{ ...styles.btn, ...styles.btnSave }}
                          onClick={() => setEditingMemberName(m.nombre)}
                          disabled={loading}
                        >
                          Editar
                        </button>
                        <button
                          style={{ ...styles.btn, ...styles.btnReject }}
                          onClick={() => void onDeleteMember(m.nombre)}
                          disabled={savingMember === m.nombre || loading}
                        >
                          {savingMember === m.nombre ? "..." : "Eliminar"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Corte automático</h2>
          </div>
          <div style={styles.memberFormGrid}>
            <label style={styles.label}>
              Día de corte
              <input
                style={styles.input}
                type="number"
                min={1}
                max={31}
                value={corteConfig.day}
                onChange={(e) => setCorteConfig((prev) => ({ ...prev, day: Number(e.target.value) }))}
              />
            </label>
            <label style={styles.label}>
              WhatsApp destino
              <input
                style={styles.input}
                value={corteConfig.destino}
                onChange={(e) => setCorteConfig((prev) => ({ ...prev, destino: e.target.value }))}
                placeholder="573001112233"
              />
            </label>
            <button
              style={{ ...styles.btn, ...styles.btnSave }}
              onClick={() => void onSaveCorte(false)}
              disabled={savingCorte || loading}
            >
              {savingCorte ? "..." : "Guardar configuración"}
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnWarn }}
              onClick={() => void onSaveCorte(true)}
              disabled={savingCorte || loading}
            >
              {savingCorte ? "..." : "Generar ahora"}
            </button>
          </div>

          {corteSnapshot ? (
            <div style={styles.corteBox}>
              <div style={styles.itemMeta}>Último corte: {new Date(corteSnapshot.generatedAt).toLocaleString()}</div>
              <div style={styles.itemMeta}>Periodo: {corteSnapshot.corteMes}</div>
              <div style={styles.itemMeta}>Total adeudado: {formatCOP(corteSnapshot.totalDeuda)}</div>
              <pre style={styles.cortePre}>{corteSnapshot.message}</pre>
              <button style={{ ...styles.btn, ...styles.btnWarn }} onClick={openCorteWhatsApp} disabled={loading}>
                Abrir WhatsApp
              </button>
            </div>
          ) : (
            <div style={styles.empty}>Aún no se ha generado un corte automático.</div>
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Contabilidad</h2>
            <button style={styles.exportBtn} onClick={exportAccountingCsv} disabled={!token || loading}>
              Exportar CSV
            </button>
          </div>

          <div style={styles.kpis}>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>Total esperado</span>
              <span style={styles.kpiValue}>{formatCOP(accounting.totalEsperado)}</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>Total recaudado</span>
              <span style={styles.kpiValue}>{formatCOP(accounting.totalRecaudado)}</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={styles.kpiLabel}>Cumplimiento</span>
              <span style={styles.kpiValue}>{accounting.porcentajeCumplimiento.toFixed(1)}%</span>
            </div>
          </div>

          <div style={styles.tableWrap}>
            <div style={styles.tableTitle}>Resumen mensual</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Mes</th>
                  <th style={styles.th}>Esperado</th>
                  <th style={styles.th}>Recaudado</th>
                  <th style={styles.th}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {accounting.monthly.map((row) => (
                  <tr key={row.mes}>
                    <td style={styles.td}>{row.mes}</td>
                    <td style={styles.td}>{formatCOP(row.esperado)}</td>
                    <td style={styles.td}>{formatCOP(row.recaudado)}</td>
                    <td style={styles.td}>{formatCOP(row.diferencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.tableWrap}>
            <div style={styles.tableTitle}>Desglose por miembro</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Miembro</th>
                  <th style={styles.th}>Meses pagados</th>
                  <th style={styles.th}>Total aportado</th>
                </tr>
              </thead>
              <tbody>
                {accounting.members.map((row) => (
                  <tr key={row.nombre}>
                    <td style={styles.td}>{row.nombre}</td>
                    <td style={styles.td}>{row.mesesPagados}</td>
                    <td style={styles.td}>{formatCOP(row.totalAportado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#181818",
    color: "#e6edf3",
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "920px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "16px",
    padding: "18px",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerRight: { display: "flex", alignItems: "center", gap: "8px" },
  title: { fontSize: "20px", margin: 0 },
  subtitle: { margin: "6px 0 0", color: "#AAAAAA", fontSize: "13px" },
  autoRefreshTag: {
    fontSize: "11px",
    color: "#AAAAAA",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    padding: "4px 10px",
  },
  refreshBtn: {
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#e6edf3",
    cursor: "pointer",
    fontSize: "18px",
  },
  controls: {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    gap: "12px",
    marginTop: "16px",
  },
  label: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "#AAAAAA" },
  input: {
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "10px",
    padding: "10px 12px",
    color: "#e6edf3",
    outline: "none",
  },
  section: { marginTop: "18px" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  h2: { fontSize: "14px", margin: 0 },
  empty: {
    marginTop: "12px",
    padding: "14px",
    borderRadius: "12px",
    border: "1px dashed rgba(255,255,255,0.20)",
    color: "#AAAAAA",
  },
  list: { marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" },
  item: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    alignItems: "center",
  },
  itemMain: { display: "flex", flexDirection: "column", gap: "4px" },
  itemName: { fontSize: "15px", fontWeight: 700 },
  itemMeta: { fontSize: "12px", color: "#AAAAAA" },
  itemLink: { fontSize: "12px", color: "#93c5fd", textDecoration: "underline" },
  itemId: { fontSize: "11px", color: "#909090" },
  actions: { display: "flex", gap: "8px", alignItems: "center" },
  btn: {
    border: "none",
    borderRadius: "10px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "12px",
  },
  btnApprove: { background: "#E50914", color: "#fff" },
  btnReject: { background: "rgba(245,158,11,0.18)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" },
  btnSave: { background: "rgba(59,130,246,0.25)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.35)" },
  btnWarn: { background: "rgba(16,185,129,0.2)", color: "#34d399", border: "1px solid rgba(16,185,129,0.35)" },
  inputPhone: {
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "10px",
    padding: "10px 12px",
    color: "#e6edf3",
    outline: "none",
    minWidth: "150px",
  },
  memberFormGrid: {
    marginTop: "12px",
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "10px",
  },
  memberEditGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "8px",
  },
  corteBox: {
    marginTop: "12px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    padding: "12px",
    background: "rgba(255,255,255,0.04)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  cortePre: {
    margin: 0,
    whiteSpace: "pre-wrap",
    background: "rgba(0,0,0,0.3)",
    borderRadius: "10px",
    padding: "10px",
    fontSize: "12px",
    lineHeight: 1.5,
    color: "#e6edf3",
  },
  exportBtn: {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "10px",
    padding: "8px 10px",
    background: "rgba(255,255,255,0.06)",
    color: "#e6edf3",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "12px",
  },
  kpis: {
    marginTop: "12px",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
  },
  kpiCard: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "12px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  kpiLabel: { color: "#AAAAAA", fontSize: "12px" },
  kpiValue: { color: "#fff", fontSize: "18px", fontWeight: 700 },
  tableWrap: {
    marginTop: "12px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    overflow: "hidden",
    background: "rgba(0,0,0,0.2)",
  },
  tableTitle: {
    fontSize: "12px",
    color: "#AAAAAA",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    fontSize: "12px",
    color: "#AAAAAA",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  td: {
    fontSize: "13px",
    color: "#e6edf3",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  toast: {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#E50914",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: "12px",
    fontSize: "13px",
    fontWeight: 800,
  },
};
