"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PagoPendienteStatus = "pending" | "approved" | "rejected";
type PagoPendiente = {
  id: string;
  nombre: string;
  mes: string;
  createdAt: string;
  status: PagoPendienteStatus;
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
      const next = await apiGetAdminYear(year, token);
      setData(next);
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
