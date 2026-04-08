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

type AdminYearPayload = {
  miembros: { nombre: string; ultimoPago: string }[];
  pendientes: PagoPendiente[];
};

async function apiGetAdminYear(year: number, token: string): Promise<AdminYearPayload> {
  const res = await fetch(`/api/year/${year}?token=${encodeURIComponent(token)}`, {
    method: "GET",
    cache: "no-store",
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

export default function AdminPage() {
  const [token, setToken] = useState<string>("");
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [data, setData] = useState<AdminYearPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
