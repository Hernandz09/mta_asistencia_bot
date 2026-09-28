export const PANEL_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Panel MTA · Asistencias</title>
  <style>
    :root {
      --bg: #12100e;
      --paper: #fffcf7;
      --ink: #1c1915;
      --muted: #6b6458;
      --line: #e4ddd0;
      --accent: #c9a227;
      --navy: #2f5d8a;
      --green: #2d6a4f;
      --green-bg: #d8f3dc;
      --red: #9b2226;
      --red-bg: #fde2e1;
      --sidebar: #0e0c0a;
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 500px at 10% -10%, rgba(201,162,39,.18), transparent 50%),
        radial-gradient(800px 400px at 100% 0%, rgba(47,93,138,.2), transparent 45%),
        var(--bg);
    }
    .login {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .login-card {
      width: min(440px, 100%);
      background: linear-gradient(180deg, #1b1814, #141210);
      border: 1px solid rgba(201,162,39,.35);
      border-radius: 24px;
      padding: 32px 28px 28px;
      box-shadow: 0 30px 80px rgba(0,0,0,.45);
      color: #f4efe6;
    }
    .brand {
      color: var(--accent);
      font-size: .72rem;
      letter-spacing: .22em;
      text-transform: uppercase;
    }
    .login-card h1 { margin: 10px 0 8px; font-size: 1.7rem; }
    .login-card p { color: #b7aea0; margin: 0 0 22px; line-height: 1.5; }
    label { display: block; font-size: .82rem; font-weight: 600; margin: 0 0 8px; }
    input, select {
      width: 100%;
      border: 1px solid #3a342c;
      border-radius: 12px;
      padding: 12px 14px;
      font: inherit;
      background: #0f0d0b;
      color: #fff;
    }
    .login-card input { background: #0f0d0b; color: #fff; }
    button {
      border: 0;
      border-radius: 12px;
      padding: 11px 16px;
      font-weight: 700;
      cursor: pointer;
      background: var(--accent);
      color: #161310;
    }
    button.ghost { background: #2a2520; color: #f4efe6; }
    button.navy { background: var(--navy); color: #fff; }
    button.danger { background: var(--red); color: #fff; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .app { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh; background: #f4f1ea; color: var(--ink); }
    nav { background: var(--sidebar); color: #d8d0c4; padding: 26px 16px; }
    nav h2 { color: #fff; font-size: 1.05rem; margin: 8px 0 20px; }
    nav button {
      width: 100%;
      text-align: left;
      background: transparent;
      color: inherit;
      margin: 0 0 6px;
    }
    nav button.active, nav button:hover { background: #221e19; color: #fff; }
    main { padding: 28px; }
    .toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .pill { display: inline-block; font-size: .72rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
    .ok { background: var(--green-bg); color: var(--green); }
    .warn { background: #fff6d8; color: #7c4a00; }
    .card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 16px;
      margin: 0 0 14px;
    }
    .lede { color: var(--muted); margin: 6px 0 0; }
    .daygrid { display: grid; grid-template-columns: repeat(7, minmax(112px, 1fr)); gap: 8px; }
    .day { border: 1px solid var(--line); border-radius: 12px; padding: 10px; background: #fff; }
    .day.off { background: #f3efe6; color: var(--muted); }
    .day input[type="time"] { margin-top: 6px; background: #fff; color: var(--ink); }
    .msg { margin: 10px 0 0; padding: 10px 12px; border-radius: 10px; }
    .msg.err { background: var(--red-bg); color: var(--red); }
    .msg.ok { background: var(--green-bg); color: var(--green); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 12px 0; }
    .stat { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
    .stat b { display: block; font-size: 1.35rem; margin-top: 4px; }
    .detalle { white-space: pre-wrap; background: #0f1720; color: #e7eef5; padding: 14px; border-radius: 12px; font-size: .82rem; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-grid .full { grid-column: 1 / -1; }
    button:disabled { opacity: .6; cursor: wait; }
    .dash-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 16px; }
    .dash-top h1 { margin: 0; letter-spacing: -.03em; }
    .dash-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .dash-actions { display: flex; gap: 8px; flex: none; }
    .dash-filters select {
      width: auto; min-width: 0; flex: 1 1 160px;
      background: #fff; color: var(--ink); border: 1px solid var(--line);
    }
    #stats-user { min-width: 220px; max-width: 380px; flex: 1 1 280px; }
    #stats-periodo { min-width: 140px; max-width: 170px; flex: 0 1 160px; }
    .dash-filters button { white-space: nowrap; }
    .hero { display: flex; justify-content: space-between; gap: 20px; align-items: center; flex-wrap: wrap; padding: 22px; }
    .who { display: flex; gap: 16px; align-items: center; min-width: 0; }
    .avatar {
      width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center;
      color: #fff; font-weight: 800; font-size: 1.15rem; flex: none;
      box-shadow: inset 0 -8px 16px rgba(0,0,0,.12);
    }
    .kicker { color: var(--muted); font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .who h2 { margin: 4px 0 0; font-size: 1.65rem; letter-spacing: -.03em; }
    .handle { color: var(--navy); font-weight: 800; margin-top: 2px; }
    .meta { color: var(--muted); margin-top: 6px; font-size: .88rem; }
    .rings { display: flex; gap: 4px; align-items: center; flex: none; }
    .ring-wrap { position: relative; width: 118px; height: 118px; flex: none; }
    .ring-lg { width: 156px; height: 156px; }
    .ring-wrap svg { width: 100%; height: 100%; display: block; }
    .ring-track { fill: none; stroke: #efe8dc; stroke-width: 11; }
    .ring-value { fill: none; stroke-width: 11; stroke-linecap: round; }
    .ring-label { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; text-align: center; }
    .ring-label strong { font-size: 1.25rem; letter-spacing: -.04em; line-height: 1; }
    .ring-lg .ring-label strong { font-size: 1.85rem; }
    .ring-label span { color: var(--muted); font-size: .72rem; font-weight: 700; margin-top: 4px; }
    .kpi-row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; margin: 0 0 14px; }
    .kpi {
      background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 14px 14px 12px;
      box-shadow: 0 10px 28px rgba(28,25,21,.045);
    }
    .kpi span { display: block; color: var(--muted); font-size: .75rem; font-weight: 700; }
    .kpi b { display: block; margin-top: 8px; font-size: 1.45rem; letter-spacing: -.03em; line-height: 1; }
    .kpi small { display: block; margin-top: 6px; color: var(--muted); font-size: .75rem; }
    .kpi.good b { color: #2d6a4f; }
    .kpi.warn b { color: #9a6700; }
    .kpi.bad b { color: #9b2226; }
    .chart-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 14px; margin-bottom: 14px; }
    .chart-grid > .card { margin: 0; }
    .span-2 { grid-column: 1 / -1; }
    .chart-card h3 { margin: 0 0 4px; font-size: 1.02rem; }
    .donut-row { display: flex; align-items: center; gap: 18px; margin-top: 8px; }
    .donut-wrap { width: 168px; height: 168px; }
    .legend { display: flex; flex-direction: column; gap: 8px; width: max-content; }
    .spot { padding: 14px 0; border-bottom: 1px solid #f3efe6; }
    .spot:last-child { border-bottom: 0; padding-bottom: 0; }
    .spot .kicker { display: block; margin-bottom: 6px; }
    .spot strong { font-size: 1.08rem; }
    .spot .handle { display: inline; margin-left: 6px; }
    .legend div { display: flex; align-items: center; gap: 8px; font-size: .9rem; }
    .legend i { width: 10px; height: 10px; border-radius: 99px; display: inline-block; flex: none; }
    .legend b { margin-left: 8px; min-width: 1.6rem; text-align: right; }
    .meter { margin: 14px 0 0; }
    .meter-top { display: flex; justify-content: space-between; gap: 8px; font-size: .88rem; margin-bottom: 6px; }
    .track { height: 10px; background: #f0ebe3; border-radius: 99px; overflow: hidden; }
    .track > div { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #2f5d8a, #3d9a62); }
    .track.gold > div { background: linear-gradient(90deg, #b8860b, #e6c35c); }
    .track.green > div { background: #2f9e62; }
    .track.amber > div { background: #d89b12; }
    .cols { display: flex; align-items: flex-end; gap: 6px; height: 190px; margin-top: 12px; }
    .col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
    .col-val { font-size: .68rem; color: var(--muted); margin-bottom: 4px; }
    .col-track { width: 100%; max-width: 26px; flex: 1; display: flex; align-items: flex-end; }
    .col-fill { width: 100%; border-radius: 8px 8px 3px 3px; min-height: 4px; }
    .col-tick { margin-top: 6px; font-size: .65rem; color: var(--muted); }
    .cols.compact .col-val { display: none; }
    .area { width: 100%; height: 210px; display: block; margin-top: 8px; }
    .area-labels { display: flex; justify-content: space-between; color: var(--muted); font-size: .75rem; }
    .days { max-height: 420px; overflow: auto; display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .dayline { display: grid; grid-template-columns: 108px 1fr auto; gap: 10px; align-items: center; padding: 9px 12px; border-radius: 12px; background: #fbf8f2; }
    .dayline .date { font-variant-numeric: tabular-nums; font-weight: 700; }
    .status { font-weight: 700; font-size: .88rem; }
    .status.ok { color: #2d6a4f; }
    .status.warn { color: #9a6700; }
    .status.bad { color: #9b2226; }
    .status.muted { color: #6b6458; }
    .dayline .hours { font-variant-numeric: tabular-nums; font-weight: 800; }
    .edit-grid { display: grid; grid-template-columns: 280px 1fr; gap: 14px; margin-bottom: 14px; }
    .edit-grid > .card { margin: 0; }
    #edit-estado, .toolbar select[data-estado] {
      width: auto; min-width: 150px; background: #fff; color: var(--ink); border: 1px solid var(--line);
    }
    .daytable { overflow: auto; margin-top: 8px; }
    .dayhead, .dayedit {
      min-width: 880px;
      display: grid;
      grid-template-columns: 108px 108px 108px minmax(150px, 1fr) minmax(160px, 1fr) 84px auto;
      gap: 8px;
      align-items: center;
    }
    .dayhead { color: var(--muted); font-size: .72rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; padding-bottom: 6px; }
    .dayedit { padding: 8px 0; border-top: 1px solid #f3efe6; }
    .dayedit input, .dayedit select {
      width: 100%; background: #fff; color: var(--ink); border: 1px solid var(--line); padding: 8px 10px;
    }
    .hperson { display: grid; grid-template-columns: minmax(180px, 260px) 1fr 72px; gap: 12px; align-items: center; padding: 8px 0; }
    .hmeta strong { display: block; }
    .hmeta span { color: var(--navy); font-size: .82rem; font-weight: 700; }
    .htrack { height: 12px; background: #f0ebe3; border-radius: 99px; overflow: hidden; }
    .hfill { height: 100%; border-radius: 99px; }
    .hperson > b { text-align: right; font-variant-numeric: tabular-nums; }
    .table-wrap { overflow: auto; margin-top: 8px; }
    table.report { width: 100%; border-collapse: collapse; font-size: .92rem; }
    table.report th { text-align: left; font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--line); }
    table.report td { padding: 11px 10px; border-bottom: 1px solid #f3efe6; vertical-align: middle; }
    table.report tr:hover td { background: #fbf8f2; }
    .mini { width: 72px; height: 6px; background: #f0ebe3; border-radius: 99px; overflow: hidden; display: inline-block; vertical-align: middle; margin-right: 6px; }
    .mini > i { display: block; height: 100%; border-radius: 99px; }
    .note { margin: 8px 0 0; }
    @media (max-width: 1100px) {
      .kpi-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .chart-grid { grid-template-columns: 1fr; }
      .span-2 { grid-column: auto; }
    }
    @media (max-width: 900px) {
      .app { grid-template-columns: 1fr; }
      .daygrid, .form-grid { grid-template-columns: 1fr; }
      .hero, .donut-row { flex-direction: column; align-items: flex-start; }
      .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .hperson { grid-template-columns: 1fr; gap: 4px; }
      .edit-grid { grid-template-columns: 1fr; }
      .rings { width: 100%; justify-content: flex-start; flex-wrap: wrap; gap: 4px; }
      .ring-wrap:not(.donut-wrap) { width: 108px; height: 108px; }
      .ring-lg { width: 132px; height: 132px; }
      .ring-label strong { font-size: 1rem; }
      .ring-lg .ring-label strong { font-size: 1.45rem; }
    }
  </style>
</head>
<body>
<div id="login" class="login">
  <div class="login-card">
    <div class="brand">MTA Software</div>
    <h1>Panel de asistencias</h1>
    <p>Entra para editar horarios, ver stats, cargar horas extra y agregar practicantes al bot.</p>
    <form id="login-form">
      <label for="clave">Clave de acceso</label>
      <input id="clave" type="password" autocomplete="current-password" placeholder="Escribe la clave" />
      <div class="row" style="margin-top:18px">
        <button type="submit" id="entrar">Entrar al panel</button>
      </div>
    </form>
    <div id="login-msg"></div>
  </div>
</div>
<div id="app" class="app" hidden>
  <nav>
    <div class="brand">MTA Software</div>
    <h2>Bot de asistencias</h2>
    <button data-tab="horarios" class="active">Horarios</button>
    <button data-tab="stats">Stats</button>
    <button data-tab="extras">Horas extra</button>
    <button data-tab="alta">Agregar al bot</button>
    <button id="salir" class="ghost" style="margin-top:28px">Cerrar sesión</button>
  </nav>
  <main>
    <div id="flash"></div>
    <section data-panel="horarios">
      <div class="toolbar">
        <div>
          <h1 style="margin:0">Horarios</h1>
          <p class="lede">Marca el día, pon entrada y salida, y guarda. Yasumy y Kiara: sábado 12:00–18:00.</p>
        </div>
        <button type="button" class="navy" id="reload">Actualizar lista</button>
      </div>
      <div id="people"></div>
    </section>
    <section data-panel="stats" hidden>
      <div class="dash-top">
        <div>
          <h1>Stats</h1>
          <p class="lede">Asistencia con nombre y usuario, más el reporte de todo el equipo.</p>
        </div>
        <div class="dash-filters">
          <select id="stats-user"></select>
          <select id="stats-periodo">
            <option value="semana">Esta semana</option>
            <option value="mes" selected>Este mes</option>
            <option value="total">Histórico</option>
          </select>
          <div class="dash-actions">
            <button type="button" class="navy" id="stats-go">Ver resumen</button>
            <button type="button" id="stats-report">Obtener reporte general</button>
          </div>
        </div>
      </div>
      <div id="stats-box"></div>
    </section>
    <section data-panel="extras" hidden>
      <h1>Horas extra</h1>
      <p class="lede">Se suman al día sin cambiar puntual, tardanza ni falta. Máximo 12 h extra por día.</p>
      <div class="row">
        <select id="ex-user"></select>
        <input id="ex-fecha" placeholder="fecha: hoy o 2026-09-14" />
        <input id="ex-tiempo" placeholder="tiempo: 2h o 2h 30m" />
        <input id="ex-motivo" placeholder="motivo" />
      </div>
      <div class="row" style="margin-top:10px">
        <button type="button" id="ex-add">Sumar</button>
        <button type="button" class="navy" id="ex-set">Reemplazar</button>
        <button type="button" class="danger" id="ex-del">Quitar</button>
        <button type="button" class="ghost" id="ex-list">Ver extras</button>
      </div>
      <pre class="detalle" id="ex-out" style="margin-top:14px"></pre>
    </section>
    <section data-panel="alta" hidden>
      <h1>Agregar practicante</h1>
      <p class="lede">Crea o actualiza a alguien en el bot. Puedes copiar el horario de otra persona.</p>
      <div class="form-grid card">
        <div><label>Nombres</label><input id="a-nombres" /></div>
        <div><label>Apellidos</label><input id="a-apellidos" /></div>
        <div class="full"><label>Discord ID</label><input id="a-discord" placeholder="743334334613946380" /></div>
        <div>
          <label>Área</label>
          <select id="a-area">
            <option>software</option><option>video</option><option>admin</option>
            <option>marketing</option><option>fotografia</option><option>diseno</option>
          </select>
        </div>
        <div><label>Ciclo</label><input id="a-ciclo" /></div>
        <div class="full"><label>Carrera</label><input id="a-carrera" /></div>
        <div class="full"><label>Copiar horario de</label><select id="a-copy"><option value="">Sin copiar</option></select></div>
        <div class="full"><button type="button" id="a-save">Guardar en el bot</button></div>
      </div>
    </section>
  </main>
</div>
<script>
const KEY = "mta_panel_key";
let people = [];
let usernames = {};
const $ = (id) => document.getElementById(id);
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}
function fmtNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
function fmtPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
function initials(name) {
  return String(name || "?").trim().split(/\\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "?";
}
function avatarColor(name) {
  const palette = ["#2f5d8a", "#2d6a4f", "#8a5a2f", "#6b3fa0", "#9b2226", "#1d6a75"];
  let hash = 0;
  const text = String(name || "");
  for (let i = 0; i < text.length; i++) hash = (hash + text.charCodeAt(i) * (i + 1)) % palette.length;
  return palette[hash];
}
function formatFecha(iso) {
  const parts = String(iso || "").slice(0, 10).split("-");
  if (parts.length !== 3 || parts[0].length !== 4) return String(iso || "");
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}
function shortFecha(iso) {
  const full = formatFecha(iso);
  return full.length >= 5 ? full.slice(0, 5) : full;
}
function handleOf(id) {
  const user = usernames[String(id)];
  return user ? "@" + user : "sin usuario";
}
function pctColor(pct) {
  const value = Number(pct) || 0;
  if (value >= 90) return "#2f9e62";
  if (value >= 75) return "#d89b12";
  return "#d64545";
}
function toneOf(label) {
  const text = String(label || "");
  if (text.includes("Puntual")) return { cls: "ok", color: "#2f9e62" };
  if (text.includes("Tardanza")) return { cls: "warn", color: "#d89b12" };
  if (text.includes("justificada")) return { cls: "muted", color: "#6b8f71" };
  if (text.includes("Falta")) return { cls: "bad", color: "#d64545" };
  if (text.includes("Extra")) return { cls: "warn", color: "#c9a227" };
  if (text.includes("Pendiente")) return { cls: "muted", color: "#b7aea0" };
  return { cls: "muted", color: "#2f5d8a" };
}
function setBusy(on) {
  ["stats-go", "stats-report"].forEach((id) => { const el = $(id); if (el) el.disabled = on; });
}
function flash(text, ok) {
  $("flash").innerHTML = text ? '<div class="msg ' + (ok ? "ok" : "err") + '">' + text + "</div>" : "";
}
async function api(path, opts = {}) {
  const headers = Object.assign({
    "Content-Type": "application/json",
    "x-api-key": sessionStorage.getItem(KEY) || "",
    "x-panel-key": sessionStorage.getItem(KEY) || ""
  }, opts.headers || {});
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json.error && json.error.message) || res.statusText);
  return json;
}
function dayEditor(p) {
  return p.days.map((d) => \`
    <div class="day \${d.laborable ? "" : "off"}">
      <label><input type="checkbox" data-day="\${d.day}" \${d.laborable ? "checked" : ""}/> \${d.dayLabel}</label>
      <input type="time" data-start="\${d.day}" value="\${d.start || ""}" />
      <input type="time" data-end="\${d.day}" value="\${d.end || ""}" />
    </div>\`).join("");
}
function estadoOptions(current) {
  return ["activo", "cesado", "suspendido"].map((value) =>
    '<option value="' + value + '"' + (value === current ? " selected" : "") + ">" + value + "</option>"
  ).join("");
}
function renderPeople() {
  $("people").innerHTML = people.map((p) => \`
    <article class="card" data-id="\${p.id}">
      <div class="toolbar">
        <div>
          <strong>\${p.nombre}</strong>
          <span class="pill \${p.estado === "activo" ? "ok" : "warn"}">\${p.estado}</span>
          <div class="lede">Discord \${p.discordId || "sin ID"} · \${p.weeklyScheduledHours} h/sem · \${p.area}</div>
        </div>
        <div class="row">
          <select data-estado="\${p.id}">\${estadoOptions(p.estado)}</select>
          <button type="button" data-estado-save="\${p.id}">Guardar estado</button>
          <button type="button" class="navy" data-save="\${p.id}">Guardar horario</button>
        </div>
      </div>
      <div class="daygrid">\${dayEditor(p)}</div>
    </article>\`).join("");
  fillSelects();
}
function fillSelects() {
  const opts = people.map((p) => {
    const user = usernames[String(p.id)];
    const label = user ? p.nombre + " (@" + user + ")" : p.nombre;
    return '<option value="' + p.id + '">' + esc(label) + "</option>";
  }).join("");
  ["stats-user", "ex-user", "a-copy"].forEach((id) => {
    const el = $(id);
    const keep = el.value;
    el.innerHTML = (id === "a-copy" ? '<option value="">Sin copiar</option>' : "") + opts;
    if (keep) el.value = keep;
  });
}
function daysFromCard(card) {
  return [...card.querySelectorAll(".day")].map((box) => {
    const day = Number(box.querySelector("[data-day]").dataset.day);
    const laborable = box.querySelector("[data-day]").checked;
    return {
      day,
      laborable,
      start: box.querySelector("[data-start]").value || null,
      end: box.querySelector("[data-end]").value || null,
    };
  });
}
async function loadPeople() {
  const json = await api("/api/v1/admin/practicantes");
  people = json.data || [];
  try {
    const directory = await api("/api/v1/practicantes");
    usernames = {};
    (directory.data || []).forEach((person) => {
      if (person.discordUsername) usernames[String(person.id)] = person.discordUsername;
    });
  } catch (e) {
    usernames = {};
  }
  renderPeople();
}
function showApp() {
  $("login").hidden = true;
  $("app").hidden = false;
}
function showLogin(msg) {
  $("app").hidden = true;
  $("login").hidden = false;
  if (msg) $("login-msg").innerHTML = '<div class="msg err">' + msg + "</div>";
}
async function entrar(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const clave = ($("clave").value || "").trim() || sessionStorage.getItem(KEY) || "";
  if (!clave) {
    showLogin("Escribe la clave.");
    return;
  }
  const btn = $("entrar");
  btn.disabled = true;
  btn.textContent = "Entrando…";
  try {
    sessionStorage.setItem(KEY, clave);
    await loadPeople();
    $("login-msg").innerHTML = "";
    showApp();
  } catch (e) {
    sessionStorage.removeItem(KEY);
    showLogin(e.message === "Unauthorized" || /401|inválida|incorrecta/i.test(e.message)
      ? "Clave incorrecta."
      : e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar al panel";
  }
}
$("login-form").addEventListener("submit", entrar);
if (sessionStorage.getItem(KEY)) entrar();
$("salir").onclick = () => { sessionStorage.removeItem(KEY); location.reload(); };
$("reload").onclick = () => loadPeople().catch((e) => flash(e.message));
document.querySelectorAll("nav [data-tab]").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll("nav [data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
    if (btn.dataset.tab === "stats" && !$("stats-box").innerHTML.trim()) loadResumen();
  };
});
$("people").addEventListener("click", async (ev) => {
  const estadoBtn = ev.target.closest("[data-estado-save]");
  if (estadoBtn) {
    const card = estadoBtn.closest("[data-id]");
    try {
      await api("/api/v1/practicantes/" + estadoBtn.dataset.estadoSave + "/estado", {
        method: "PUT",
        body: JSON.stringify({ estado: card.querySelector("[data-estado]").value }),
      });
      flash("Estado guardado en la base.", true);
      await loadPeople();
    } catch (e) { flash(e.message); }
    return;
  }
  const btn = ev.target.closest("[data-save]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  try {
    await api("/api/v1/practicantes/" + btn.dataset.save + "/horario", {
      method: "PUT",
      body: JSON.stringify({ dias: daysFromCard(card) }),
    });
    flash("Horario guardado en la base.", true);
    await loadPeople();
  } catch (e) { flash(e.message); }
});
function ring(pct, color, caption, large) {
  const value = clampPct(pct);
  const r = 46;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return '<div class="ring-wrap' + (large ? " ring-lg" : "") + '">' +
    '<svg viewBox="0 0 120 120" aria-hidden="true">' +
    '<circle class="ring-track" cx="60" cy="60" r="46"></circle>' +
    '<circle class="ring-value" cx="60" cy="60" r="46" stroke="' + color + '" stroke-dasharray="' + dash.toFixed(2) + " " + circ.toFixed(2) + '" transform="rotate(-90 60 60)"></circle>' +
    "</svg>" +
    '<div class="ring-label"><strong>' + fmtPct(value) + '%</strong><span>' + esc(caption) + "</span></div></div>";
}
function meter(label, text, pct, kind) {
  return '<div class="meter"><div class="meter-top"><span>' + esc(label) + "</span><b>" + esc(text) + "</b></div>" +
    '<div class="track ' + (kind || "") + '"><div style="width:' + clampPct(pct) + '%"></div></div></div>';
}
function donut(parts, unit) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const r = 40;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const slices = total <= 0
    ? '<circle cx="60" cy="60" r="40" fill="none" stroke="#efe8dc" stroke-width="16"></circle>'
    : parts.filter((part) => part.value > 0).map((part) => {
        const len = (part.value / total) * circ;
        const slice = '<circle cx="60" cy="60" r="40" fill="none" stroke="' + part.color + '" stroke-width="16" stroke-dasharray="' + len.toFixed(2) + " " + (circ - len).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 60 60)"></circle>';
        offset += len;
        return slice;
      }).join("");
  const legend = parts.map((part) =>
    '<div><i style="background:' + part.color + '"></i><span>' + esc(part.label) + "</span><b>" + part.value + "</b></div>"
  ).join("");
  return '<div class="donut-row"><div class="ring-wrap donut-wrap">' +
    '<svg viewBox="0 0 120 120" aria-hidden="true">' + slices + "</svg>" +
    '<div class="ring-label"><strong>' + total + "</strong><span>" + esc(unit || "días") + "</span></div></div>" +
    '<div class="legend">' + legend + "</div></div>";
}
function chartPoints(detalle) {
  return (detalle || []).filter((item) => !item.extra).map((item) => {
    const tone = toneOf(item.label);
    return { fecha: item.fecha, value: Number(item.horas) || 0, color: tone.color, label: item.label };
  });
}
function columnChart(points) {
  const max = Math.max.apply(null, points.map((point) => point.value).concat([1]));
  const compact = points.length > 12;
  const step = points.length > 16 ? Math.ceil(points.length / 8) : 1;
  return '<div class="cols' + (compact ? " compact" : "") + '">' + points.map((point, index) => {
    const height = Math.max(4, (point.value / max) * 100);
    const tick = index % step === 0 || index === points.length - 1 ? shortFecha(point.fecha) : "";
    return '<div class="col" title="' + esc(point.label || "") + '">' +
      '<span class="col-val">' + fmtNum(point.value) + "</span>" +
      '<div class="col-track"><div class="col-fill" style="height:' + height.toFixed(1) + "%;background:" + point.color + '"></div></div>' +
      '<span class="col-tick">' + tick + "</span></div>";
  }).join("") + "</div>";
}
function areaChart(points) {
  const w = 680;
  const h = 200;
  const padX = 12;
  const padY = 16;
  const max = Math.max.apply(null, points.map((point) => point.value).concat([1]));
  const coords = points.map((point, index) => {
    const x = points.length === 1
      ? w / 2
      : padX + (index * (w - padX * 2)) / (points.length - 1);
    const y = h - padY - (point.value / max) * (h - padY * 2);
    return [x, y];
  });
  const line = coords.map((coord, index) => (index ? "L" : "M") + coord[0].toFixed(1) + " " + coord[1].toFixed(1)).join(" ");
  const area = line + " L" + coords[coords.length - 1][0].toFixed(1) + " " + (h - padY) + " L" + coords[0][0].toFixed(1) + " " + (h - padY) + " Z";
  const first = shortFecha(points[0].fecha);
  const mid = shortFecha(points[Math.floor(points.length / 2)].fecha);
  const last = shortFecha(points[points.length - 1].fecha);
  return '<svg class="area" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<defs><linearGradient id="hoursArea" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#2f9e62" stop-opacity="0.35"></stop>' +
    '<stop offset="100%" stop-color="#2f9e62" stop-opacity="0.02"></stop></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#hoursArea)"></path>' +
    '<path d="' + line + '" fill="none" stroke="#2f9e62" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>' +
    '</svg><div class="area-labels"><span>' + first + "</span><span>" + mid + "</span><span>" + last + "</span></div>";
}
function hoursChart(points) {
  if (!points.length) return '<p class="lede">Sin días para graficar en este periodo.</p>';
  if (points.length > 21) return areaChart(points);
  return columnChart(points);
}
function parseDetail(item) {
  const label = String(item.label || "");
  const chunks = label.split("·");
  const left = (chunks[0] || "").trim();
  const status = left.replace(/^\\d{2}\\/\\d{2}\\/\\d{4}/, "").replace(/\\p{Extended_Pictographic}/gu, "").trim() || "Registro";
  return {
    date: item.fecha ? formatFecha(item.fecha) : left.slice(0, 10),
    status: status,
    hours: (chunks[1] || "").trim() || (fmtNum(item.horas) + " h"),
    tone: toneOf(label).cls,
  };
}
function detailList(detalle) {
  const rows = detalle || [];
  if (!rows.length) return '<p class="lede">Sin detalle en este periodo.</p>';
  return '<div class="days">' + rows.map((item) => {
    const row = parseDetail(item);
    return '<div class="dayline"><span class="date">' + esc(row.date) + '</span><span class="status ' + row.tone + '">' + esc(row.status) + '</span><span class="hours">' + esc(row.hours) + "</span></div>";
  }).join("") + "</div>";
}
function selectOptions(values, labels, current, allowEmpty) {
  const selected = current || "";
  const empty = allowEmpty ? '<option value=""' + (selected ? "" : " selected") + ">—</option>" : "";
  return empty + values.map((value, index) =>
    '<option value="' + value + '"' + (value === selected ? " selected" : "") + ">" + labels[index] + "</option>"
  ).join("");
}
function hhmm(value) {
  const text = String(value || "");
  return text.length >= 5 ? text.slice(0, 5) : "";
}
function guessedEstado(label) {
  const text = String(label || "");
  if (text.includes("justificada")) return { jornada: "FALTA_JUSTIFICADA", entrada: "" };
  if (text.includes("Falta")) return { jornada: "FALTA", entrada: "SIN_MARCA" };
  if (text.includes("Tardanza")) return { jornada: "CERRADA", entrada: "TARDANZA" };
  if (text.includes("Puntual")) return { jornada: "CERRADA", entrada: "PUNTUAL" };
  if (text.includes("Licencia")) return { jornada: "LICENCIA", entrada: "" };
  if (text.includes("Pendiente")) return { jornada: "ABIERTA", entrada: "" };
  return { jornada: "CERRADA", entrada: "" };
}
function dayEditList(detalle, jornadas) {
  const rows = (detalle || []).filter((item) => !item.extra);
  if (!rows.length) return '<p class="lede">Sin días en este periodo.</p>';
  const jornadasMap = jornadas || {};
  const jornadasLabels = ["Abierta", "Cerrada", "Falta", "Falta justificada", "Licencia", "Vacaciones", "No laborable"];
  const jornadasValues = ["ABIERTA", "CERRADA", "FALTA", "FALTA_JUSTIFICADA", "LICENCIA", "VACACIONES", "NO_LABORABLE"];
  const entradaLabels = ["Puntual", "Puntual anticipado", "Tardanza", "Fuera de horario", "Sin marca"];
  const entradaValues = ["PUNTUAL", "PUNTUAL_ANTICIPADO", "TARDANZA", "FUERA_DE_HORARIO", "SIN_MARCA"];
  const head = '<div class="dayhead"><span>Día</span><span>Entrada</span><span>Salida</span><span>Estado entrada</span><span>Estado</span><span>Horas</span><span></span></div>';
  return '<div class="daytable">' + head + rows.map((item) => {
    const key = String(item.fecha || "").slice(0, 10);
    const saved = jornadasMap[key] || {};
    const guess = guessedEstado(item.label);
    const horas = saved.id != null ? saved.horasComputadas : item.horas;
    return '<div class="dayedit" data-fecha="' + esc(key) + '">' +
      '<span class="date">' + esc(formatFecha(key)) + "</span>" +
      '<input type="time" data-entrada value="' + esc(hhmm(saved.horaEntrada)) + '" />' +
      '<input type="time" data-salida value="' + esc(hhmm(saved.horaSalida)) + '" />' +
      "<select data-estado-entrada>" + selectOptions(entradaValues, entradaLabels, saved.estadoEntrada || guess.entrada, true) + "</select>" +
      "<select data-estado-jornada>" + selectOptions(jornadasValues, jornadasLabels, saved.estadoJornada || guess.jornada, false) + "</select>" +
      '<input type="number" data-horas min="0" max="24" step="0.1" value="' + esc(horas ?? 0) + '" />' +
      '<button type="button" class="navy" data-save-day>Guardar</button></div>';
  }).join("") + "</div>";
}
function horarioEditor(personId) {
  const local = people.find((person) => String(person.id) === String(personId));
  if (!local) return '<p class="lede">No hay horario cargado para esta persona.</p>';
  return '<div id="edit-horario" data-id="' + local.id + '"><div class="daygrid">' + dayEditor(local) + "</div>" +
    '<button type="button" class="navy" data-save-horario style="margin-top:12px">Guardar horario</button></div>';
}
function renderResumen(d, jornadas) {
  const person = d.practicante || {};
  const asistencia = d.asistencia || {};
  const horas = d.horas || {};
  const indicadores = d.indicadores || {};
  const ranking = d.ranking || {};
  const nota = indicadores.nota;
  const nivel = Number(d.nivel) || 1;
  const historicas = Number(d.horas_historicas) || 0;
  const metaNivel = nivel * 100;
  const semanaPct = Number(horas.meta_semana) > 0 ? (Number(horas.semana) / Number(horas.meta_semana)) * 100 : 0;
  const rankText = ranking.posicion > 0
    ? "Ranking #" + ranking.posicion + " de " + ranking.total
    : "Aún no califica en el ranking";
  const points = chartPoints(d.detalle);
  const maxHoras = points.length ? Math.max.apply(null, points.map((point) => point.value)) : 0;
  return '<article class="card hero">' +
    '<div class="who"><div class="avatar" style="background:' + avatarColor(person.nombre) + '">' + esc(initials(person.nombre)) + "</div><div>" +
    '<div class="kicker">' + esc(d.periodo_label || "Periodo") + " · " + esc(formatFecha(d.desde)) + " – " + esc(formatFecha(d.hasta)) + "</div>" +
    "<h2>" + esc(person.nombre) + "</h2>" +
    '<div class="handle">' + esc(handleOf(person.id)) + "</div>" +
    '<div class="meta">' + esc(person.area || "sin área") + " · " + esc(person.estado || "") + " · " + esc(rankText) + " · Nivel " + nivel + "</div>" +
    '</div></div><div class="rings">' +
    ring(indicadores.pct_asistencia, "#2f9e62", "Asistencia", true) +
    ring(indicadores.pct_puntualidad, "#2f5d8a", "Puntualidad", false) +
    ring(indicadores.pct_horas, "#c9a227", "Horas", false) +
    "</div></article>" +
    '<div class="kpi-row">' +
    kpi("Horas periodo", fmtNum(horas.acumuladas), "en el periodo", "") +
    kpi("Extra", fmtNum(horas.extra), "horas sumadas", "") +
    kpi("Semana", fmtNum(horas.semana) + " / " + fmtNum(horas.meta_semana), "meta semanal", "") +
    kpi("Nota", nota == null ? "—" : fmtNum(nota), "sobre 20", nota != null && nota < 12 ? "bad" : "good") +
    kpi("Puntuales", asistencia.puntuales ?? 0, "a tiempo", "good") +
    kpi("Tardanzas", asistencia.tardanzas ?? 0, "tarde", Number(asistencia.tardanzas) > 0 ? "warn" : "") +
    kpi("Faltas", asistencia.faltas ?? 0, "sin marca", Number(asistencia.faltas) > 0 ? "bad" : "") +
    "</div>" +
    '<div class="edit-grid">' +
    '<article class="card chart-card"><h3>Estado</h3><p class="lede">Se guarda en la base: activo, cesado o suspendido.</p>' +
    '<div class="row"><select id="edit-estado">' + estadoOptions(person.estado) + '</select><button type="button" data-save-estado>Guardar estado</button></div></article>' +
    '<article class="card chart-card"><h3>Horario semanal</h3><p class="lede">Marca el día y las horas de entrada y salida.</p>' +
    horarioEditor(person.id) + "</article></div>" +
    '<div class="chart-grid">' +
    '<article class="card chart-card"><h3>Composición de días</h3><p class="lede">Puntuales, tardanzas y faltas del periodo.</p>' +
    donut([
      { label: "Puntuales", value: Number(asistencia.puntuales) || 0, color: "#2f9e62" },
      { label: "Tardanzas", value: Number(asistencia.tardanzas) || 0, color: "#d89b12" },
      { label: "Faltas", value: Number(asistencia.faltas) || 0, color: "#d64545" },
      { label: "Pendientes", value: Number(asistencia.pendientes) || 0, color: "#b7aea0" },
    ], "días") + "</article>" +
    '<article class="card chart-card"><h3>Ritmo</h3><p class="lede">Semana actual, nivel y nota.</p>' +
    meter("Esta semana", fmtNum(horas.semana) + " / " + fmtNum(horas.meta_semana) + " h", semanaPct, "green") +
    meter("Nivel " + nivel, fmtNum(historicas) + " / " + metaNivel + " h", metaNivel ? (historicas / metaNivel) * 100 : 0, "gold") +
    meter("Nota", (nota == null ? "—" : fmtNum(nota)) + " / 20", nota == null ? 0 : (Number(nota) / 20) * 100, "") +
    "</article>" +
    '<article class="card chart-card span-2"><h3>Horas por día</h3><p class="lede">Máximo del gráfico: ' + fmtNum(maxHoras) + " h.</p>" +
    hoursChart(points) + "</article></div>" +
    '<article class="card chart-card"><h3>Días del periodo</h3><p class="lede">Edita entrada, salida, estado y horas. Cada botón guarda ese día en la base.</p>' + dayEditList(d.detalle, jornadas) + "</article>";
}
function kpi(label, value, caption, kind) {
  return '<div class="kpi ' + kind + '"><span>' + esc(label) + "</span><b>" + esc(value) + "</b><small>" + esc(caption) + "</small></div>";
}
function renderReporte(data) {
  const rows = data.ranking || [];
  const periodo = data.periodo || {};
  const rango = periodo.efectivo_inicio
    ? formatFecha(periodo.efectivo_inicio) + " – " + formatFecha(periodo.efectivo_fin)
    : (periodo.tipo || "");
  const avgAsist = rows.length ? rows.reduce((sum, row) => sum + Number(row.pct_asistencia || 0), 0) / rows.length : 0;
  const avgPunt = rows.length ? rows.reduce((sum, row) => sum + Number(row.pct_puntualidad || 0), 0) / rows.length : 0;
  const faltas = rows.reduce((sum, row) => sum + Number(row.faltas || 0), 0);
  const puntuales = rows.reduce((sum, row) => sum + Number(row.dias_puntuales || 0), 0);
  const bands = [
    { label: "90% o más", value: rows.filter((row) => Number(row.pct_asistencia) >= 90).length, color: "#2f9e62" },
    { label: "75% a 89%", value: rows.filter((row) => Number(row.pct_asistencia) >= 75 && Number(row.pct_asistencia) < 90).length, color: "#d89b12" },
    { label: "Menos de 75%", value: rows.filter((row) => Number(row.pct_asistencia) < 75).length, color: "#d64545" },
  ];
  const bars = rows.map((row) =>
    '<div class="hperson"><div class="hmeta"><strong>' + esc(row.nombre) + "</strong><span>" + esc(handleOf(row.practicante_id)) + "</span></div>" +
    '<div class="htrack"><div class="hfill" style="width:' + clampPct(row.pct_asistencia) + "%;background:" + pctColor(row.pct_asistencia) + '"></div></div>' +
    "<b>" + fmtPct(row.pct_asistencia) + "%</b></div>"
  ).join("");
  const table = rows.map((row) =>
    "<tr><td>" + row.posicion + "</td><td><strong>" + esc(row.nombre) + "</strong></td><td>" + esc(handleOf(row.practicante_id)) + "</td><td>" +
    '<span class="mini"><i style="width:' + clampPct(row.pct_asistencia) + "%;background:" + pctColor(row.pct_asistencia) + '"></i></span>' + fmtPct(row.pct_asistencia) + "%</td><td>" +
    fmtPct(row.pct_puntualidad) + "%</td><td>" + (row.dias_puntuales ?? 0) + "</td><td>" + (row.tardanzas ?? 0) + "</td><td>" + (row.faltas ?? 0) + "</td><td>" +
    fmtNum(row.horas_acumuladas) + "</td><td>" + fmtNum(row.nota) + "</td></tr>"
  ).join("");
  const fuera = Number(data.no_calificados) || 0;
  const aside = fuera > 0
    ? '<p class="lede note">' + fuera + (fuera === 1 ? " practicante no entra" : " practicantes no entran") + " todavía: hacen falta al menos " + (data.dias_minimos_exigidos ?? "varios") + " días programados.</p>"
    : "";
  if (!rows.length) {
    return '<article class="card"><h2>Reporte general</h2><p class="lede">Nadie califica en este periodo.</p>' + aside + "</article>";
  }
  return '<article class="card hero"><div class="who"><div class="avatar" style="background:#2f5d8a">EQ</div><div>' +
    '<div class="kicker">Reporte general · ' + esc(rango) + "</div><h2>Asistencia del equipo</h2>" +
    '<div class="meta">' + rows.length + ' practicantes en el ranking</div></div></div><div class="rings">' +
    ring(avgAsist, "#2f9e62", "Promedio", true) +
    ring(avgPunt, "#2f5d8a", "Puntualidad", false) +
    "</div></article>" +
    '<div class="kpi-row">' +
    kpi("Promedio", fmtPct(avgAsist) + "%", "asistencia del equipo", "good") +
    kpi("Puntualidad", fmtPct(avgPunt) + "%", "promedio", "") +
    kpi("Puntuales", puntuales, "días del equipo", "good") +
    kpi("Faltas", faltas, "días del equipo", faltas > 0 ? "bad" : "") +
    kpi("En ranking", rows.length, "de " + (data.total_practicantes ?? rows.length), "") +
    "</div>" +
    '<div class="chart-grid">' +
    '<article class="card chart-card"><h3>Cómo está el equipo</h3><p class="lede">Practicantes según su porcentaje de asistencia.</p>' + donut(bands, "personas") + "</article>" +
    '<article class="card chart-card"><h3>Extremos</h3>' +
    '<div class="spot"><span class="kicker">Mayor asistencia</span><strong>' + esc(rows[0].nombre) + '</strong><span class="handle">' + esc(handleOf(rows[0].practicante_id)) + '</span><div class="meta">' + fmtPct(rows[0].pct_asistencia) + "%</div></div>" +
    '<div class="spot"><span class="kicker">Menor asistencia</span><strong>' + esc(rows[rows.length - 1].nombre) + '</strong><span class="handle">' + esc(handleOf(rows[rows.length - 1].practicante_id)) + '</span><div class="meta">' + fmtPct(rows[rows.length - 1].pct_asistencia) + "%</div></div>" +
    "</article>" +
    '<article class="card chart-card span-2"><h3>Asistencia por persona</h3><p class="lede">Nombre, usuario y porcentaje.</p>' + bars + "</article></div>" +
    '<article class="card chart-card"><h3>Detalle del reporte</h3><div class="table-wrap"><table class="report"><thead><tr>' +
    "<th>#</th><th>Nombre</th><th>Usuario</th><th>Asistencia</th><th>Puntualidad</th><th>Puntuales</th><th>Tardanzas</th><th>Faltas</th><th>Horas</th><th>Nota</th>" +
    "</tr></thead><tbody>" + table + "</tbody></table></div>" + aside + "</article>";
}
async function loadResumen() {
  const id = $("stats-user").value;
  if (!id) {
    $("stats-box").innerHTML = '<article class="card"><p class="lede">No hay practicantes para consultar.</p></article>';
    return;
  }
  setBusy(true);
  try {
    const json = await api("/api/v1/practicantes/" + id + "/resumen?periodo=" + encodeURIComponent($("stats-periodo").value));
    const data = json.data;
    const jornadas = await loadJornadas(id, data.desde, data.hasta);
    $("stats-box").innerHTML = renderResumen(data, jornadas);
  } catch (e) {
    flash(e.message);
    $("stats-box").innerHTML = '<div class="msg err">' + esc(e.message) + "</div>";
  } finally {
    setBusy(false);
  }
}
async function loadReporte() {
  setBusy(true);
  try {
    const periodo = encodeURIComponent($("stats-periodo").value);
    const json = await api("/api/v1/reportes/ranking?periodo=" + periodo + "&criterio=asistencia&limite=100");
    $("stats-box").innerHTML = renderReporte(json.data);
  } catch (e) {
    flash(e.message);
    $("stats-box").innerHTML = '<div class="msg err">' + esc(e.message) + "</div>";
  } finally {
    setBusy(false);
  }
}
async function loadJornadas(id, desde, hasta) {
  const rows = [];
  let page = 1;
  let total = 0;
  do {
    const json = await api(
      "/api/v1/jornadas?practicante_id=" + id +
      "&desde=" + encodeURIComponent(desde || "") +
      "&hasta=" + encodeURIComponent(hasta || "") +
      "&per_page=100&page=" + page
    );
    const batch = json.data || [];
    total = (json.meta && json.meta.total) || rows.length + batch.length;
    rows.push.apply(rows, batch);
    page += 1;
    if (!batch.length) break;
  } while (rows.length < total && page <= 15);
  const map = {};
  rows.forEach((row) => { map[String(row.fecha).slice(0, 10)] = row; });
  return map;
}
$("stats-box").addEventListener("click", async (ev) => {
  const target = ev.target.closest("button");
  if (!target) return;
  const id = $("stats-user").value;
  try {
    if (target.hasAttribute("data-save-estado")) {
      await api("/api/v1/practicantes/" + id + "/estado", {
        method: "PUT",
        body: JSON.stringify({ estado: $("edit-estado").value }),
      });
      flash("Estado guardado en la base.", true);
      await loadPeople();
      await loadResumen();
      return;
    }
    if (target.hasAttribute("data-save-horario")) {
      await api("/api/v1/practicantes/" + id + "/horario", {
        method: "PUT",
        body: JSON.stringify({ dias: daysFromCard($("edit-horario")) }),
      });
      flash("Horario guardado en la base.", true);
      await loadPeople();
      await loadResumen();
      return;
    }
    if (target.hasAttribute("data-save-day")) {
      const row = target.closest("[data-fecha]");
      const fecha = row.dataset.fecha;
      target.disabled = true;
      await api("/api/v1/practicantes/" + id + "/jornadas/" + fecha, {
        method: "PUT",
        body: JSON.stringify({
          entrada: row.querySelector("[data-entrada]").value || null,
          salida: row.querySelector("[data-salida]").value || null,
          estado_entrada: row.querySelector("[data-estado-entrada]").value || null,
          estado_jornada: row.querySelector("[data-estado-jornada]").value,
          horas: Number(row.querySelector("[data-horas]").value),
        }),
      });
      flash("Día " + formatFecha(fecha) + " guardado en la base.", true);
      await loadResumen();
    }
  } catch (e) {
    flash(e.message);
    target.disabled = false;
  }
});
$("stats-go").onclick = () => loadResumen();
$("stats-report").onclick = () => loadReporte();
async function extra(method) {
  const id = $("ex-user").value;
  const fecha = $("ex-fecha").value.trim();
  const body = {
    fecha: fecha || undefined,
    tiempo: $("ex-tiempo").value.trim() || undefined,
    motivo: $("ex-motivo").value.trim() || undefined,
  };
  const path = "/api/v1/practicantes/" + id + "/horas-extra" + (method === "DELETE" ? "?fecha=" + encodeURIComponent(fecha || "hoy") : "");
  const json = await api(path, { method: method, body: method === "DELETE" ? undefined : JSON.stringify(body) });
  $("ex-out").textContent = JSON.stringify(json.data, null, 2);
}
$("ex-add").onclick = () => extra("POST").catch((e) => flash(e.message));
$("ex-set").onclick = () => extra("PUT").catch((e) => flash(e.message));
$("ex-del").onclick = () => extra("DELETE").catch((e) => flash(e.message));
$("ex-list").onclick = async () => {
  try {
    const json = await api("/api/v1/practicantes/" + $("ex-user").value + "/horas-extra");
    $("ex-out").textContent = JSON.stringify(json.data, null, 2);
  } catch (e) { flash(e.message); }
};
$("a-save").onclick = async () => {
  try {
    const created = await api("/api/v1/practicantes", {
      method: "POST",
      body: JSON.stringify({
        nombres: $("a-nombres").value,
        apellidos: $("a-apellidos").value,
        discord_id: $("a-discord").value,
        area: $("a-area").value,
        carrera: $("a-carrera").value,
        ciclo: $("a-ciclo").value,
      }),
    });
    const copyId = $("a-copy").value;
    if (copyId) {
      const source = people.find((p) => String(p.id) === copyId);
      if (source) {
        await api("/api/v1/practicantes/" + created.data.id + "/horario", {
          method: "PUT",
          body: JSON.stringify({ dias: source.days }),
        });
      }
    }
    flash("Practicante guardado en el bot.", true);
    await loadPeople();
  } catch (e) { flash(e.message); }
};
</script>
</body>
</html>
`;
