"use client";

import { useEffect, useMemo, useState } from "react";

const CUOTA = 13000;

type Miembro = { nombre: string; ultimoPago: string };
type YearPayload = { miembros: Miembro[] };

const getMesLabel = (year: number, month: number) => {
  const nombres = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  return `${nombres[month]} ${year}`;
};

const generarMeses = (
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
) => {
  const meses: string[] = [];
  let y = startYear,
    m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    meses.push(getMesLabel(y, m));
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return meses;
};

const parseMesLabel = (label: string) => {
  const nombres = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const parts = label.split(" ");
  return { month: nombres.indexOf(parts[0] ?? ""), year: parseInt(parts[1] ?? "") };
};

const mesLabelToIndex = (label: string) => {
  const { year, month } = parseMesLabel(label);
  return year * 12 + month;
};

const calcularPendientes = (ultimoPago: string, currentYear: number, currentMonth: number) => {
  const { year: upYear, month: upMonth } = parseMesLabel(ultimoPago);

  let startMonth = upMonth + 1;
  let startYear = upYear;
  if (startMonth > 11) {
    startMonth = 0;
    startYear++;
  }

  if (upYear > currentYear || (upYear === currentYear && upMonth >= currentMonth)) {
    return [];
  }

  return generarMeses(startYear, startMonth, currentYear, currentMonth);
};

const INITIAL_DATA: Miembro[] = [
  { nombre: "MAGB MAIKOLCHIS", ultimoPago: "Mar 2025" },
  { nombre: "Arianis Arrieta", ultimoPago: "Mar 2025" },
  { nombre: "Dylan Batista", ultimoPago: "Mar 2025" },
  { nombre: "Michael Martinez", ultimoPago: "Mar 2026" },
  { nombre: "Wendy Ortega", ultimoPago: "Mar 2026" },
];

const formatCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

async function apiGetYear(year: number): Promise<YearPayload> {
  const res = await fetch(`/api/year/${year}`, { method: "GET" });
  if (!res.ok) throw new Error(`GET /api/year/${year} failed`);
  return (await res.json()) as YearPayload;
}

