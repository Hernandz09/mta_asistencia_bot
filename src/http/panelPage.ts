export const PANEL_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Panel MTA Asistencias</title>
  <style>
    :root {
      --bg: #f4f1ea; --paper: #fffcf7; --ink: #1c1915; --muted: #5c564c;
      --line: #e4ddd0; --accent: #2f5d8a; --accent-soft: #e8f0f7;
      --gold: #b8860b; --gold-bg: #fff6d8; --green: #2d6a4f; --green-bg: #d8f3dc;
      --red: #9b2226; --red-bg: #fde2e1; --sidebar: #161310; --radius: 14px;
      --shadow: 0 10px 30px rgba(28, 25, 21, .08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    .login { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 28px; width: min(420px, 100%); }
    .brand { color: var(--gold); font-size: .72rem; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 8px 0 4px; font-size: 1.4rem; }
    p.lede { color: var(--muted); margin: 0 0 18px; }
    label { display: block; font-size: .82rem; font-weight: 600; margin: 12px 0 6px; }
    input, select, textarea {
      width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px;
      font: inherit; background: #fff;
    }
    button {
      border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 700; cursor: pointer;
      background: var(--accent); color: #fff;
    }
    button.ghost { background: #eee8dc; color: var(--ink); }
    button.danger { background: var(--red); }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
    nav { background: var(--sidebar); color: #d8d0c4; padding: 22px 14px; }
    nav h2 { color: #fff; font-size: 1rem; margin: 8px 0 18px; }
    nav button { width: 100%; text-align: left; background: transparent; color: inherit; margin: 0 0 6px; }
    nav button.active, nav button:hover { background: #2a2520; color: #fff; }
    main { padding: 24px; }
    .toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .pill { display: inline-block; font-size: .72rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
    .ok { background: var(--green-bg); color: var(--green); }
    .warn { background: var(--gold-bg); color: #7c4a00; }
    table { width: 100%; border-collapse: collapse; background: var(--paper); border-radius: var(--radius); overflow: hidden; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: .88rem; }
    th { font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .daygrid { display: grid; grid-template-columns: repeat(7, minmax(110px, 1fr)); gap: 8px; }
    .day { border: 1px solid var(--line); border-radius: 10px; padding: 8px; background: #fff; }
    .day.off { background: #f3efe6; color: var(--muted); }
    .msg { margin: 10px 0; padding: 10px 12px; border-radius: 10px; }
    .msg.err { background: var(--red-bg); color: var(--red); }
    .msg.ok { background: var(--green-bg); color: var(--green); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 12px 0; }
    .stat { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
    .stat b { display: block; font-size: 1.3rem; }
    .detalle { white-space: pre-wrap; background: #0f1720; color: #e7eef5; padding: 14px; border-radius: 12px; font-size: .82rem; }
    @media (max-width: 900px) {
      .app { grid-template-columns: 1fr; }
      .daygrid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
<div id="login" class="login">
  <div class="card">
    <div class="brand">MTA Software</div>
    <h1>Panel de asistencias</h1>
    <p class="lede">Horarios, stats, horas extra y altas del bot.</p>
    <label for="clave">Clave</label>
    <input id="clave" type="password" autocomplete="current-password" />
    <div class="row" style="margin-top:16px">
      <button type="button" id="entrar">Entrar</button>
    </div>
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
    <button id="salir" class="ghost" style="margin-top:24px">Cerrar sesión</button>
  </nav>
  <main>
    <div id="flash"></div>
    <section data-panel="horarios">
      <div class="toolbar">
        <div>
          <h1 style="margin:0">Horarios</h1>
          <p class="lede">Edita días y horas. El sábado de Yasumy y Kiara queda 12:00–18:00.</p>
        </div>
        <button type="button" id="reload">Actualizar</button>
      </div>
      <div id="people"></div>
    </section>
    <section data-panel="stats" hidden>
      <h1>Stats</h1>
      <div class="row">
        <select id="stats-user"></select>
        <select id="stats-periodo">
          <option value="semana">Esta semana</option>
          <option value="mes" selected>Este mes</option>
          <option value="total">Histórico</option>
        </select>
        <button type="button" id="stats-go">Ver</button>
      </div>
      <div id="stats-box"></div>
    </section>
    <section data-panel="extras" hidden>
      <h1>Horas extra</h1>
      <p class="lede">No cambian puntual, tardanza ni falta. Tope 12 h por día.</p>
      <div class="row">
        <select id="ex-user"></select>
        <input id="ex-fecha" placeholder="fecha: hoy o 2026-09-14" />
        <input id="ex-tiempo" placeholder="tiempo: 2h o 2h 30m" />
        <input id="ex-motivo" placeholder="motivo" />
      </div>
      <div class="row" style="margin-top:10px">
        <button type="button" id="ex-add">Sumar</button>
        <button type="button" id="ex-set">Reemplazar</button>
        <button type="button" class="danger" id="ex-del">Quitar</button>
        <button type="button" class="ghost" id="ex-list">Ver extras</button>
      </div>
      <pre class="detalle" id="ex-out" style="margin-top:14px"></pre>
    </section>
    <section data-panel="alta" hidden>
      <h1>Agregar practicante</h1>
      <p class="lede">Crea o actualiza a alguien en el bot y, si quieres, copia un horario.</p>
      <label>Nombres</label><input id="a-nombres" />
      <label>Apellidos</label><input id="a-apellidos" />
      <label>Discord ID</label><input id="a-discord" placeholder="743334334613946380" />
      <label>Área</label>
      <select id="a-area">
        <option>software</option><option>video</option><option>admin</option>
        <option>marketing</option><option>fotografia</option><option>diseno</option>
      </select>
      <label>Carrera</label><input id="a-carrera" />
      <label>Ciclo</label><input id="a-ciclo" />
      <label>Copiar horario de</label>
      <select id="a-copy"><option value="">Sin copiar</option></select>
      <div class="row" style="margin-top:16px"><button type="button" id="a-save">Guardar en el bot</button></div>
    </section>
  </main>
</div>
<script>
const KEY = "mta_panel_key";
let people = [];
const $ = (id) => document.getElementById(id);
function flash(text, ok) {
  $("flash").innerHTML = text ? '<div class="msg ' + (ok ? "ok" : "err") + '">' + text + "</div>" : "";
}
async function api(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json", "x-api-key": sessionStorage.getItem(KEY) || "" }, opts.headers || {});
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || res.statusText);
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
function renderPeople() {
  $("people").innerHTML = people.map((p) => \`
    <article class="card" style="width:auto;margin:0 0 14px" data-id="\${p.id}">
      <div class="toolbar">
        <div>
          <strong>\${p.nombre}</strong>
          <span class="pill \${p.estado === "activo" ? "ok" : "warn"}">\${p.estado}</span>
          <div class="lede">Discord \${p.discordId || "sin ID"} · \${p.weeklyScheduledHours} h/sem · \${p.area}</div>
        </div>
        <button type="button" data-save="\${p.id}">Guardar horario</button>
      </div>
      <div class="daygrid">\${dayEditor(p)}</div>
    </article>\`).join("");
  fillSelects();
}
function fillSelects() {
  const opts = people.map((p) => '<option value="' + p.id + '">' + p.nombre + "</option>").join("");
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
  people = json.data;
  renderPeople();
}
$("entrar").onclick = async () => {
  try {
    sessionStorage.setItem(KEY, $("clave").value.trim());
    await api("/api/v1/panel/login", { method: "POST", body: JSON.stringify({ clave: sessionStorage.getItem(KEY) }) });
    $("login").hidden = true;
    $("app").hidden = false;
    await loadPeople();
  } catch (e) {
    $("login-msg").innerHTML = '<div class="msg err">' + e.message + "</div>";
    sessionStorage.removeItem(KEY);
  }
};
$("clave").addEventListener("keydown", (ev) => { if (ev.key === "Enter") $("entrar").click(); });
$("salir").onclick = () => { sessionStorage.removeItem(KEY); location.reload(); };
$("reload").onclick = () => loadPeople().catch((e) => flash(e.message));
document.querySelectorAll("nav [data-tab]").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll("nav [data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
  };
});
$("people").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-save]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  try {
    await api("/api/v1/practicantes/" + btn.dataset.save + "/horario", {
      method: "PUT",
      body: JSON.stringify({ dias: daysFromCard(card) }),
    });
    flash("Horario guardado.", true);
    await loadPeople();
  } catch (e) { flash(e.message); }
});
$("stats-go").onclick = async () => {
  try {
    const json = await api("/api/v1/practicantes/" + $("stats-user").value + "/resumen?periodo=" + $("stats-periodo").value);
    const d = json.data;
    $("stats-box").innerHTML = \`
      <div class="stats">
        <div class="stat"><span>Horas periodo</span><b>\${d.horas.acumuladas}</b></div>
        <div class="stat"><span>Extra</span><b>\${d.horas.extra}</b></div>
        <div class="stat"><span>Semana</span><b>\${d.horas.semana} / \${d.horas.meta_semana}</b></div>
        <div class="stat"><span>Nota</span><b>\${d.indicadores.nota ?? "—"}</b></div>
        <div class="stat"><span>Puntuales</span><b>\${d.asistencia.puntuales}</b></div>
        <div class="stat"><span>Tardanzas</span><b>\${d.asistencia.tardanzas}</b></div>
        <div class="stat"><span>Faltas</span><b>\${d.asistencia.faltas}</b></div>
      </div>
      <pre class="detalle">\${(d.detalle || []).map((x) => x.label).join("\\n") || "Sin detalle"}</pre>\`;
  } catch (e) { flash(e.message); }
};
async function extra(method, extraBody) {
  const id = $("ex-user").value;
  const fecha = $("ex-fecha").value.trim();
  const body = Object.assign({ fecha: fecha || undefined, tiempo: $("ex-tiempo").value.trim() || undefined, motivo: $("ex-motivo").value.trim() || undefined }, extraBody || {});
  const path = "/api/v1/practicantes/" + id + "/horas-extra" + (method === "DELETE" ? "?fecha=" + encodeURIComponent(fecha || "hoy") : "");
  const json = await api(path, { method, body: method === "DELETE" ? undefined : JSON.stringify(body) });
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
if (sessionStorage.getItem(KEY)) $("entrar").click();
</script>
</body>
</html>
`;