async function apiRequestPayment(payload: { year: number; nombre: string; mes: string }) {
  const res = await fetch("/api/payments/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("POST /api/payments/request failed");
}

const ADMIN_WHATSAPP = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP ?? "";

type ColKey = "nombre" | "estado" | "pendiente" | "deuda" | "ultimoPago" | "accion";
const ALL_COLS: ColKey[] = ["nombre", "estado", "pendiente", "deuda", "ultimoPago", "accion"];
const COL_LABELS: Record<ColKey, string> = {
  nombre: "Miembro", estado: "Estado", pendiente: "Pendiente",
  deuda: "Deuda", ultimoPago: "Último pago", accion: "Acción",
};
const COL_FR: Record<ColKey, string> = {
  nombre: "1.4fr", estado: "1fr", pendiente: "1.2fr",
  deuda: "0.9fr", ultimoPago: "0.9fr", accion: "1.1fr",
};

export default function YoutubePremiumTracker() {
  const [miembros, setMiembros] = useState<Miembro[]>(INITIAL_DATA);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [requesting, setRequesting] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(ALL_COLS));

  const toggleCol = (col: ColKey) => {
    if (col === "nombre" || col === "accion") return;
    setVisibleCols((prev) => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      return next;
    });
  };
  const gridTemplate = ALL_COLS.filter((c) => visibleCols.has(c)).map((c) => COL_FR[c]).join(" ");

  const now = new Date();
  const year = now.getFullYear();
  const currentMonth = now.getMonth();
  const mesCorte = getMesLabel(year, currentMonth);

  const miembrosConDeuda = useMemo(
    () =>
      miembros.map((m) => ({
        ...m,
        mesesPendientes: calcularPendientes(m.ultimoPago, year, currentMonth),
      })),
    [miembros, year, currentMonth],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGetYear(year);
        if (!cancelled && data?.miembros?.length) setMiembros(data.miembros);
      } catch {
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const abrirWhatsAppAdmin = (nombre: string, mes: string) => {
    if (!ADMIN_WHATSAPP) return;
    const texto = `Hola, soy ${nombre}. Acabo de solicitar el pago de *${mes}* en YouTube Premium Familiar. Por favor revisa y aprueba mi solicitud ▶️`;
    window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(texto)}`, "_blank");
  };

  const solicitarPago = async (idx: number, mes: string) => {
    const nombre = miembros[idx]?.nombre;
    if (!nombre) return;
    const key = `${nombre}|${mes}`;
    try {
      setRequesting((prev) => new Set(prev).add(key));
      await apiRequestPayment({ year, nombre, mes });
      showToast(`Solicitud enviada: ${nombre} — ${mes}`);
      abrirWhatsAppAdmin(nombre, mes);
    } catch {
      showToast("Error enviando solicitud");
    } finally {
      setRequesting((prev) => { const next = new Set(prev); next.delete(key); return next; });
      setEditIdx((current) => current === idx ? null : current);
    }
  };

  const totalDeuda = miembrosConDeuda.reduce(
    (s, m) => s + m.mesesPendientes.length * CUOTA,
    0,
  );
  const alDia = miembrosConDeuda.filter((m) => m.mesesPendientes.length === 0);
  const conDeuda = miembrosConDeuda.filter((m) => m.mesesPendientes.length > 0);

  const generarWhatsApp = () => {
    if (conDeuda.length === 0)
      return "🎉 *¡Grupo YouTube Premium Familiar — Todos al día!*\n\nNo hay pagos pendientes. ¡Gracias a todos! 🙌";
    let msg = `▶️ *YouTube Premium Familiar — Estado de pagos*\n📅 Corte: ${mesCorte}\n💰 Cuota mensual: ${formatCOP(CUOTA)}\n\n`;
    if (alDia.length > 0) msg += `✅ *Al día:* ${alDia.map((m) => m.nombre).join(", ")}\n\n`;
    msg += `⚠️ *Pagos pendientes:*\n`;
    conDeuda.forEach((m) => {
      msg += `\n👤 *${m.nombre}*\n`;
      msg += `   📌 Meses: ${m.mesesPendientes.join(", ")}\n`;
      msg += `   💸 Total: ${formatCOP(m.mesesPendientes.length * CUOTA)}\n`;
    });
    msg += `\n💰 *Total a recaudar: ${formatCOP(totalDeuda)}*\n\n¡Gracias por mantenerse al día! 🙏▶️`;
    return msg;
  };

  const copyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(generarWhatsApp());
      showToast("Mensaje copiado al portapapeles");
    } catch {
      showToast("Error al copiar");
    }
  };

  const resetData = async () => {
    setMiembros(INITIAL_DATA);
    showToast("Datos reiniciados (local)");
  };

  if (!loaded) return <div style={styles.loading}>Cargando datos...</div>;

  return (
    <div style={styles.container} className="sft-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700&family=Instrument+Serif:ital@0;1&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(229,9,20,0.4); border-radius: 4px; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        @keyframes toastIn { from { opacity:0; transform:translateY(30px) } to { opacity:1; transform:translateY(0) } }
        .sft-header-top { flex-wrap: wrap; gap: 12px; }
        .sft-cards { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
        .sft-table-header { display: grid; }
        .sft-row { display: grid; }
        .sft-mobile-cards { display: none; }
        @media (max-width: 640px) {
          .sft-container { padding: 12px !important; }
          .sft-cards { grid-template-columns: 1fr !important; }
          .sft-header-top { flex-direction: column; align-items: flex-start !important; }
          .sft-col-selector { display: none !important; }
          .sft-table-header { display: none !important; }
          .sft-row { display: none !important; }
          .sft-mobile-cards { display: flex !important; flex-direction: column; gap: 10px; padding: 12px; }
        }
        @media (min-width: 400px) and (max-width: 640px) {
          .sft-cards { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>

      <div style={styles.header}>
        <div style={styles.headerTop} className="sft-header-top">
          <div style={styles.logoWrap}>
            <div style={styles.ytIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <rect x="1" y="4" width="22" height="16" rx="4" fill="#E50914"/>
                <polygon points="10,8 10,16 16,12" fill="#fff"/>
              </svg>
            </div>
            <div>
              <h1 style={styles.title}>YouTube Premium Familiar</h1>
              <p style={styles.subtitle}>Panel de administración de pagos</p>
            </div>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.autoTag}>⚡ Online (KV)</div>
            <button onClick={resetData} style={styles.resetBtn} title="Reiniciar datos">
              ↺
            </button>
          </div>
        </div>

        <div className="sft-cards">
          <div style={{ ...styles.card, ...styles.cardRed }}>
            <span style={styles.cardLabel}>Cuota mensual</span>
            <span style={styles.cardValue}>{formatCOP(CUOTA)}</span>
          </div>
          <div style={{ ...styles.card, ...styles.cardAmber }}>
            <span style={styles.cardLabel}>Total a recaudar</span>
            <span style={styles.cardValue}>{formatCOP(totalDeuda)}</span>
          </div>
          <div style={{ ...styles.card, ...styles.cardBlue }}>
            <span style={styles.cardLabel}>Corte actual</span>
            <span style={styles.cardValue}>{mesCorte}</span>
          </div>
        </div>
      </div>

      <div style={styles.colSelector} className="sft-col-selector">
        {ALL_COLS.filter((c) => c !== "nombre" && c !== "accion").map((col) => (
          <button
            key={col}
            onClick={() => toggleCol(col)}
            style={{
              ...styles.colChip,
              ...(visibleCols.has(col) ? styles.colChipActive : styles.colChipOff),
            }}
          >
            {visibleCols.has(col) ? "✓ " : ""}{COL_LABELS[col]}
          </button>
        ))}
      </div>

      <div style={styles.tableWrap}>
        <div style={styles.tableScroll}>
          <div style={styles.tableInner}>
            <div className="sft-table-header" style={{ ...styles.tableHeader, gridTemplateColumns: gridTemplate }}>
              {ALL_COLS.filter((c) => visibleCols.has(c)).map((col) => (
                <span key={col} style={col === "nombre" ? styles.thName : styles.thCenter}>
                  {COL_LABELS[col]}
                </span>
              ))}
            </div>
            {miembrosConDeuda.map((m, i) => {
              const deuda = m.mesesPendientes.length * CUOTA;
              const estaAlDia = m.mesesPendientes.length === 0;
              return (
                <div key={m.nombre} className="sft-row" style={{ ...styles.row, gridTemplateColumns: gridTemplate, animationDelay: `${i * 0.07}s` }}>
                  {visibleCols.has("nombre") && (
                    <span style={styles.tdName}>
                      <span style={{ ...styles.avatar, background: estaAlDia ? "#E50914" : "#f59e0b" }}>
                        {m.nombre[0]}
                      </span>
                      {m.nombre}
                    </span>
                  )}
                  {visibleCols.has("estado") && (
                    <span style={styles.tdCenter}>
                      <span style={{ ...styles.badge, ...(estaAlDia ? styles.badgeGreen : styles.badgeRed) }}>
                        {estaAlDia ? "✓ Al día" : `Debe ${m.mesesPendientes.length} mes${m.mesesPendientes.length > 1 ? "es" : ""}`}
                      </span>
                    </span>
                  )}
                  {visibleCols.has("pendiente") && (
                    <span style={{ ...styles.tdCenter, fontSize: "13px", color: "#AAAAAA" }}>
                      {m.mesesPendientes.length > 0 ? m.mesesPendientes.join(", ") : "—"}
                    </span>
                  )}
                  {visibleCols.has("deuda") && (
                    <span style={{ ...styles.tdCenter, fontWeight: 600, color: deuda > 0 ? "#f59e0b" : "#E50914" }}>
                      {deuda > 0 ? formatCOP(deuda) : "—"}
                    </span>
                  )}
                  {visibleCols.has("ultimoPago") && (
                    <span style={{ ...styles.tdCenter, fontSize: "13px", color: "#ddd" }}>{m.ultimoPago}</span>
                  )}
                  {visibleCols.has("accion") && (
                    <span style={styles.tdCenter}>
                      {m.mesesPendientes.length > 0 ? (
                        editIdx === i ? (
                          <div style={styles.payOptions}>
                            {m.mesesPendientes.map((mes) => {
                              const key = `${m.nombre}|${mes}`;
                              const isBusy = requesting.has(key);
                              const anyBusy = [...requesting].some((k) => k.startsWith(`${m.nombre}|`));
                              return (
                                <button
                                  key={mes}
                                  onClick={() => void solicitarPago(i, mes)}
                                  style={styles.payMesBtn}
                                  disabled={anyBusy}
                                  title="Enviar a aprobación"
                                >
                                  {isBusy ? "Enviando..." : mes}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => setEditIdx(null)}
                              style={styles.cancelBtn}
                              disabled={[...requesting].some((k) => k.startsWith(`${m.nombre}|`))}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setEditIdx(i)} style={styles.payBtn}>
                            Solicitar pago
                          </button>
                        )
                      ) : (
                        <span style={{ color: "#E5091499", fontSize: "13px" }}>Completo</span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}

            <div className="sft-mobile-cards">
              {miembrosConDeuda.map((m, i) => {
                const deuda = m.mesesPendientes.length * CUOTA;
                const estaAlDia = m.mesesPendientes.length === 0;
                return (
                  <div key={m.nombre} style={styles.mobileCard}>
                    <div style={styles.mobileCardHeader}>
                      <div style={styles.mobileCardName}>
                        <span style={{ ...styles.avatar, background: estaAlDia ? "#E50914" : "#f59e0b" }}>
                          {m.nombre[0]}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: "15px" }}>{m.nombre}</span>
                      </div>
                      <span style={{ ...styles.badge, ...(estaAlDia ? styles.badgeGreen : styles.badgeRed) }}>
                        {estaAlDia ? "✓ Al día" : `Debe ${m.mesesPendientes.length} mes${m.mesesPendientes.length > 1 ? "es" : ""}`}
                      </span>
                    </div>
                    {!estaAlDia && (
                      <div style={styles.mobileCardBody}>
                        <div style={styles.mobileCardRow}>
                          <span style={styles.mobileCardLabel}>Pendiente</span>
                          <span style={styles.mobileCardValue}>{m.mesesPendientes.join(", ")}</span>
                        </div>
                        <div style={styles.mobileCardRow}>
                          <span style={styles.mobileCardLabel}>Deuda</span>
                          <span style={{ ...styles.mobileCardValue, color: "#f59e0b", fontWeight: 600 }}>{formatCOP(deuda)}</span>
                        </div>
                        <div style={styles.mobileCardRow}>
                          <span style={styles.mobileCardLabel}>Último pago</span>
                          <span style={styles.mobileCardValue}>{m.ultimoPago}</span>
                        </div>
                      </div>
                    )}
                    {estaAlDia && (
                      <div style={styles.mobileCardBody}>
                        <div style={styles.mobileCardRow}>
                          <span style={styles.mobileCardLabel}>Último pago</span>
                          <span style={styles.mobileCardValue}>{m.ultimoPago}</span>
                        </div>
                      </div>
                    )}
                    <div style={styles.mobileCardFooter}>
                      {m.mesesPendientes.length > 0 ? (
                        editIdx === i ? (
                          <div style={{ ...styles.payOptions, justifyContent: "flex-start" }}>
                            {m.mesesPendientes.map((mes) => {
                              const key = `${m.nombre}|${mes}`;
                              const isBusy = requesting.has(key);
                              const anyBusy = [...requesting].some((k) => k.startsWith(`${m.nombre}|`));
                              return (
                                <button
                                  key={mes}
                                  onClick={() => void solicitarPago(i, mes)}
                                  style={styles.payMesBtn}
                                  disabled={anyBusy}
                                  title="Enviar a aprobación"
                                >
                                  {isBusy ? "Enviando..." : mes}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => setEditIdx(null)}
                              style={styles.cancelBtn}
                              disabled={[...requesting].some((k) => k.startsWith(`${m.nombre}|`))}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setEditIdx(i)} style={{ ...styles.payBtn, width: "100%" }}>
                            Solicitar pago
                          </button>
                        )
                      ) : (
                        <span style={{ color: "#E5091499", fontSize: "13px" }}>Completo</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      </div>
    </div>

      <div style={styles.whatsappSection}>
        <button onClick={() => setShowWhatsApp(!showWhatsApp)} style={styles.whatsappToggle}>
          <span>📱 {showWhatsApp ? "Ocultar" : "Generar"} mensaje WhatsApp</span>
          <span style={{ transform: showWhatsApp ? "rotate(180deg)" : "none", transition: "0.3s" }}>▾</span>
        </button>
        {showWhatsApp && (
          <div style={styles.whatsappContent}>
            <pre style={styles.whatsappPre}>{generarWhatsApp()}</pre>
            <button onClick={() => void copyWhatsApp()} style={styles.copyBtn}>
              📋 Copiar mensaje
            </button>
          </div>
        )}
      </div>

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loading: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    fontFamily: "DM Sans, sans-serif",
    color: "#E50914",
    background: "#181818",
  },
  container: {
    fontFamily: "'DM Sans', sans-serif",
    background: "#181818",
    minHeight: "100vh",
    color: "#f1f1f1",
    padding: "20px",
    maxWidth: "900px",
    margin: "0 auto",
  },
  header: { marginBottom: "24px" },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  logoWrap: { display: "flex", alignItems: "center", gap: "12px" },
  ytIcon: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    background: "rgba(229,9,20,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: "26px",
    fontWeight: 400,
    color: "#fff",
    letterSpacing: "-0.5px",
  },
  subtitle: { fontSize: "13px", color: "#AAAAAA", marginTop: "2px" },
  headerRight: { display: "flex", alignItems: "center", gap: "8px" },
  autoTag: {
    background: "rgba(229,9,20,0.12)",
    color: "#E50914",
    fontSize: "11px",
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: "6px",
    border: "1px solid rgba(229,9,20,0.25)",
  },
  resetBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "none",
    color: "#AAAAAA",
    fontSize: "20px",
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cards: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" },
  card: { padding: "14px 16px", borderRadius: "14px", display: "flex", flexDirection: "column", gap: "4px" },
  cardRed: { background: "rgba(229,9,20,0.10)", border: "1px solid rgba(229,9,20,0.20)" },
  cardAmber: { background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.20)" },
  cardBlue: { background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.20)" },
  cardLabel: { fontSize: "11px", color: "#AAAAAA", textTransform: "uppercase", letterSpacing: "0.5px" },
  cardValue: { fontSize: "18px", fontWeight: 700, color: "#fff" },
  colSelector: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginBottom: "10px",
  },
  colChip: {
    border: "none",
    borderRadius: "20px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  colChipActive: {
    background: "rgba(229,9,20,0.18)",
    color: "#E50914",
    outline: "1px solid rgba(229,9,20,0.35)",
  },
  colChipOff: {
    background: "rgba(255,255,255,0.07)",
    color: "#909090",
    outline: "1px solid rgba(255,255,255,0.12)",
  },
  tableWrap: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "16px",
    marginBottom: "16px",
    overflow: "hidden",
  },
  tableScroll: {
    display: "block",
    width: "100%",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
  },
  tableInner: {
    minWidth: "320px",
  },
  tableHeader: {
    display: "grid",
    padding: "10px 16px",
    background: "rgba(255,255,255,0.07)",
    borderBottom: "2px solid rgba(255,255,255,0.12)",
    fontSize: "11px",
    color: "#AAAAAA",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    fontWeight: 600,
  },
  thName: { textAlign: "left" },
  thCenter: { textAlign: "center" },
  row: {
    display: "grid",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    alignItems: "center",
    animation: "fadeIn 0.4s ease forwards",
    opacity: 0,
  },
  tdName: { display: "flex", alignItems: "center", gap: "10px", fontWeight: 500, fontSize: "14px" },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: 700,
    color: "#fff",
    flexShrink: 0,
  },
  tdCenter: { textAlign: "center", fontSize: "14px" },
  badge: { padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 500 },
  badgeGreen: { background: "rgba(229,9,20,0.15)", color: "#E50914" },
  badgeRed: { background: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  payBtn: {
    background: "rgba(229,9,20,0.18)",
    color: "#E50914",
    border: "none",
    padding: "6px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  payOptions: { display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "center", alignItems: "center" },
  payMesBtn: {
    background: "#E50914",
    color: "#fff",
    border: "none",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
  },
  cancelBtn: {
    background: "rgba(255,255,255,0.10)",
    color: "#AAAAAA",
    border: "none",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    cursor: "pointer",
  },
  whatsappSection: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  whatsappToggle: {
    width: "100%",
    background: "none",
    border: "none",
    color: "#fff",
    padding: "14px 20px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  whatsappContent: { padding: "0 20px 20px", animation: "slideUp 0.3s ease" },
  whatsappPre: {
    background: "rgba(0,0,0,0.4)",
    borderRadius: "12px",
    padding: "16px",
    fontSize: "13px",
    lineHeight: "1.6",
    color: "#e0e0e0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "DM Sans, sans-serif",
    marginBottom: "12px",
    maxHeight: "300px",
    overflowY: "auto",
  },
  copyBtn: {
    background: "#E50914",
    color: "#fff",
    border: "none",
    padding: "10px 20px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  toast: {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#E50914",
    color: "#fff",
    padding: "10px 24px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: 600,
    animation: "toastIn 0.3s ease",
    zIndex: 100,
    boxShadow: "0 8px 30px rgba(229,9,20,0.35)",
  },
  mobileCard: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "14px",
    padding: "14px",
    animation: "fadeIn 0.4s ease forwards",
  },
  mobileCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
  },
  mobileCardName: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  mobileCardBody: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "12px",
    paddingTop: "10px",
    borderTop: "1px solid rgba(255,255,255,0.10)",
  },
  mobileCardRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mobileCardLabel: {
    fontSize: "12px",
    color: "#AAAAAA",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  mobileCardValue: {
    fontSize: "13px",
    color: "#ddd",
  },
  mobileCardFooter: {
    paddingTop: "10px",
    borderTop: "1px solid rgba(255,255,255,0.10)",
  },
};
