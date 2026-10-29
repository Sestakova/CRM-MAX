// CRM HERMES · interfaz
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.bloqueado) { if (typeof bloquear === 'function' && YO) bloquear('expirada'); throw new Error('Sesión bloqueada'); }
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j;
}
const GET = (u) => api('GET', u), POST = (u, b) => api('POST', u, b || {}), PUT = (u, b) => api('PUT', u, b), PATCH = (u, b) => api('PATCH', u, b), DEL = (u) => api('DELETE', u);
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('560')) d = '56' + d.slice(3);
  if (d.length === 9 && d[0] === '9') d = '56' + d;
  if (d.length === 8) d = '569' + d;
  return /^569\d{8}$/.test(d) ? d : null;
}
const esLid = (d) => /^\d{14,16}$/.test(String(d || '')) && !/^569\d{8}$/.test(String(d));
const fmtTel = (d) => (d && /^569\d{8}$/.test(d) ? `+56 9 ${d.slice(3, 7)} ${d.slice(7)}` : esLid(d) ? 'Número oculto por WhatsApp' : d ? '+' + d : '');
const money = (v) => { const n = parseInt(String(v ?? '').replace(/\D/g, '')); return isNaN(n) ? String(v ?? '') : '$' + n.toLocaleString('es-CL'); };
const ini = (n, a) => ((n || '?')[0] + ((a || '')[0] || '')).toUpperCase();
const nombreDe = (c) => `${c.nombre || ''} ${c.apellido || ''}`.trim() || (esLid(c.telefono) ? 'Contacto sin número visible' : fmtTel(c.telefono));
function hace(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'recién'; if (s < 3600) return Math.round(s / 60) + ' min';
  if (s < 86400) return Math.round(s / 3600) + ' h'; return Math.round(s / 86400) + ' d';
}
function hora(iso) {
  const d = new Date(iso), h = new Date();
  const mismo = d.toDateString() === h.toDateString();
  return mismo ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}
const fechaLarga = (iso) => new Date(iso).toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
// "Hoy 10:00", "Mañana 16:00" o "lun 19 · 10:00"
function cuando(iso) {
  const d = new Date(iso), h = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0);
  const n = Math.round((b - a) / 86400000);
  return n === 0 ? 'Hoy ' + h : n === 1 ? 'Mañana ' + h : n === -1 ? 'Ayer ' + h : d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }) + ' · ' + h;
}
function toast(msg, ms = 3500) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms); }
function modal(html, onReady, alCerrar) {
  if (modal._alCerrar) { const f = modal._alCerrar; modal._alCerrar = null; f(); }
  $('modalBox').className = 'box glass'; $('modalBox').innerHTML = html; $('modal').hidden = false;
  modal._alCerrar = alCerrar || null;
  const close = () => { $('modal').hidden = true; $('modalBox').innerHTML = ''; if (modal._alCerrar) { const f = modal._alCerrar; modal._alCerrar = null; f(); } };
  modal._cerrar = close;
  $('modalBox').querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  const f = $('modalBox').querySelector('input,select,textarea,button'); if (f) f.focus();
  if (onReady) onReady($('modalBox'), close);
  return close;
}
// Pregunta con la estética del CRM (en vez de la ventana gris de Windows). Va encima de cualquier otro cuadro abierto
function confirmar(texto, { titulo = '¿Seguro?', si = 'Aceptar', no = 'Cancelar', peligro = false } = {}) {
  return new Promise((listo) => {
    const el = $('confirmar');
    el.innerHTML = `<div class="cbox" role="alertdialog" aria-modal="true" aria-labelledby="cfT" aria-describedby="cfX"><span class="eyebrow">CRM HERMES</span><h3 id="cfT">${esc(titulo)}</h3>${texto ? `<p id="cfX">${esc(texto)}</p>` : ''}<div class="cbtn"><button class="btn" id="cfNo">${esc(no)}</button><button class="btn ${peligro ? 'peligro' : 'pri'}" id="cfSi">${esc(si)}</button></div></div>`;
    el.hidden = false; const tapaba = document.body.classList.contains('tapado'); document.body.classList.add('tapado'); syncVista(true);
    const fin = (v) => { document.removeEventListener('keydown', tecla, true); el.hidden = true; el.innerHTML = ''; if (!tapaba) { document.body.classList.remove('tapado'); syncVista(true); } listo(v); };
    const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(false); } };
    document.addEventListener('keydown', tecla, true);
    $('cfSi').onclick = () => fin(true); $('cfNo').onclick = () => fin(false);
    el.onclick = (e) => { if (e.target === el) fin(false); };
    (peligro ? $('cfNo') : $('cfSi')).focus();   // en lo que borra o cancela, Enter no confirma por error
  });
}
// Clic fuera o Escape cierran el cuadro como si apretaras Cancelar
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && modal._cerrar) modal._cerrar(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden && modal._cerrar) { e.preventDefault(); modal._cerrar(); } });
function fill(tpl, c = {}) {
  return String(tpl || '').replace(/\{nombre\}/gi, c.nombre || '').replace(/\{apellido\}/gi, c.apellido || '').replace(/\{cargas\}/gi, c.cargas || '')
    .replace(/\{sueldo\}|\{renta\}/gi, c.renta ? money(c.renta) : '').replace(/\{edad\}/gi, c.edadActual || c.edad || '').replace(/\{isapre\}/gi, c.isapre || 'tu Isapre')
    .replace(/[ \t]+([,.!?])/g, '$1').replace(/ {2,}/g, ' ').trim();
}
const ETAPAS = ['Nuevo', 'Contactado', 'Respondió', 'Cotización enviada', 'Firma/documentos', 'Ingresado', 'Perdido'];
const COL = ['#5E7A6B', '#3F6E8C', '#7A5C8E', '#B4472C', '#9C4A6B', '#2F6B4A', '#8A2E25'];
const CALIF = ['Calificado', 'Posible prospecto', 'No calificado'];
const MOTIVOS = ['No contesta', 'No calificado', 'Precio', 'Se quedó en su Isapre'];
// Etiquetas propias: chips de colores (la clave et1…et6 elige el color en cada tema)
const ETQ_COLORES = ['et1', 'et2', 'et3', 'et4', 'et5', 'et6'];
const chipEtq = (e, quitar) => `<span class="etqc c-${/^et[1-6]$/.test(e.color) ? e.color : 'et1'}">${esc(e.nombre)}${quitar ? `<button type="button" data-qetq="${e.id}" aria-label="Quitar ${esc(e.nombre)}">×</button>` : ''}</span>`;
let ETQS = [];
async function cargarEtiquetas() {
  ETQS = (await GET('/api/etiquetas').catch(() => ({ etiquetas: [] }))).etiquetas;
  for (const id of ['pEtq', 'sEtq']) { const s = $(id); if (!s) continue; const v = s.value; s.innerHTML = '<option value="">Todas</option>' + ETQS.map((e) => `<option value="${e.id}" ${String(e.id) === v ? 'selected' : ''}>${esc(e.nombre)}</option>`).join(''); }
  return ETQS;
}
// Poner o sacar etiquetas a un contacto, crear nuevas y borrar las que ya no se usan
async function etiquetaModal(tel, nombre, listo) {
  const pintar = async (box) => {
    await cargarEtiquetas();
    const mias = new Set((await GET('/api/contactos?limite=1&q=' + tel).catch(() => ({ contactos: [] }))).contactos.filter((c) => c.telefono === tel).flatMap((c) => (c.etiquetas || []).map((e) => e.id)));
    box.querySelector('#eqLista').innerHTML = ETQS.length ? ETQS.map((e) => `<span class="eqit"><button type="button" class="chip ${mias.has(e.id) ? 'on' : ''}" data-eqt="${e.id}" aria-pressed="${mias.has(e.id)}">${chipEtq(e)}</button><button type="button" class="lnk small" data-eqb="${e.id}" title="Borrar esta etiqueta de todos los contactos">borrar</button></span>`).join('') : '<span class="small muted">Todavía no tienes etiquetas. Crea la primera abajo.</span>';
    box.querySelectorAll('[data-eqt]').forEach((b) => (b.onclick = async () => { const id = b.dataset.eqt; await (mias.has(+id) ? DEL(`/api/contactos/${tel}/etiquetas/${id}`) : POST(`/api/contactos/${tel}/etiquetas`, { id: +id })).catch((e) => toast(e.message)); pintar(box); }));
    box.querySelectorAll('[data-eqb]').forEach((b) => (b.onclick = async () => { const e = ETQS.find((x) => x.id === +b.dataset.eqb); if (!(await confirmar(`Se quita de ${e.usos} contacto${e.usos === 1 ? '' : 's'}.`, { titulo: `¿Borrar la etiqueta «${e.nombre}»?`, si: 'Borrar', peligro: true }))) return; await DEL('/api/etiquetas/' + e.id).catch(() => {}); pintar(box); }));
  };
  modal(`<span class="eyebrow">Etiquetas</span><h3>${esc(nombre)}</h3><span class="small muted">Toca una etiqueta para ponerla o sacarla.</span><div class="chips" id="eqLista"></div>
    <div class="glass card" style="padding:14px;gap:10px"><b>Nueva etiqueta</b><input id="eqNom" maxlength="40" placeholder="Ej: 2 cargas, embarazo, Fonasa → Isapre"><div class="chips" id="eqCol">${ETQ_COLORES.map((c, i) => `<button type="button" class="eqcol c-${c} ${i ? '' : 'on'}" data-c="${c}" aria-label="Color ${i + 1}"></button>`).join('')}</div><div style="display:flex;justify-content:flex-end"><button class="btn" id="eqCrear">Crear y poner</button></div></div>
    <div style="display:flex;justify-content:flex-end"><button class="btn pri" data-close>Listo</button></div>`, (box) => {
    let color = 'et1';
    box.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { color = b.dataset.c; box.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); }));
    box.querySelector('#eqCrear').onclick = async () => {
      try { const r = await POST('/api/etiquetas', { nombre: box.querySelector('#eqNom').value, color }); await POST(`/api/contactos/${tel}/etiquetas`, { id: r.id }); box.querySelector('#eqNom').value = ''; pintar(box); } catch (e) { toast(e.message); }
    };
    box.querySelector('#eqNom').onkeydown = (e) => { if (e.key === 'Enter') box.querySelector('#eqCrear').click(); };
    pintar(box);
  }, () => { loadPipeline.sig = ''; if (listo) listo(); });
}
// 7% de salud con la UF del día 5 y el tope imponible (Configuración)
const fechaUF = (f) => { const [y, m, d] = String(f).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }); };
function sieteDe(renta) {
  const v = EST && EST.uf && EST.uf.vigente ? EST.uf.vigente.valor : 0, tope = CFG && CFG.siete && +CFG.siete.topeUF > 0 ? +CFG.siete.topeUF : 90;
  const r = parseInt(String(renta || '').replace(/\D/g, ''), 10);
  if (!(r > 0) || !(v > 0)) return null;
  const base = Math.min(r, tope * v), pesos = Math.round(base * 0.07);
  return { pesos, uf: Math.round((pesos / v) * 100) / 100, conTope: r > tope * v, tope };
}
const sieteHTML = (renta) => { const x = sieteDe(renta); if (!x) return ''; return `<div class="siete"><span class="small muted">Su 7%${x.conTope ? ` <span class="tope">tope ${x.tope} UF</span>` : ''}</span><b>${money(x.pesos)} <span class="muted">· ${x.uf.toLocaleString('es-CL')} UF</span></b>${x.conTope ? `<span class="small muted">Su renta pasa el tope: se calcula sobre ${x.tope} UF.</span>` : ''}</div>`; };
const califPill = (c) => c === 'Calificado' ? 'p-info' : c === 'Posible prospecto' ? 'p-warn' : c === 'No calificado' ? 'p-mut' : 'p-mut';
let CFG = null, EST = null, YO = null;
const UI = {};
const esAdmin = () => !!YO;
const puedo = () => !!YO;

// ---------------- Secciones e Inicio con hilos ----------------
const SECS = [
  { id: 'inicio', label: 'Inicio', d: 'M3 11l9-7 9 7v9H15v-6H9v6H3z', desc: 'Tu centro: todo de un vistazo · Atajo 1' },
  { id: 'chats', label: 'Chats', d: 'M4 5h16v11H9l-5 4z', desc: 'Tu WhatsApp con la ficha de cada lead al lado · Atajo 2' },
  { id: 'pipeline', label: 'Pipeline', d: 'M4 4h4v16H4z M10 4h4v11h-4z M16 4h4v7h-4z', desc: 'Arrastra cada lead a su etapa, de Nuevo a Ingresado · Atajo 3' },
  { id: 'envios', label: 'Envíos', d: 'M3 11l18-7-7 18-3-8z', desc: 'Manda mensajes a muchos contactos a la vez · Atajo 4' },
  { id: 'leads', label: 'Leads de Meta', d: 'M4 4h16v11h-4l-2 3h-4l-2-3H4z', desc: 'Los que llenan tus formularios de Facebook e Instagram · Atajo 5' },
  { id: 'auto', label: 'Automáticos', d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 7v5l3 2', desc: 'Mensajes agendados, seguimientos y respuesta fuera de horario · Atajo 6' },
  { id: 'cotizador', label: 'Cotizador', d: 'M6 3h12v18H6z M9 7h6 M9 11h1 M12 11h1 M15 11h0 M9 15h1 M12 15h1 M15 15h0 M9 18h6', desc: 'Cotiza en miscotizadores sin salir del CRM · Atajo 7' }
];
const VIEWS = [
  { id: 'hoy', label: 'Tu día', sub: () => new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) },
  { id: 'leads', label: 'Leads de Meta', sub: () => 'Los formularios de Facebook e Instagram llegan solos' },
  { id: 'chats', label: 'Chats', sub: () => 'WhatsApp con la ficha de cada lead al lado' },
  { id: 'pipeline', label: 'Pipeline', sub: () => 'Arrastra cada lead a su etapa' },
  { id: 'envios', label: 'Envíos', sub: () => 'Agrega contactos a mano o importa un Excel · envía ahora o programa' },
  { id: 'auto', label: 'Automáticos', sub: () => 'Mensajes agendados, seguimientos y respuesta fuera de horario' },
  { id: 'cotizador', label: 'Cotizador', sub: () => 'Tu cuenta de miscotizadores dentro del CRM' },
  { id: 'metricas', label: 'Métricas', sub: () => 'Qué mensajes funcionan, a qué hora te responden y dónde se pierden los leads' },
  { id: 'config', label: 'Configuración', sub: () => 'Conexión, reglas de envío, avisos, ayudas y seguridad' }
];
let current = 'inicio';
const SAT_DE = { hoy: 'inicio', chats: 'chats', pipeline: 'pipeline', envios: 'envios', leads: 'leads', auto: 'auto', cotizador: 'cotizador' };
function renderSats() {
  $('sats').innerHTML = SECS.map((x) => `<button type="button" class="sat" data-sec="${x.id}" data-go="${x.id === 'inicio' ? 'inicio' : x.id}" aria-label="${x.label}">
    <span class="desc">${x.desc}</span>
    <span class="bola"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${x.d}"/></svg><span class="bdg" hidden></span></span>
    <b>${x.label}</b><span class="dato"></span></button>`).join('');
}
renderSats();
// Ubica los círculos: alrededor del centro (Inicio) o en una barra abajo (las demás secciones)
function layout() {
  const st = $('stage'); const W = st.clientWidth, H = st.clientHeight; if (!W || !H) return;
  const hub = document.body.classList.contains('hub');
  const sats = [...$('sats').children];
  const activo = SAT_DE[current];
  if (hub) {
    const cx = W / 2, cy = H / 2 + 8;
    const cs = Math.round(Math.max(150, Math.min(300, H * 0.30, W * 0.22)));
    const ss = Math.round(Math.max(64, Math.min(128, H * 0.13)));
    // Los círculos, repartidos parejo alrededor del centro. Con un número par se giran medio paso para que ninguno quede justo abajo
    const n = sats.length - 1;
    const angs = Array.from({ length: n }, (_, i) => -90 + (n % 2 ? 0 : 180 / n) + (360 / n) * i);
    const bajo = Math.max(...angs.map((a) => Math.sin(a * Math.PI / 180)));   // cuánto baja el círculo más bajo
    const rx = Math.min(W * 0.32, 540), ry = Math.min(H * 0.36, 340, (H - cy - ss / 2 - 60) / bajo);   // 60: nombre y dato bajo el círculo
    const pts = angs.map((a) => [cx + rx * Math.cos(a * Math.PI / 180), cy + ry * Math.sin(a * Math.PI / 180)]);
    const c = $('centro'); Object.assign(c.style, { left: cx - cs / 2 + 'px', top: cy - cs / 2 + 'px', width: cs + 'px', height: cs + 'px' });
    sats.forEach((el, i) => {
      el.classList.remove('on'); el.classList.toggle('oculto', i === 0);
      const [x, y] = i === 0 ? [cx, cy] : pts[i - 1];
      el.style.left = x + 'px'; el.style.top = y - ss / 2 + 'px';
      const b = el.querySelector('.bola'); b.style.width = b.style.height = ss + 'px';
      const ic = el.querySelector('svg'); ic.setAttribute('width', Math.round(ss * 0.32)); ic.setAttribute('height', Math.round(ss * 0.32));
      el.querySelector('b').style.fontSize = '16px';
      el.removeAttribute('title');
    });
    const p = (q) => q.map((v) => Math.round(v)).join(' ');
    $('hilos').innerHTML = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" style="stroke:var(--hilo1)" stroke-width="1.5" stroke-dasharray="4 8"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.6}" ry="${ry * 0.6}" fill="none" style="stroke:var(--hilo2)" stroke-width="1.5"/>
      ${pts.map(([x, y]) => `<path d="M${p([cx, cy])} Q ${p([(cx + x) / 2 + (y - cy) * 0.15, (cy + y) / 2 - (x - cx) * 0.15])} ${p([x, y])}" fill="none" style="stroke:var(--terra)" stroke-opacity=".5" stroke-width="2"/>`).join('')}
      <path d="M${pts.map(([x, y]) => p([x, y])).join(' L ')} Z" fill="none" style="stroke:var(--green)" stroke-opacity=".14" stroke-width="1.5" stroke-linejoin="round"/>`;
    $('metBtn').style.top = '10px';
  } else {
    const comp = H < 640; document.body.classList.toggle('compacto', comp);
    $('caja').style.bottom = (comp ? 100 : 132) + 'px';
    const n = sats.length; const esp = Math.min(190, Math.max(92, (W - 320) / n)); const x0 = W / 2 - (esp * (n - 1)) / 2; const y = H - (comp ? 56 : 72);
    sats.forEach((el, i) => {
      const on = el.dataset.sec === activo; const t = comp ? (on ? 56 : 44) : on ? 70 : 54;
      el.classList.remove('oculto'); el.classList.toggle('on', on);
      el.style.left = x0 + i * esp + 'px'; el.style.top = y - t / 2 + 'px';
      const b = el.querySelector('.bola'); b.style.width = b.style.height = t + 'px';
      const ic = el.querySelector('svg'); ic.setAttribute('width', on ? 26 : 22); ic.setAttribute('height', on ? 26 : 22);
      el.querySelector('b').style.fontSize = on ? '14px' : '13px';
      if (UI.desc !== false) el.title = SECS[i].desc; else el.removeAttribute('title');
    });
    $('metBtn').style.top = y - (comp ? 28 : 34) + 'px';
  }
  $('metBtn').classList.toggle('on', current === 'metricas');
  $('bConfig').classList.toggle('on', current === 'config');
}
window.addEventListener('resize', () => layout());
document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { e.preventDefault(); go(b.dataset.go); } });
function go(id) {
  if (!YO) return;
  if (id === 'inicio' && current === 'inicio') return actualizarHub();
  document.querySelectorAll('.emojipop').forEach((x) => x.remove());
  cerrarPops();
  current = id;
  const hub = id === 'inicio';
  document.body.classList.toggle('hub', hub); document.body.classList.toggle('barra', !hub);
  document.body.classList.toggle('en-chats', id === 'chats');
  if (id === 'leads') leadsVistos = Date.now();
  layout();
  if (hub) { $('consejo').hidden = !mostrarConsejo; actualizarHub(); return; }
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === 'v-' + id));
  const v = VIEWS.find((x) => x.id === id);
  $('title').textContent = v.label; $('subtitle').textContent = v.sub();
  $('headActions').innerHTML = '';
  $('caja').scrollTop = 0;
  ({ hoy: loadHoy, leads: loadLeads, chats: loadChats, pipeline: loadPipeline, envios: loadEnvios, auto: loadAuto, cotizador: loadCotizador, metricas: loadMetricas, config: loadConfig }[id] || (() => {}))();
}
// Datos de los círculos del Inicio
let HUB = null, leadsVistos = 0, mostrarConsejo = false;
async function actualizarHub() {
  const d = await GET('/api/inicio').catch(() => null); if (!d) return; HUB = d;
  const h = new Date().getHours();
  $('saludo').textContent = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const pend = (EST?.avisos?.campana || 0) + d.sin24.length + d.leads.sinProx;
  $('pendHoy').textContent = pend ? `${pend} cosa${pend === 1 ? '' : 's'} para hoy` : 'Todo al día · ver tu día';
  pintarDatos();
}
function pintarDatos() {
  const d = HUB, q = EST?.cola;
  const datos = {
    inicio: 'Tu resumen',
    chats: EST?.noLeidos ? `${EST.noLeidos} sin leer` : d && d.sin24.length ? `${d.sin24.length} esperan hace +24 h` : 'Al día',
    pipeline: d ? (d.leads.estancados ? `${d.leads.estancados} estancado${d.leads.estancados === 1 ? '' : 's'}` : d.leads.sinProx ? `${d.leads.sinProx} sin próxima acción` : 'Todo en movimiento') : '',
    envios: q && q.pendientes ? `${q.pendientes} en cola` : d && d.programados[0] ? 'Programado ' + hora(d.programados[0].fecha) : q ? `Hoy ${q.enviadosHoy} de ${q.limite}` : '',
    leads: d ? (d.leadsMetaHoy ? `${d.leadsMetaHoy} nuevo${d.leadsMetaHoy === 1 ? '' : 's'} hoy` : 'Sin leads nuevos hoy') : '',
    auto: d ? (d.llamadasHoy.length ? `${d.llamadasHoy.length} llamada${d.llamadasHoy.length === 1 ? '' : 's'} hoy` : d.agendadosHoy ? `${d.agendadosHoy} agendado${d.agendadosHoy === 1 ? '' : 's'} hoy` : `${d.enSecuencia} en seguimiento`) : ''
  };
  const av = EST?.avisos || {};
  const bdg = { chats: [EST?.noLeidos || 0, 'verde'], leads: [leadsVistos ? 0 : av.leadsHoy || 0, 'naranjo'], auto: [av.agendadosHoy || 0, 'naranjo'] };
  for (const el of $('sats').children) {
    const id = el.dataset.sec; el.querySelector('.dato').textContent = datos[id] || '';
    const b = el.querySelector('.bdg'); const [n, c] = bdg[id] || [0, ''];
    b.hidden = !n; b.className = 'bdg ' + c; b.textContent = n > 99 ? '99+' : n;
    if (n) b.setAttribute('aria-label', id === 'chats' ? `${n} chats sin leer` : id === 'leads' ? `${n} leads nuevos` : `${n} agendados hoy`);
  }
}
async function guardarUI(cambios) { Object.assign(UI, cambios); await PUT('/api/config/ui', { valor: { ...UI } }).catch(() => {}); }
function aplicarUI() { document.body.classList.toggle('sin-desc', UI.desc === false); layout(); }
$('consejoOk').onclick = () => { $('consejo').hidden = true; mostrarConsejo = false; guardarUI({ consejosVistos: 99 }); };

// ---------------- Estado en vivo ----------------
const WA_TXT = { iniciando: 'Iniciando WhatsApp…', qr: 'Falta escanear el QR', autenticando: 'Conectando…', listo: 'WhatsApp conectado', desconectado: 'WhatsApp desconectado', error: 'Error al conectar', descargando: 'Preparando componentes…' };
async function poll() {
  try {
    const s = await GET('/api/estado'); EST = s;
    const w = s.wa;
    if (s.ultimaRespuesta && s.ultimaRespuesta > ultimaRespuesta) { ultimaRespuesta = s.ultimaRespuesta; avisoBloqueo = false; }
    $('waDot').className = 'dot' + (w.state === 'listo' ? ' ok' : ['error', 'desconectado', 'qr'].includes(w.state) ? ' bad' : '');
    $('waTxt').textContent = WA_TXT[w.state] || w.state;
    $('hoyTxt').textContent = `· ${s.cola.enviadosHoy}/${s.cola.limite} hoy`;
    $('bEstado').title = (w.me ? fmtTel(w.me) + ' · ' : '') + `Enviados hoy: ${s.cola.enviadosHoy} de ${s.cola.limite}`;
    if (s.uf && s.uf.vigente) {
      $('ufHoy').textContent = '$' + s.uf.vigente.valor.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      $('ufCard').title = 'UF del ' + fechaUF(s.uf.vigente.fecha) + ' · se actualiza el 5 de cada mes';
    } else { $('ufHoy').textContent = 'sin conexión'; $('ufCard').title = 'Se actualiza al tener internet'; }
    const showWa = w.state !== 'listo' && !['config', 'chats'].includes(current);
    $('waBanner').hidden = !showWa;
    $('waBannerTxt').textContent = w.state === 'qr' ? 'WhatsApp no está vinculado. Escanea el código QR para empezar.' : w.state === 'error' ? (w.err || 'No se pudo abrir WhatsApp.') + ' Se reintenta solo.' : (WA_TXT[w.state] || '') + ' Los envíos esperan hasta que conecte.';
    pintarDatos();
    avisoDocumento(s.documento);
    pintarUpBarra(s.actualizacion);
    if (current === 'envios') { renderCola(); renderGrupos(); if (verTanda.refrescar) verTanda.refrescar(); }
    if (current === 'auto') renderColaAuto();
    if (current === 'config') renderWaCard();
    if (s.version) $('barraTitulo').textContent = 'CRM HERMES · versión ' + s.version;
    if (!poll.novedades && s.version) { poll.novedades = true; novedades(s.version); }
  } catch { $('waTxt').textContent = 'Reinicia el programa'; $('waDot').className = 'dot bad'; }
}
const NOVEDADES = {
  '4.3.1': ['Envíos y Automáticos con colas separadas: «Pausar» en Envíos ya no detiene tus seguimientos; los seguimientos y el Mensaje 1 de Meta se pausan y cancelan en Automáticos («En cola ahora»)', 'Los mensajes agendados salen a su hora aunque los envíos estén en pausa', 'Al enviar, avisa y desmarca a quien ya espera en la cola (no le llegan dos mensajes)', 'Buscar encuentra nombres con tilde o ñ aunque los escribas sin ella', 'La cola dice «Sin envíos» cuando no queda nada', 'Pastillas de calificación y motivo de pérdida que se leen bien, «1 carga», barra de la Pipeline ordenada y los días que faltan para el aniversario'],
  '4.3.0': ['Temas de color: Claro, Invertido, Oscuro y Automático (oscuro de noche), con un botón arriba', 'Actualizaciones livianas: bajan en segundos, con una barrita de avance y el botón «Reiniciar y actualizar»', 'Los documentos que descargas de un chat quedan en la carpeta de ese cliente, en «Clientes CRM HERMES» del escritorio', 'Felicitaciones con confeti al cerrar una venta y anualidad de cada cliente con aviso un mes antes del aniversario', 'El 7% de salud de cada lead en su ficha, con la UF del día 5 y tope de 90 UF', 'Etiquetas propias y filtros guardados en la Pipeline', 'Sin la campanita y sin la línea entre los círculos de la barra'],
  '4.2.1': ['Arreglo: el Cotizador ya deja iniciar sesión y la recuerda, igual que WhatsApp', 'Tu cotizador publicado («Ver mi sitio») se abre dentro del CRM, sin saltar al navegador'],
  '4.2.0': ['Nueva sección Cotizador: tu cuenta de miscotizadores dentro del CRM (atajo 7)'],
  '4.1.0': ['Cada envío masivo es un grupo dentro de la Cola de envío: tócalo para ver a quién le falta, a quién le llegó y a quién sacaste', 'Ordena a las personas de un grupo arrastrándolas desde ≡, o sácalas con «No enviar»', 'Al lanzar otro envío eliges «Después» (espera a los que están saliendo) o «Corriendo» (sale a la vez, con su propio ritmo)', 'Antes de enviar ves la lista completa y puedes desmarcar a quien no corresponda', 'Agendar llamada: eliges en cada llamada si va la confirmación, el recordatorio y el aviso de Windows, y puedes editar los textos ahí mismo', 'Automáticos más simple: se quitan Llamadas, Postventa y referidos, Resumen diario y Estado de la secuencia', 'Barra superior verde, con el color del CRM'],
  '4.0.1': ['Envíos: nuevo botón "Elegir de WhatsApp" para elegir uno o varios contactos de tus chats recientes o de los contactos guardados en tu celular', 'Busca por nombre o número, marca varios a la vez o todos los de la lista', 'Los que pidieron BAJA no se pueden elegir y los que ya están en la lista aparecen marcados'],
  '4.0.0': ['CRM MAX ahora se llama CRM HERMES: logo, colores y diseño nuevos', 'Inicio con hilos: la sección que usas pasa al centro y los círculos bajan a una barra', 'Agendar llamada en 2 clics: confirmación y recordatorio al cliente, y aviso para ti', 'Próxima acción en cada lead y aviso de los que conversan sin una', 'Leads estancados en naranjo cuando llevan días en la misma etapa', 'Postventa automática al pasar a Ingresado: bienvenida, control al mes y petición de referidos', 'Resumen diario a tu WhatsApp cada mañana', 'Métricas: mejor hora para enviar y referidos', 'Contactos repetidos: se detectan y se unen', 'Buscar con Ctrl K, campanita de recordatorios, atajos 1 a 6 y Esc', 'Las próximas actualizaciones se instalan solas, sin ventanas'],
  '3.7.0': ['Más rápido: WhatsApp empieza a cargar apenas abres el programa y la sincronización solo trae lo nuevo', 'Si WhatsApp se desvincula, te avisa con una notificación de Windows para escanear el QR', 'Envíos más seguros: no se repite un mensaje si WhatsApp tarda en confirmar o si cierras el programa', 'La respuesta fuera de horario sale una sola vez aunque te escriban varios mensajes seguidos', 'Los mensajes agendados salen a su hora sin esperar la pausa de los masivos; los leads de Meta pasan antes que los masivos', 'Con la secuencia en pausa, los seguimientos que ya estaban en cola también esperan', 'El registro técnico se abre dentro del programa', 'Varias correcciones de seguridad, fechas y pantallas'],
  '3.6.0': ['Envíos: escribe hasta 5 versiones del mensaje y a cada persona le llega una al azar', 'Envíos: adjunta una foto o un video (el texto va como descripción)', 'Envíos: segundo mensaje que llega unos segundos después del primero', 'Emojis en Envíos y en Mensajes agendados', 'Nuevo en Automáticos: Mensajes agendados para avisar a uno o varios clientes en la fecha y hora que elijas', 'Arreglo: WhatsApp ya no se queda sin conectar al abrir el programa'],
  '3.5.0': ['WhatsApp Web ahora está dentro del CRM, en Chats: todo tu historial, fotos y audios como en WhatsApp', 'Un solo QR para todo: la parte automática usa esa misma conexión', 'Ficha del lead al lado del chat abierto, con botón "Crear lead" si aún no existe', 'Franja con el color de la etapa arriba del chat', 'Recordatorios por lead con aviso de Windows', 'En Inicio: recordatorios y chats sin respuesta hace más de 24 horas', 'Botón "Abrir en WhatsApp" en Pipeline, Leads e Inicio', 'Se quitaron las respuestas rápidas (WhatsApp ya las trae)'],
  '3.4.1': ['Arreglo: vuelven a cargar los chats y los mensajes anteriores (WhatsApp Web cambió algo por dentro)', 'WhatsApp abre más rápido: usa primero el navegador que funcionó la última vez'],
  '3.4.0': ['Los chats muestran fotos, stickers y audios; videos y documentos se descargan con un clic', 'Envía imágenes y PDF desde el chat con el clip o pegando con Ctrl+V', 'Los mensajes anteriores se cargan solos al subir en el chat', 'WhatsApp se reconecta solo si se cae', 'Chat más fácil de leer, con nombre completo y teléfono arriba', 'Un solo PIN para el programa; se bloquea tras 30 minutos sin responder chats', 'Cambiar PIN, código de recuperación y respaldo ahora están en Configuración'],
  '3.3.0': ['Ingreso con PIN de 4 dígitos en una pantalla de cristal', 'Usuarios administrador y asesor, cada uno con su PIN', 'Nueva sección Administración: usuarios, permisos, seguridad, respaldo y registro de actividad', 'Bloqueo automático cuando no usas el programa (botón de candado para bloquear al tiro)'],
  '3.2.1': ['Actualizaciones automáticas activadas: las próximas versiones se descargan solas y te avisan para reiniciar'],
  '3.2.0': ['El programa ahora se llama CRM MAX, con logo nuevo en la ventana, el escritorio y junto al reloj', 'Tus datos, chats, sesión de WhatsApp y conexión con Meta se mantienen igual'],
  '3.1.0': ['Nueva pestaña Leads de Meta: los formularios de Facebook e Instagram llegan solos, con primer mensaje automático y aviso de Windows', 'Nueva pestaña Métricas: respuesta, lectura, bajas, conversión por etapa, motivos de pérdida y qué mensaje y formulario funcionan mejor', 'La renta de los formularios con rangos (ej: $1.200.000 - $1.800.000) se guarda con el valor inicial'],
  '3.0.5': ['Nuevo botón "Cargar mensajes anteriores" arriba de cada chat', 'Los chats ahora traen su historial aunque WhatsApp use número oculto'],
  '3.0.4': ['Arreglado: en Chats los mensajes enviados ya no aparecen repetidos', 'Se limpian solos los repetidos que ya se veían'],
  '3.0.3': ['Arreglado: los mensajes ya no se envían dos veces', 'Ya no aparece el aviso de "WhatsApp no confirmó" cuando el mensaje sí salió'],
  '3.0.2': ['Los chats con número oculto por WhatsApp ahora se unen solos a la ficha correcta', 'Se reparan los chats que habían quedado con un número raro', 'Puedes responder aunque WhatsApp oculte el número'],
  '3.0.1': ['Tus chats anteriores de WhatsApp ahora aparecen en Chats', 'Botón "Nuevo chat" para escribirle a cualquier número', 'Se muestra tu número real en el menú', 'Envíos más confiables: el programa confirma que WhatsApp aceptó cada mensaje'],
  '3.0.0': ['Diseño nuevo con mosaicos, efecto cristal y fondo editable', 'Pipeline con etapas y calificación', 'Envíos a contactos agregados a mano, por Excel o por segmento, ahora o programados', 'Bandeja de Chats con respuestas rápidas (escribe "/")', 'Seguimientos automáticos a las 24 h y 72 h, y respuesta fuera de horario', 'Avisos de Windows y valor de la UF', 'Actualizaciones automáticas']
};
const LOGO_SVG = (n = 56) => `<svg width="${n}" height="${n}" viewBox="0 0 200 200" aria-hidden="true"><rect width="200" height="200" rx="46" fill="#2F4A3C"/><path d="M40 152 C40 102 80 56 162 44 C152 70 132 86 106 96 C130 94 148 90 162 84 C150 108 126 120 98 124 C118 126 134 124 146 120 C130 140 98 154 40 152 Z" fill="#F6ECDA"/><circle cx="58" cy="64" r="15" fill="#B4472C"/></svg>`;
const CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2F4A3C" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
async function novedades(v) {
  const ui = (await GET('/api/config')).ui || {};
  Object.assign(UI, ui);
  if (ui.versionVista === v) return;
  if (v === '4.0.0' || (v.startsWith('4.') && !ui.bienvenidaHermes)) bienvenida(v);
  else if (ui.versionVista && NOVEDADES[v]) modal(`<span class="eyebrow">Novedades</span><h3>CRM HERMES ${esc(v)}</h3><ul style="margin:0;padding-left:20px;line-height:1.8">${NOVEDADES[v].map((x) => `<li>${esc(x)}</li>`).join('')}</ul><div style="display:flex;justify-content:flex-end"><button class="btn pri" data-close>Entendido</button></div>`);
  guardarUI({ versionVista: v, bienvenidaHermes: true });
}
// Pantalla de bienvenida de CRM HERMES (una sola vez)
function bienvenida(v) {
  const IT = [['💬', 'WhatsApp dentro del CRM', 'Tus chats con la ficha de cada lead al lado: etapa, próxima acción, llamadas y etiquetas.'], ['🧵', 'Inicio con hilos', 'Toca una sección y se abre arriba; los círculos bajan a una barra. Esc vuelve al Inicio.'], ['📣', 'Envíos y seguimientos', 'Envíos masivos en grupos con su propio ritmo, y seguimientos automáticos si no responden.'], ['📞', 'Agendar llamada', 'Eliges la hora y el cliente recibe la confirmación y un recordatorio. Tú, un aviso.'], ['🎉', 'Anualidad de tus clientes', 'Al pasar a Ingresado empieza su año y te aviso un mes antes del aniversario.'], ['📁', 'Documentos por cliente', 'Lo que descargas de un chat queda en «Clientes CRM HERMES» del escritorio.'], ['🧮', 'El 7% de cada lead', 'En su ficha, con la UF del día 5 y el tope imponible.'], ['🌙', 'Temas de color', 'Claro, Invertido, Oscuro o Automático, con el botón de arriba.']];
  const b = $('bienvenida');
  b.innerHTML = `<div class="bvbox" role="dialog" aria-modal="true" aria-label="Bienvenido a CRM HERMES">
    <div style="display:flex;align-items:center;gap:18px">${LOGO_SVG(72)}<div><span class="eyebrow" style="font-size:13px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--terra-d)">Versión ${esc(v)} instalada</span><h2 class="ttl">CRM HERMES</h2></div></div>
    <p style="margin:0;font-size:16px;color:var(--muted)">Esto es lo que puedes hacer:</p>
    <div class="bvgrid">${IT.map(([i, t, d]) => `<div class="bvit"><span class="ic">${i}</span><div><b>${t}</b><span class="muted">${d}</span></div></div>`).join('')}</div>
    <div style="display:flex;justify-content:flex-end"><button class="btn pri lg" id="bvOk">Empezar</button></div></div>`;
  b.hidden = false; document.body.classList.add('tapado'); syncVista(true);
  $('bvOk').focus();
  $('bvOk').onclick = () => { b.hidden = true; b.innerHTML = ''; document.body.classList.remove('tapado'); syncVista(true); };
}
// Actualización: barrita con el avance de la descarga y, al terminar, el botón para reiniciar
const mb = (n) => (n / 1048576).toLocaleString('es-CL', { maximumFractionDigits: 1 });
function pintarUpBarra(u) {
  const el = $('upBarra');
  if (!u || !['descargando', 'lista'].includes(u.estado)) { el.hidden = true; el.innerHTML = ''; return; }
  const sig = JSON.stringify([u.estado, u.version, u.progreso, u.bajado]); if (pintarUpBarra.sig === sig && !el.hidden) return; pintarUpBarra.sig = sig;
  el.hidden = false;
  if (u.estado === 'descargando') {
    const det = u.total ? `${u.progreso || 0} % · ${mb(u.bajado || 0)} de ${mb(u.total)} MB` : (u.progreso != null ? (u.progreso || 0) + ' %' : '');
    el.className = 'upbarra';
    el.innerHTML = `<span class="ell">Bajando la versión ${esc(u.version || '')}</span><div class="bar"><div style="width:${u.progreso || 0}%"></div></div><span class="small muted">${det}</span>`;
  } else {
    el.className = 'upbarra lista';
    el.innerHTML = `<span class="ell">✓ La versión ${esc(u.version)} está lista</span><button class="btn pri sm" id="upYa">Reiniciar y actualizar</button>`;
    $('upYa').onclick = async () => {
      if (!(await confirmar('Se cerrará todo el programa, también WhatsApp, y volverá a abrir solo con la versión nueva.', { titulo: 'Reiniciar y actualizar', si: 'Reiniciar ahora' }))) return;
      $('upYa').disabled = true; $('upYa').textContent = 'Reiniciando…'; POST('/api/actualizacion/instalar').catch(() => {});
    };
  }
}

// ---------------- Tu día (Inicio) ----------------
const nomCorto = (c) => nombreDe(c);
async function loadHoy() {
  const d = await GET('/api/inicio').catch(() => null); if (!d) return; HUB = d; pintarDatos();
  const tiles = [
    { c: 't0', k: 'Chats sin responder', n: d.sinResponder, s: d.sinResponderLista[0] ? 'El más antiguo espera ' + hace(d.sinResponderLista[0].fecha) : 'Todo al día', go: 'chats' },
    { c: 't1', k: 'Llamadas hoy', n: d.llamadasHoy.length, s: d.llamadasHoy[0] ? 'La próxima a las ' + hora(d.llamadasHoy[0].fecha) : 'Agéndalas desde la ficha del lead', go: 'auto' },
    { c: 't3', k: 'Leads estancados', n: d.leads.estancados, s: `Más de ${d.leads.diasEstancado} días en la misma etapa`, go: 'pipeline' },
    { c: 't4', k: 'Enviados hoy', n: d.enviadosHoy, s: `Quedan ${Math.max(0, d.limite - d.enviadosHoy)} del máximo diario`, go: 'envios' }
  ];
  $('iTiles').innerHTML = tiles.map((t) => `<button class="tile ${t.c}" data-go="${t.go}"><span class="k">${t.k}</span><span class="n">${t.n}</span><span class="s">${esc(t.s)}</span></button>`).join('');
  const venc = (f) => new Date(f) <= new Date();
  $('iRec').innerHTML = d.recordatorios.length ? d.recordatorios.map((r) => `<div class="li"><div class="grow" style="min-width:0"><span class="pill ${venc(r.fecha) ? 'p-terra' : 'p-mut'}">${venc(r.fecha) ? 'Ahora · ' : ''}${fechaLarga(r.fecha)}</span><div style="margin-top:6px"><b>${esc(nombreDe(r))}</b>${r.texto ? `<span class="small muted"> · ${esc(r.texto)}</span>` : ''}</div></div><button class="btn sm" data-chat="${r.telefono}">Abrir chat</button><button class="btn sm" data-rlisto="${r.id}">Hecho</button></div>`).join('') : '<div class="empty">No tienes llamadas ni recordatorios. Agéndalos desde la ficha de un lead en Chats.</div>';
  $('iRec').querySelectorAll('[data-rlisto]').forEach((b) => (b.onclick = async () => { await POST('/api/recordatorios/' + b.dataset.rlisto + '/listo'); loadHoy(); }));
  $('iChats').innerHTML = d.sin24.length ? d.sin24.map((c) => `<div class="li"><div class="av">${esc(ini(c.nombre, c.apellido))}</div><div class="grow" style="min-width:0"><div style="display:flex;justify-content:space-between;gap:10px"><b>${esc(nombreDe(c))}</b><span class="pill p-warn">Espera ${hace(c.fecha)}</span></div><div class="small muted ell">${esc(c.texto)}</div></div><button class="btn sm" data-chat="${c.telefono}">Abrir chat</button></div>`).join('') : '<div class="empty">Nadie espera respuesta hace más de 24 horas 🎉</div>';
  const filaLead = (c, extra) => `<div class="li"><div class="grow" style="min-width:0"><b>${esc(nomCorto(c))}</b><div class="small muted">${esc(c.etapa)}${extra ? ' · ' + extra : ''}</div></div><button class="btn sm" data-llamar="${c.telefono}" data-nom="${esc(nomCorto(c))}">Agendar llamada</button><button class="btn sm" data-chat="${c.telefono}">Chat</button></div>`;
  $('iSinProx').innerHTML = d.leads.sinProx ? d.leads.sinProxLista.map((c) => filaLead(c)).join('') + (d.leads.sinProx > d.leads.sinProxLista.length ? `<div class="small muted" style="padding:10px 20px">y ${d.leads.sinProx - d.leads.sinProxLista.length} más</div>` : '') : '<div class="empty">Todos los que conversan contigo tienen un siguiente paso 👌</div>';
  $('iEst').innerHTML = d.leads.estancados ? d.leads.estancadosLista.map((c) => filaLead(c, `<span style="color:var(--warn);font-weight:600">${c.diasEtapa} días</span>`)).join('') : `<div class="empty">Ningún lead lleva más de ${d.leads.diasEstancado} días quieto</div>`;
  $('iAniv').innerHTML = (d.aniversariosMes || []).length ? d.aniversariosMes.map((a) => `<div class="li"><div class="grow" style="min-width:0"><b>${esc(nombreDe(a))}</b><div class="small muted">${esc(a.isapre || 'Sin Isapre')}</div></div><span class="pill p-mut">${dma(a.fecha).slice(0, 5)}</span><button class="btn sm" data-chat="${a.telefono}">Chat</button></div>`).join('') : '<div class="empty">Ningún cliente cumple su aniversario este mes</div>';
  $('iProg').innerHTML = d.programados.length ? d.programados.map((p) => `<div class="li"><span class="pill p-info">${fechaLarga(p.fecha)}</span><div class="grow"><b>${esc(p.nombre)}</b><div class="small muted">${p.total} contactos</div></div></div>`).join('') : '<div class="empty">No hay envíos programados</div>';
  const pct = d.salud.pct;
  $('iSalud').innerHTML = `<div class="kv"><span>Bajas últimos 7 días</span><b style="color:${pct >= 2 ? 'var(--bad)' : 'var(--ok)'}">${pct.toLocaleString('es-CL')}% · ${pct >= 2 ? 'alto, baja el ritmo' : 'normal'}</b></div><div class="kv"><span>Enviados últimos 7 días</span><b>${d.salud.enviados7}</b></div><div class="kv"><span>Alerta si supera</span><b>2%</b></div>`;
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-llamar]'); if (b) { e.stopPropagation(); llamadaModal(b.dataset.llamar, b.dataset.nom || ''); } });
document.addEventListener('click', (e) => { const b = e.target.closest('[data-chat]'); if (b) { e.stopPropagation(); openChat(b.dataset.chat); } });

// ---------------- Ficha de contacto (modal) ----------------
function contactoModal(c = {}, onSaved) {
  const nuevo = !c.telefono;
  modal(`<h3>${nuevo ? 'Nuevo contacto' : esc(nombreDe(c))}</h3>
    <div class="grid g2">
      <label class="f">Nombre<input type="text" id="mN" value="${esc(c.nombre)}"></label>
      <label class="f">Apellido<input type="text" id="mA" value="${esc(c.apellido)}"></label>
      <label class="f">Teléfono<input type="tel" id="mT" value="${esc(c.telefono ? fmtTel(c.telefono) : '')}" ${nuevo ? '' : 'disabled'}></label>
      <label class="f">Edad<input type="number" id="mE" value="${esc(c.edadActual || c.edad || '')}" min="0"></label>
      <label class="f">Renta<input type="text" id="mR" value="${esc(c.renta ? money(c.renta) : '')}" placeholder="$1.500.000"></label>
      <label class="f">Cargas<input type="text" id="mC" value="${esc(c.cargas)}" placeholder="Ej: 2 (7 y 11 años)"></label>
      <label class="f">Isapre actual o Fonasa<input type="text" id="mI" value="${esc(c.isapre)}" list="isaList"></label>
      <label class="f">Etapa<select id="mEt">${ETAPAS.map((e) => `<option ${e === (c.etapa || 'Nuevo') ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
      <label class="f">Calificación<select id="mCa"><option value="">Sin calificar</option>${CALIF.map((e) => `<option ${e === c.calificacion ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
      <label class="f" id="mMoW">Motivo de pérdida<select id="mMo"><option value=""></option>${MOTIVOS.map((e) => `<option ${e === c.motivo_perdida ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
    </div>
    <datalist id="isaList">${['Fonasa', 'Banmédica', 'Colmena', 'Consalud', 'Cruz Blanca', 'Esencial', 'Nueva Masvida', 'Vida Tres'].map((x) => `<option>${x}</option>`).join('')}</datalist>
    ${nuevo ? '' : anualHTML(c)}
    <span class="small" id="mErr" style="color:var(--bad)"></span>
    <div style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap">
      <div style="display:flex;gap:10px;flex-wrap:wrap">${nuevo ? '' : `<button class="btn" id="mChat">Abrir chat</button><button class="btn" id="mLlam">Agendar llamada</button>${puedo('eliminar') ? '<button class="btn danger" id="mDel">Eliminar</button>' : ''}`}</div>
      <div style="display:flex;gap:10px"><button class="btn" data-close>Cancelar</button><button class="btn pri" id="mSave">Guardar</button></div>
    </div>`, (box, close) => {
    const upd = () => ($('mMoW').style.display = $('mEt').value === 'Perdido' ? '' : 'none'); upd(); $('mEt').onchange = upd;
    if (!nuevo) activarAnual(box, c, onSaved);
    if (!nuevo) {
      $('mChat').onclick = () => { close(); openChat(c.telefono); };
      $('mLlam').onclick = () => { close(); llamadaModal(c.telefono, nombreDe(c), null, onSaved); };
      if ($('mDel')) $('mDel').onclick = async () => { if (!(await confirmar('Los mensajes del chat se mantienen.', { titulo: '¿Eliminar este contacto?', si: 'Eliminar', peligro: true }))) return; await DEL('/api/contactos/' + c.telefono); close(); onSaved && onSaved(); };
    }
    $('mSave').onclick = async () => {
      const campos = { nombre: $('mN').value, apellido: $('mA').value, edad: $('mE').value, renta: $('mR').value, cargas: $('mC').value, isapre: $('mI').value, etapa: $('mEt').value, calificacion: $('mCa').value, motivo_perdida: $('mEt').value === 'Perdido' ? $('mMo').value : '' };
      try {
        if (nuevo) {
          const tel = normPhone($('mT').value); if (!tel) { $('mErr').textContent = 'Revisa el teléfono (ej: +56 9 1234 5678)'; return; }
          const r1 = await POST('/api/contactos', { ...campos, telefono: tel });
          const r2 = await PATCH('/api/contactos/' + tel, { etapa: campos.etapa, calificacion: campos.calificacion, motivo_perdida: campos.motivo_perdida });
          const fiesta = (r1 && r1.celebrar) || (r2 && r2.celebrar); if (fiesta) setTimeout(() => celebrar(fiesta), 50);
        } else { const r = await PATCH('/api/contactos/' + c.telefono, campos); if (r && r.celebrar) setTimeout(() => celebrar(r.celebrar), 50); }
        close(); toast('Contacto guardado'); onSaved && onSaved();
      } catch (e) { $('mErr').textContent = e.message; }
    };
  });
}

// ---------------- Chats (WhatsApp Web dentro del CRM) ----------------
let chatSel = null, fichaSig = '', ultimaRespuesta = Date.now(), activoTimer = null;
const NATIVO = !!window.crmNativo;
async function loadChats() {
  $('waMsg').textContent = NATIVO ? 'Abriendo WhatsApp…' : 'WhatsApp se ve solo dentro del programa CRM HERMES.';
  fichaSig = ''; await leerActivo(); syncVista(true);
}
// Muestra las vistas de WhatsApp y del Cotizador solo cuando corresponde (nunca con el PIN, un modal o en otra sección)
let vistaSig = '', cotSig = '';
function syncVista(forzar) {
  if (!NATIVO) return;
  const libre = YO && !document.body.classList.contains('locked') && !document.body.classList.contains('tapado') && $('modal').hidden && !document.hidden;
  const caja = (id) => { const b = $(id).getBoundingClientRect(); return b.width > 20 && b.height > 20 ? { x: b.left, y: b.top, width: b.width, height: b.height } : null; };
  const r = libre && current === 'chats' ? caja('waHost') : null;
  const sig = JSON.stringify(r);
  if (sig !== vistaSig || forzar) { vistaSig = sig; window.crmNativo.waVista(r); }
  if (!window.crmNativo.cotVista) return;
  const c = libre && current === 'cotizador' ? caja('cotizCaja') : null;
  const sigC = JSON.stringify(c);
  if (sigC !== cotSig || forzar) { cotSig = sigC; window.crmNativo.cotVista(c); }
}
setInterval(syncVista, 300);
// Volvió internet: WhatsApp reintenta al tiro en vez de esperar
window.addEventListener('online', () => { if (YO && EST && ['error', 'desconectado'].includes(EST.wa.state)) POST('/api/reintentar').catch(() => {}); });
window.addEventListener('resize', () => syncVista(true));
new MutationObserver(() => syncVista()).observe($('modal'), { attributes: true, attributeFilter: ['hidden'] });

// Qué chat está abierto en WhatsApp → su ficha al lado
async function leerActivo() {
  if (!YO || current !== 'chats' || document.hidden || leerActivo.ocupado) return;
  leerActivo.ocupado = true;
  const d = await GET('/api/wa/activo').catch(() => null);
  leerActivo.ocupado = false;
  if (!d) return;
  const sig = JSON.stringify(d.chat) + d.wa;
  if (sig === fichaSig) return; fichaSig = sig;
  chatSel = d.chat && d.chat.telefono || null;
  pintarBarra(d); pintarFicha(d);
}
setInterval(leerActivo, 1500);
function colorEtapa(et) { const i = ETAPAS.indexOf(et || 'Nuevo'); return COL[i < 0 ? 0 : i]; }
function pintarBarra(d) {
  const ch = d.chat, bar = $('waBar');
  if (!ch || !ch.telefono) { bar.style.setProperty('--et', 'rgba(255,255,255,.18)'); const txt = d.wa === 'qr' ? 'Escanea el código QR con tu celular: WhatsApp → Dispositivos vinculados → Vincular un dispositivo' : d.wa === 'error' || d.wa === 'desconectado' ? (EST && EST.wa && EST.wa.sinRed ? EST.wa.err + ' Se reintenta solo.' : 'WhatsApp no pudo conectarse. El programa vuelve a intentarlo solo.') : d.wa !== 'listo' ? 'WhatsApp se está conectando…' : ch && ch.grupo ? 'Grupo de WhatsApp · sin ficha' : 'Abre un chat en WhatsApp para ver su ficha';
    bar.innerHTML = `<span class="grow ${d.wa === 'qr' ? '' : 'muted'}">${txt}</span>${['error', 'desconectado'].includes(d.wa) ? '<button class="btn sm" id="waRe">Reintentar ahora</button>' : ''}`;
    if ($('waRe')) $('waRe').onclick = async () => { $('waRe').disabled = true; await POST('/api/reintentar').catch(() => {}); fichaSig = ''; };
    return; }
  const c = ch.contacto;
  const nom = c ? [c.nombre, c.apellido].filter(Boolean).join(' ') || ch.nombreWa : ch.nombreWa;
  const et = c ? c.etapa || 'Nuevo' : null;
  bar.style.setProperty('--et', et ? colorEtapa(et) : 'rgba(255,255,255,.18)');
  bar.innerHTML = `<div class="grow" style="min-width:0"><b class="cnom">${esc(nom || fmtTel(ch.telefono))}</b><span class="ctel">${fmtTel(ch.telefono)}</span></div>
    ${c ? `<span class="etpill" style="background:${colorEtapa(et)}">${esc(et)}</span><label class="etq"><span>Cambiar etapa</span><select id="cEtapa">${ETAPAS.map((e) => `<option ${e === et ? 'selected' : ''}>${e}</option>`).join('')}</select></label>` : '<span class="pill p-mut">Aún no es lead</span>'}`;
  if ($('cEtapa')) $('cEtapa').onchange = async () => {
    const nueva = $('cEtapa').value; let motivo = '';
    if (nueva === 'Perdido') { motivo = await pedirMotivo(); if (!motivo) { $('cEtapa').value = et; return; } }
    await cambiarEtapa(ch.telefono, nueva, motivo); toast('Etapa actualizada'); fichaSig = ''; leerActivo();
  };
}
function proxTxt(c) {
  if (!c) return '';
  if (c.prox && c.prox.fecha) return (c.prox.llamada ? '' : '🔔 ') + cuando(c.prox.fecha) + (c.prox.texto ? ' · ' + c.prox.texto : '');
  if (c.prox && c.prox.seguimiento) return 'Seguimiento automático en curso';
  return '';
}
function pintarFicha(d) {
  const f = $('cFicha'), ch = d.chat;
  if (!ch || !ch.telefono) { f.innerHTML = `<h2 class="fh">Ficha del lead</h2><div class="empty">${ch && ch.sinNumero ? 'WhatsApp no entregó el número de este chat.' : 'Cuando abras un chat en WhatsApp, aquí aparecen los datos del lead, su próxima acción y sus llamadas.'}</div>`; return; }
  const c = ch.contacto;
  const nom = nombreDe(c || { nombre: ch.nombreWa, telefono: ch.telefono });
  const llam = (ch.llamadas || []).map((l) => `<div class="llam"><b>📞 Llamada ${esc(cuando(l.fecha))}</b><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-lre="${l.id}" data-f="${esc(l.fecha)}" data-op="${esc(l.opciones || '')}">Reagendar</button><button class="btn sm" data-lok="${l.id}">Hecha</button><button class="btn sm danger" data-lx="${l.id}">Cancelar</button></div></div>`).join('');
  const recs = (ch.recordatorios || []).filter((r) => !r.llamada_id).map((r) => `<div class="rec ${new Date(r.fecha) <= new Date() ? 'venc' : ''}"><div class="grow"><b>${fechaLarga(r.fecha)}</b>${r.texto ? `<div class="small">${esc(r.texto)}</div>` : ''}</div><button class="btn sm" data-rok="${r.id}" title="Marcar como hecho">Hecho</button></div>`).join('');
  const px = proxTxt(c); const sinProx = c && c.sinProx;
  const bloqueProx = `<div class="proxbox ${sinProx ? 'sin' : ''}"><span class="lbl">Próxima acción</span><b>${px ? esc(px) : sinProx ? 'Sin próxima acción' : 'Nada agendado'}</b>${sinProx ? '<span class="small muted">Agenda algo para no perder este lead</span>' : ''}</div>
    <button class="btn pri llamar" id="fLlam"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>Agendar llamada</button>${llam}`;
  const bloqueRec = `<div class="fsec"><div class="hd2"><span>Recordatorios</span><button class="btn sm" id="fRec">Recordarme</button></div>${recs || '<span class="small muted">Sin recordatorios</span>'}</div>`;
  if (!c) {
    f.innerHTML = `<h2 class="fh">Ficha del lead</h2>
      <div class="glass nolead"><b>${esc(ch.nombreWa || fmtTel(ch.telefono))}</b><span class="small muted">${fmtTel(ch.telefono)}</span><p class="small" style="margin:6px 0 0">Este chat todavía no está en tu Pipeline.</p></div>
      <button class="btn verde" id="fCrear">Crear lead</button>${bloqueProx}${bloqueRec}`;
    $('fCrear').onclick = async () => {
      const [n, ...a] = String(ch.nombreWa && !/^\+?[\d\s]+$/.test(ch.nombreWa) ? ch.nombreWa : '').split(' ');
      try { await POST('/api/contactos', { telefono: ch.telefono, nombre: n || '', apellido: a.join(' '), origen: 'whatsapp', etapa: 'Nuevo' }); toast('Lead creado en el Pipeline'); fichaSig = ''; await leerActivo(); } catch (e) { toast(e.message); }
    };
  } else {
    const seq = c.seq_estado === 'activa' ? `En curso · paso ${Math.min(c.seq_paso || 1, 3)} de 3` : c.seq_estado === 'detenida' ? 'Detenida: ' + (c.seq_motivo || '') : c.seq_estado === 'terminada' ? 'Terminada' : 'Sin secuencia';
    f.innerHTML = `<h2 class="fh">Ficha del lead</h2>
      ${bloqueProx}
      ${[['Nombre', [c.nombre, c.apellido].filter(Boolean).join(' ')], ['Edad', c.edadActual ? c.edadActual + ' años' : ''], ['Renta', c.renta ? money(c.renta) : ''], ['Cargas', c.cargas], ['Isapre/Fonasa', c.isapre]].map(([k, v]) => `<div class="kv"><span>${k}</span><b style="text-align:right">${esc(v || '—')}</b></div>`).join('')}${sieteHTML(c.renta)}
      ${c.estancado ? `<div class="kv"><span>En esta etapa</span><b style="color:var(--warn)">${c.diasEtapa} días · estancado</b></div>` : ''}
      <div class="fsec"><span class="small muted" style="font-weight:700">Calificación</span><div class="chips">${CALIF.map((x) => `<button class="chip ${x === c.calificacion ? 'on' : ''}" data-cal="${x}">${x}</button>`).join('')}</div></div>
      <div class="fsec"><span class="small muted" style="font-weight:700">Etiquetas</span><div class="chips etqs">${(c.etiquetas || []).map((e) => chipEtq(e, true)).join('')}<button type="button" class="etqmas" id="fEtq">+ etiqueta</button></div></div>
      ${anualHTML(c)}
      <div class="fsec docs" id="fDocs" hidden></div>
      ${c.etapa === 'Perdido' && c.motivo_perdida ? `<div class="kv"><span>Motivo de pérdida</span><b>${esc(c.motivo_perdida)}</b></div>` : ''}
      <div class="kv"><span>Seguimiento</span><b style="text-align:right">${esc(seq)}</b></div>
      ${bloqueRec}
      <button class="btn" id="fEdit" style="margin-top:auto">Editar datos</button>`;
    f.querySelectorAll('[data-cal]').forEach((b) => (b.onclick = async () => { await PATCH('/api/contactos/' + c.telefono, { calificacion: b.dataset.cal === c.calificacion ? '' : b.dataset.cal }); fichaSig = ''; leerActivo(); }));
    $('fEdit').onclick = () => contactoModal(c, () => { fichaSig = ''; leerActivo(); });
    $('fEtq').onclick = () => etiquetaModal(c.telefono, nom, () => { fichaSig = ''; leerActivo(); });
    activarAnual(f, c, () => { fichaSig = ''; leerActivo(); });
    pintarDocs($('fDocs'), c.telefono);
    f.querySelectorAll('[data-qetq]').forEach((b) => (b.onclick = async () => { await DEL(`/api/contactos/${c.telefono}/etiquetas/${b.dataset.qetq}`).catch(() => {}); fichaSig = ''; leerActivo(); }));
  }
  const recargar = () => { fichaSig = ''; leerActivo(); };
  $('fLlam').onclick = () => llamadaModal(ch.telefono, nom, null, recargar);
  $('fRec').onclick = () => recordatorioModal(ch.telefono, nom, recargar);
  f.querySelectorAll('[data-rok]').forEach((b) => (b.onclick = async () => { await POST('/api/recordatorios/' + b.dataset.rok + '/listo'); recargar(); }));
  f.querySelectorAll('[data-lre]').forEach((b) => (b.onclick = () => llamadaModal(ch.telefono, nom, { id: b.dataset.lre, fecha: b.dataset.f, opciones: b.dataset.op }, recargar)));
  f.querySelectorAll('[data-lok]').forEach((b) => (b.onclick = async () => { await POST('/api/llamadas/' + b.dataset.lok + '/hecha'); toast('Llamada marcada como hecha'); recargar(); }));
  f.querySelectorAll('[data-lx]').forEach((b) => (b.onclick = async () => { if (!(await confirmar('El recordatorio al cliente ya no saldrá.', { titulo: '¿Cancelar esta llamada?', si: 'Cancelar llamada', no: 'Volver', peligro: true }))) return; await POST('/api/llamadas/' + b.dataset.lx + '/cancelar'); toast('Llamada cancelada'); recargar(); }));
}
// Agendar (o reagendar) una llamada: eliges la hora y qué se envía. Lo marcado queda para la próxima
function llamadaModal(tel, nombre, llamada, listo) {
  const H = (CFG && CFG.llamadas && CFG.llamadas.horas) || ['10:00', '16:00'];
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const en = (dias, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(h, m || 0, 0, 0); return d; };
  const ops = [];
  const ahora = new Date();
  const proxHora = new Date(ahora); proxHora.setMinutes(0, 0, 0); proxHora.setHours(proxHora.getHours() + 2);
  if (proxHora.getHours() >= 9 && proxHora.getHours() <= 20 && proxHora.getDate() === ahora.getDate()) ops.push(['Hoy ' + hora(proxHora.toISOString()), proxHora]);
  for (const hh of H) ops.push(['Mañana ' + hh, en(1, hh)]);
  if (ops.length < 4) ops.push(['Pasado mañana ' + H[0], en(2, H[0])]);
  const ops4 = ops.slice(0, 3);
  const cfgL = (CFG && CFG.llamadas) || {};
  // Parte como quedó la última vez (o como se agendó esta llamada, al reagendar)
  let op = null; try { op = llamada && llamada.opciones ? JSON.parse(llamada.opciones) : null; } catch {}
  op = op || { confirmacion: cfgL.confirmacion?.on !== false, recordatorio: cfgL.recordatorio?.on !== false, minutos: cfgL.recordatorio?.minutos ?? 60, aviso: cfgL.aviso?.on !== false, avisoMin: parseInt(cfgL.avisoMin ?? 10) || 0 };
  const TIEMPOS = [[15, '15 min antes'], [60, '1 hora antes'], [120, '2 horas antes'], ['dia_antes', 'El día anterior (18:00)']];
  if (!TIEMPOS.some(([m]) => String(m) === String(op.minutos))) TIEMPOS.unshift([op.minutos, (parseInt(op.minutos) || 60) + ' min antes']);
  const VARS = '<span class="small muted">{nombre}, {dia} y {hora} se cambian solos.</span>';
  let elegido = llamada ? new Date(llamada.fecha) : ops4[1] ? ops4[1][1] : ops4[0][1];
  modal(`<span class="eyebrow">${llamada ? 'Reagendar llamada' : 'Agendar llamada'}</span><h3>Llamar a ${esc(nombre || fmtTel(tel))}</h3>
    <span class="small muted">¿Cuándo?</span>
    <div class="grid g2" style="gap:10px" id="lOps">${ops4.map(([t], i) => `<button type="button" class="chip" style="height:54px;font-size:15px" data-i="${i}">${t}</button>`).join('')}<button type="button" class="chip" style="height:54px;font-size:15px" data-i="otro">Otro día y hora…</button></div>
    <label class="f" id="lOtroW" hidden>Fecha y hora<input type="datetime-local" id="lF"></label>
    <div class="proxbox" style="gap:10px;font-size:14px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="check" style="justify-content:flex-start;gap:10px"><input type="checkbox" id="lCo" ${op.confirmacion ? 'checked' : ''}><span>Enviar confirmación al cliente</span></label><button type="button" class="lnk" data-ed="lCoT">Editar texto</button></div>
      <div id="lCoT" hidden><textarea id="lCoTx" rows="3">${esc(cfgL.confirmacion?.texto || '')}</textarea>${VARS}</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="check" style="justify-content:flex-start;gap:10px"><input type="checkbox" id="lRe" ${op.recordatorio ? 'checked' : ''}><span>Enviar recordatorio al cliente</span></label><select id="lReM" style="width:auto">${TIEMPOS.map(([m, t]) => `<option value="${m}"${String(m) === String(op.minutos) ? ' selected' : ''}>${t}</option>`).join('')}</select><button type="button" class="lnk" data-ed="lReT">Editar texto</button></div>
      <div id="lReT" hidden><textarea id="lReTx" rows="3">${esc(cfgL.recordatorio?.texto || '')}</textarea>${VARS}</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="check" style="justify-content:flex-start;gap:10px"><input type="checkbox" id="lAv" ${op.aviso ? 'checked' : ''}><span>Avisarme en Windows</span></label><input type="number" id="lAvM" min="0" max="240" value="${parseInt(op.avisoMin) || 0}" style="width:76px"><span class="small muted">minutos antes</span></div>
    </div>
    <span class="small" id="lErr" style="color:var(--bad)"></span>
    <div style="display:flex;gap:12px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn pri" id="lOk">${llamada ? 'Reagendar' : 'Agendar'}</button></div>`, (box, close) => {
    const marcar = (k) => { box.querySelectorAll('#lOps [data-i]').forEach((x) => x.classList.toggle('on', x.dataset.i === String(k))); };
    const idx = llamada ? 'otro' : ops4[1] ? 1 : 0; marcar(idx); setTimeout(() => $('lOk') && $('lOk').focus(), 0);
    if (idx === 'otro') { $('lOtroW').hidden = false; $('lF').value = local(elegido); }
    box.querySelectorAll('#lOps [data-i]').forEach((x) => (x.onclick = () => {
      marcar(x.dataset.i);
      if (x.dataset.i === 'otro') { $('lOtroW').hidden = false; if (!$('lF').value) $('lF').value = local(elegido); $('lF').focus(); }
      else { $('lOtroW').hidden = true; elegido = ops4[+x.dataset.i][1]; }
    }));
    box.querySelectorAll('[data-ed]').forEach((x) => (x.onclick = () => { const w = $(x.dataset.ed); w.hidden = !w.hidden; if (!w.hidden) w.querySelector('textarea').focus(); }));
    $('lOk').onclick = async () => {
      const f = $('lOtroW').hidden ? elegido : new Date($('lF').value);
      const m = $('lReM').value;
      const opciones = { confirmacion: $('lCo').checked, recordatorio: $('lRe').checked, minutos: m === 'dia_antes' ? m : parseInt(m) || 60, aviso: $('lAv').checked, avisoMin: Math.max(0, parseInt($('lAvM').value) || 0) };
      const textos = {};
      if ($('lCoTx').value.trim() && $('lCoTx').value !== (cfgL.confirmacion?.texto || '')) textos.confirmacion = $('lCoTx').value;
      if ($('lReTx').value.trim() && $('lReTx').value !== (cfgL.recordatorio?.texto || '')) textos.recordatorio = $('lReTx').value;
      if (isNaN(f) || f < new Date(Date.now() - 60000)) return ($('lErr').textContent = 'Elige una fecha y hora futura');
      $('lOk').disabled = true;
      try {
        if (llamada) await POST('/api/llamadas/' + llamada.id + '/reagendar', { fecha: f.toISOString(), opciones, textos });
        else await POST('/api/llamadas', { telefono: tel, fecha: f.toISOString(), opciones, textos });
        // Queda como la elección para la próxima llamada
        if (CFG) CFG.llamadas = { ...cfgL, confirmacion: { ...cfgL.confirmacion, on: opciones.confirmacion, texto: textos.confirmacion || cfgL.confirmacion?.texto }, recordatorio: { ...cfgL.recordatorio, on: opciones.recordatorio, minutos: opciones.minutos, texto: textos.recordatorio || cfgL.recordatorio?.texto }, aviso: { on: opciones.aviso }, avisoMin: opciones.avisoMin };
        close(); toast(`Llamada ${llamada ? 'reagendada' : 'agendada'}: ${fechaLarga(f.toISOString())}`); listo && listo(); if (current === 'hoy') loadHoy();
      } catch (e) { $('lErr').textContent = e.message; $('lOk').disabled = false; }
    };
  });
}
function recordatorioModal(tel, nombre, listo) {
  const en = (h) => new Date(Date.now() + h * 3600000);
  const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; };
  const OPC = [['En 1 hora', () => en(1)], ['Mañana 9:00', manana], ['En 2 días', () => { const d = en(48); d.setHours(9, 0, 0, 0); return d; }], ['En 1 semana', () => { const d = en(168); d.setHours(9, 0, 0, 0); return d; }]];
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  modal(`<h3>Recordarme · ${esc(nombre)}</h3>
    <div class="chips">${OPC.map(([t], i) => `<button class="chip ${i === 1 ? 'on' : ''}" data-op="${i}">${t}</button>`).join('')}</div>
    <label class="f">Fecha y hora<input type="datetime-local" id="rF" value="${local(manana())}"></label>
    <label class="f">¿Qué tienes que hacer? (opcional)<input type="text" id="rT" maxlength="300" placeholder="Ej: preguntar si llegó la liquidación"></label>
    <span class="small" id="rErr" style="color:var(--bad)"></span>
    <div style="display:flex;justify-content:flex-end;gap:10px"><button class="btn" data-close>Cancelar</button><button class="btn pri" id="rOk">Guardar recordatorio</button></div>`, (b, close) => {
    b.querySelectorAll('[data-op]').forEach((x) => (x.onclick = () => { b.querySelectorAll('[data-op]').forEach((y) => y.classList.toggle('on', y === x)); $('rF').value = local(OPC[+x.dataset.op][1]()); }));
    $('rOk').onclick = async () => {
      const f = new Date($('rF').value); if (isNaN(f)) return ($('rErr').textContent = 'Elige una fecha');
      try { await POST('/api/recordatorios', { telefono: tel, fecha: f.toISOString(), texto: $('rT').value }); close(); toast('Te aviso el ' + fechaLarga(f.toISOString())); listo && listo(); } catch (e) { $('rErr').textContent = e.message; }
    };
  });
}
// Abre la conversación de un contacto dentro de WhatsApp
async function openChat(tel) {
  if (current !== 'chats') go('chats');
  try { await POST('/api/wa/abrir/' + tel); fichaSig = ''; setTimeout(leerActivo, 600); }
  catch (e) { toast(e.message); }
}
async function crearSiFalta(c) { if (!c.creado) { const [n, ...a] = String(c.nombre || '').split(' '); await POST('/api/contactos', { telefono: c.telefono, nombre: n || '', apellido: a.join(' '), origen: 'whatsapp' }); } }
function pedirMotivo() {
  return new Promise((resolve) => {
    modal(`<h3>¿Por qué se perdió?</h3><div class="chips">${MOTIVOS.map((m) => `<button class="chip" data-m="${m}">${m}</button>`).join('')}</div><div style="display:flex;justify-content:flex-end"><button class="btn" id="mCancel">Cancelar</button></div>`, (box, close) => {
      box.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { close(); resolve(b.dataset.m); }));
      $('mCancel').onclick = () => { close(); resolve(''); };
    }, () => resolve(''));
  });
}

// ---------------- Pipeline ----------------
let pipeData = [];
async function loadPipeline() {
  $('headActions').innerHTML = '';
  if (!loadPipeline.etq) { loadPipeline.etq = true; await cargarEtiquetas(); pintarFiltros(); }
  const q = new URLSearchParams({ calificacion: $('pCal').value, isapre: $('pIsa').value, q: $('pQ').value, etiqueta: $('pEtq').value });
  const d = await GET('/api/contactos?' + q).catch(() => null); if (!d) return;
  if ($('pEst').checked) d.contactos = d.contactos.filter((c) => c.estancado);
  const sigP = JSON.stringify(d.contactos.map((c) => [c.telefono, c.etapa, c.calificacion, c.nombre, c.apellido, c.renta, c.cargas, c.isapre, c.motivo_perdida, c.edadActual, c.estancado, c.diasEtapa, c.prox, c.sinProx, c.etiquetas])) + $('pIsa').value + $('pEst').checked + $('pEtq').value;
  if (sigP === loadPipeline.sig && $('board').children.length) return;   // sin cambios: no se vuelve a dibujar
  loadPipeline.sig = sigP;
  pipeData = d.contactos;
  const isaSel = $('pIsa').value;
  $('pIsa').innerHTML = '<option value="">Todas</option>' + d.isapres.map((x) => `<option ${x === isaSel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  $('subtitle').textContent = `Arrastra cada lead a su etapa · ${pipeData.length} contactos`;
  const nEst = pipeData.filter((c) => c.estancado).length;
  $('pLeyenda').innerHTML = nEst ? `<span style="color:var(--warn);font-weight:600">${nEst} en naranjo</span>: más de ${d.diasEstancado} días en la misma etapa` : '';
  GET('/api/duplicados').then((x) => { const n = x.grupos.length; $('pDup').hidden = !n; $('pDup').textContent = `Contactos repetidos (${n})`; }).catch(() => {});
  $('board').innerHTML = ETAPAS.map((et, i) => { const cs = pipeData.filter((c) => (c.etapa || 'Nuevo') === et);
    return `<section class="col" data-etapa="${et}"><div class="ch" style="background:${COL[i]}B8"><span>${et}</span><span>${cs.length}</span></div><div class="cb">${cs.slice(0, 200).map((c) => `<div class="kcard ${c.estancado ? 'est' : ''}" role="button" tabindex="0" draggable="true" data-tel="${c.telefono}"><div class="kt"><b>${esc(nombreDe(c))}</b>${c.estancado ? `<span class="dias" title="Días en esta etapa">${c.diasEtapa} días</span>` : ''}<button class="kwa" data-chat="${c.telefono}" title="Abrir en WhatsApp" aria-label="Abrir en WhatsApp"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg></button></div>${(c.etiquetas || []).length ? `<div class="kets">${c.etiquetas.map((e) => chipEtq(e)).join('')}</div>` : ''}${c.prox && c.prox.fecha ? `<span class="prox okp">${c.prox.llamada ? '📞' : '🔔'} ${esc(cuando(c.prox.fecha))}${c.prox.llamada ? ' · llamada' : ''}</span>` : c.sinProx ? '<span class="prox sinp">Sin próxima acción</span>' : ''}<span>${[c.edadActual ? c.edadActual + ' años' : '', c.renta ? money(c.renta) : '', c.cargas ? c.cargas + (String(c.cargas).trim() === '1' ? ' carga' : ' cargas') : '', c.isapre].filter(Boolean).map(esc).join(' · ') || fmtTel(c.telefono)}</span>${et === 'Perdido' && c.motivo_perdida ? `<span class="pill p-bad" style="align-self:flex-start">${esc(c.motivo_perdida)}</span>` : c.calificacion ? `<span class="pill ${califPill(c.calificacion)}" style="align-self:flex-start">${esc(c.calificacion)}</span>` : ''}</div>`).join('')}${cs.length > 200 ? `<div class="small muted" style="padding:6px">y ${cs.length - 200} más… usa los filtros</div>` : ''}</div></section>`; }).join('');
  $('board').querySelectorAll('.kcard').forEach((k) => {
    k.ondragstart = (e) => { e.dataTransfer.setData('text/plain', k.dataset.tel); };
    k.onclick = (e) => { if (!e.target.closest('[data-chat]')) contactoModal(pipeData.find((c) => c.telefono === k.dataset.tel), loadPipeline); };
  });
  $('board').querySelectorAll('.col').forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
    col.ondragleave = () => col.classList.remove('drop');
    col.ondrop = async (e) => { e.preventDefault(); col.classList.remove('drop'); const tel = e.dataTransfer.getData('text/plain'); const et = col.dataset.etapa;
      const c = pipeData.find((x) => x.telefono === tel); if (!c || c.etapa === et) return;
      let motivo = ''; if (et === 'Perdido') { motivo = await pedirMotivo(); if (!motivo) return; }
      await cambiarEtapa(tel, et, motivo); loadPipeline(); };
  });
}
['pCal', 'pIsa', 'pEtq'].forEach((id) => ($(id).onchange = () => { $('pFil').value = ''; $('pFilX').hidden = true; loadPipeline(); }));
// Filtros guardados: la combinación de filtros de la Pipeline con un nombre
function pintarFiltros() {
  const l = UI.filtros || [], v = $('pFil').value;
  $('pFil').innerHTML = '<option value="">—</option>' + l.map((x, i) => `<option value="${i}" ${String(i) === v ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  $('pFilX').hidden = $('pFil').value === '';
}
$('pFil').onchange = () => {
  const x = (UI.filtros || [])[+$('pFil').value]; $('pFilX').hidden = !x; if (!x) return;
  $('pCal').value = x.cal || ''; $('pQ').value = x.q || ''; $('pEst').checked = !!x.est;
  if (x.isa && ![...$('pIsa').options].some((o) => o.value === x.isa)) $('pIsa').insertAdjacentHTML('beforeend', `<option>${esc(x.isa)}</option>`);
  $('pIsa').value = x.isa || ''; $('pEtq').value = ETQS.some((e) => String(e.id) === String(x.etq)) ? x.etq : '';
  loadPipeline();
};
$('pFilG').onclick = () => modal(`<span class="eyebrow">Pipeline</span><h3>Guardar filtro</h3><span class="small muted">Guarda los filtros de ahora para volver a ellos con un clic.</span><input id="fgNom" maxlength="40" placeholder="Ej: Calificados con 2 cargas"><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn pri" id="fgOk">Guardar</button></div>`, (box, close) => {
  box.querySelector('#fgOk').onclick = async () => {
    const nombre = box.querySelector('#fgNom').value.trim(); if (!nombre) return box.querySelector('#fgNom').focus();
    const l = [...(UI.filtros || []).filter((x) => x.nombre !== nombre), { nombre, cal: $('pCal').value, isa: $('pIsa').value, q: $('pQ').value, est: $('pEst').checked, etq: $('pEtq').value }];
    await guardarUI({ filtros: l }); close(); pintarFiltros(); $('pFil').value = String(l.length - 1); $('pFilX').hidden = false; toast('Filtro guardado');
  };
  box.querySelector('#fgNom').onkeydown = (e) => { if (e.key === 'Enter') box.querySelector('#fgOk').click(); };
});
$('pFilX').onclick = async () => { const i = +$('pFil').value; const x = (UI.filtros || [])[i]; if (!x || !(await confirmar('Los contactos no cambian; solo se borra el filtro guardado.', { titulo: `¿Borrar el filtro «${x.nombre}»?`, si: 'Borrar' }))) return; await guardarUI({ filtros: UI.filtros.filter((_, j) => j !== i) }); $('pFil').value = ''; pintarFiltros(); };
$('pQ').oninput = () => { clearTimeout(loadPipeline._t); loadPipeline._t = setTimeout(loadPipeline, 250); };
$('pNuevo').onclick = () => contactoModal({}, loadPipeline);
$('pEst').onchange = () => { $('pFil').value = ''; $('pFilX').hidden = true; loadPipeline(); };
// Contactos repetidos: mismo nombre y apellido con distinto número
$('pDup').onclick = async function dupModal() {
  const d = await GET('/api/duplicados').catch(() => ({ grupos: [] }));
  if (!d.grupos.length) { modal('<h3>Contactos repetidos</h3><div class="empty">No quedan contactos repetidos 🎉</div><div style="display:flex;justify-content:flex-end"><button class="btn pri" data-close>Listo</button></div>'); loadPipeline.sig = ''; loadPipeline(); return; }
  const det = (c) => [fmtTel(c.telefono), c.etapa || 'Nuevo', c.isapre, c.renta ? money(c.renta) : '', c.mensajes ? c.mensajes + ' mensajes' : 'sin chat'].filter(Boolean).map(esc).join(' · ');
  modal(`<span class="eyebrow">Pipeline</span><h3>Contactos repetidos</h3><span class="small muted">Tienen el mismo nombre y apellido con distinto número. Elige cuál se queda: se completan sus datos vacíos con los del otro, se pasan sus llamadas y recordatorios, y se borra el repetido. Los chats de WhatsApp no se tocan.</span>
    ${d.grupos.map((g, gi) => `<div class="glass card" style="padding:14px;gap:8px">${g.contactos.map((c, i) => `<label class="check" style="justify-content:flex-start;gap:10px"><input type="radio" name="dg${gi}" value="${c.telefono}" ${i === 0 ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--terra)"><span class="grow"><b>${esc(nombreDe(c))}</b><span class="small muted" style="display:block">${det(c)}</span></span></label>`).join('')}
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sm" data-dign="${gi}">No son la misma persona</button><button class="btn sm pri" data-duni="${gi}">Unir</button></div></div>`).join('')}
    <div style="display:flex;justify-content:flex-end"><button class="btn" data-close>Cerrar</button></div>`, (box) => {
    box.classList.add('wide2');
    box.querySelectorAll('[data-duni]').forEach((b) => (b.onclick = async () => {
      const g = d.grupos[+b.dataset.duni]; const queda = box.querySelector(`input[name="dg${b.dataset.duni}"]:checked`).value;
      try { for (const c of g.contactos) if (c.telefono !== queda) await POST('/api/duplicados/unir', { queda, sale: c.telefono }); toast('Contactos unidos'); dupModal(); } catch (e) { toast(e.message); }
    }));
    box.querySelectorAll('[data-dign]').forEach((b) => (b.onclick = async () => { await POST('/api/duplicados/ignorar', { clave: d.grupos[+b.dataset.dign].clave }); dupModal(); }));
  });
};

// ---------------- Emojis e inserción en textos ----------------
const EMOJIS = {
  'Caras': '😀 😃 😄 😁 😊 🙂 😉 😍 🥰 😘 😎 🤗 🤩 🤔 😅 😂 🙏 😌 😇 🥳 😢 😮 😬 🫶',
  'Gestos': '👍 👌 👏 🙌 🤝 ✌️ 💪 👋 👉 👈 👇 ☝️ ✍️ 🫡',
  'Salud y familia': '🏥 🩺 💊 💉 🩹 🦷 👶 🤰 👪 👨‍👩‍👧‍👦 🧓 👵 👴 👩‍⚕️ 👨‍⚕️ 🧑‍⚕️ ❤️‍🩹',
  'Trámites': '📄 📝 📋 📌 📎 📅 🗓️ ⏰ 📞 📱 💬 ✉️ 💰 💵 💳 🏦 🏠 🔒 🔑 📊',
  'Símbolos': '✅ ☑️ ✔️ ❌ ⚠️ ❗ ❓ ⭐ 🌟 ✨ 🔥 💯 🎉 🎁 💙 💚 💜 🧡 ❤️ ➡️ 🔔 🆕 🆓 ⏳'
};
function insertarEn(t, txt) {
  if (!t) return;
  const s = t.selectionStart ?? t.value.length, e = t.selectionEnd ?? s;
  t.value = t.value.slice(0, s) + txt + t.value.slice(e);
  t.focus(); t.selectionStart = t.selectionEnd = s + txt.length;
  t.dispatchEvent(new Event('input', { bubbles: true }));
}
function selectorEmojis(boton, alElegir) {
  const viejo = document.querySelector('.emojipop'); if (viejo) { viejo.remove(); if (viejo._de === boton) return; }
  const pop = document.createElement('div'); pop.className = 'emojipop glass'; pop._de = boton;
  pop.innerHTML = Object.entries(EMOJIS).map(([cat, l]) => `<div class="ecat">${cat}</div><div class="egrid">${l.split(' ').map((x) => `<button type="button" data-e="${x}">${x}</button>`).join('')}</div>`).join('');
  document.body.appendChild(pop);
  const r = boton.getBoundingClientRect();
  pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 10, r.bottom + 6) + 'px';
  pop.style.left = Math.max(10, Math.min(window.innerWidth - pop.offsetWidth - 10, r.right - pop.offsetWidth)) + 'px';
  pop.querySelectorAll('[data-e]').forEach((b) => (b.onmousedown = (ev) => { ev.preventDefault(); alElegir(b.dataset.e); }));
  setTimeout(() => document.addEventListener('mousedown', function fuera(ev) { if (!pop.contains(ev.target) && ev.target !== boton) { pop.remove(); document.removeEventListener('mousedown', fuera); } }), 0);
}
// Subir foto, video o PDF (queda guardado en el PC y se usa al enviar)
async function subirAdjunto(file) {
  const r = await fetch('/api/adjuntos', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(file.name || 'archivo') }, body: file });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { bloquear('expirada'); throw new Error('Sesión bloqueada'); }
  if (!r.ok) throw new Error(j.error || 'No se pudo subir el archivo');
  return j.adjunto;
}
function adjuntoHTML(a) {
  const url = '/api/adjuntos/' + a.id;
  const vista = /^image\//.test(a.mime) ? `<img src="${url}" alt="">` : /^video\//.test(a.mime) ? `<video src="${url}" muted preload="metadata"></video>` : '<span style="font-size:28px">📄</span>';
  return `${vista}<div class="grow" style="min-width:0"><b class="ell" style="display:block">${esc(a.nombre)}</b><span class="small muted">${/^video\//.test(a.mime) ? 'Video' : /^image\//.test(a.mime) ? 'Foto' : 'PDF'} · ${pesoTxt(a.tam)} · el texto va como descripción</span></div>`;
}
const pesoTxt = (n) => !n ? '' : n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

// ---------------- Envíos ----------------
let dest = [], segN = 0, segMuestra = [], pvI = 0, vers = [''], ultimoTxt = null, adjEnv = null;
const pick = (row, keys) => { for (const k of Object.keys(row)) { const n = k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); if (keys.some((x) => n.includes(x))) return row[k]; } return ''; };
const txtActivo = () => (ultimoTxt && document.body.contains(ultimoTxt) ? ultimoTxt : document.querySelector('#eVersiones textarea'));
function renderVersiones() {
  const varias = vers.length > 1;
  $('eVersiones').innerHTML = vers.map((v, i) => `<div class="ver">${varias ? `<div class="verhd"><span>Versión ${i + 1}</span><button class="lnk" type="button" data-vdel="${i}">Quitar</button></div>` : ''}<label><span class="srh">${varias ? 'Versión ' + (i + 1) : 'Texto del mensaje'}</span><textarea rows="${varias ? 4 : 6}" data-ver="${i}" placeholder="${i ? 'Otra forma de decir lo mismo…' : 'Escribe tu mensaje. Usa {nombre}, {isapre}, {cargas}…'}">${esc(v)}</textarea></label></div>`).join('');
  $('eVersiones').querySelectorAll('[data-ver]').forEach((t) => { t.oninput = () => { vers[+t.dataset.ver] = t.value; renderPreview(); }; t.onfocus = () => (ultimoTxt = t); });
  $('eVersiones').querySelectorAll('[data-vdel]').forEach((b) => (b.onclick = () => { vers.splice(+b.dataset.vdel, 1); ultimoTxt = null; renderVersiones(); }));
  $('eAddVer').hidden = vers.length >= 5;
  $('eVerInfo').textContent = varias ? `${vers.length} versiones: a cada persona le llega una al azar.` : 'Con 2 o más versiones, a cada persona le llega una al azar. Así los mensajes no son idénticos.';
  renderPreview();
}
$('eAddVer').onclick = () => { if (vers.length >= 5) return; vers.push(''); renderVersiones(); const ts = document.querySelectorAll('#eVersiones textarea'); ts[ts.length - 1].focus(); };
$('eEmoji').onclick = () => selectorEmojis($('eEmoji'), (e) => insertarEn(txtActivo(), e));
$('eSeg').onfocus = () => (ultimoTxt = $('eSeg'));
$('eSeg').oninput = renderPreview;
$('eSegOn').onchange = () => { $('eSegBox').hidden = !$('eSegOn').checked; if ($('eSegOn').checked) $('eSeg').focus(); renderPreview(); };
$('eAdj').onclick = () => $('eAdjFile').click();
$('eAdjFile').onchange = async () => {
  const f = $('eAdjFile').files[0]; $('eAdjFile').value = ''; if (!f) return;
  $('eAdj').disabled = true; $('eAdj').textContent = 'Subiendo…';
  try { adjEnv = await subirAdjunto(f); pintarAdjEnv(); } catch (e) { toast(e.message); }
  finally { $('eAdj').disabled = false; $('eAdj').textContent = '📎 Foto o video'; }
};
function pintarAdjEnv() {
  const b = $('eAdjBox'); b.hidden = !adjEnv;
  b.innerHTML = adjEnv ? adjuntoHTML(adjEnv) + '<button class="btn sm" id="eAdjX" type="button">Quitar</button>' : '';
  if ($('eAdjX')) $('eAdjX').onclick = () => { adjEnv = null; pintarAdjEnv(); };
  renderPreview();
}
async function loadEnvios() {
  cargarEtiquetas();
  CFG = await GET('/api/config');
  const masivo = puedo('masivos');
  $('eImport').hidden = !masivo; $('sOn').closest('.card').hidden = !masivo; if (!masivo) $('sOn').checked = false;
  $('qCancel').hidden = !esAdmin();
  $('sEtapa').innerHTML = '<option value="">Todas</option>' + ETAPAS.map((e) => `<option>${e}</option>`).join('');
  const d = await GET('/api/contactos?limite=1');
  const cur = $('sIsa').value; $('sIsa').innerHTML = '<option value="">Todas</option>' + d.isapres.map((x) => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
  $('eVars').innerHTML = ['{nombre}', '{apellido}', '{edad}', '{renta}', '{cargas}', '{isapre}'].map((v) => `<button class="var" type="button" data-var="${v}">${v}</button>`).join('');
  $('eVars').querySelectorAll('[data-var]').forEach((b) => (b.onmousedown = (ev) => { ev.preventDefault(); insertarEn(txtActivo(), b.dataset.var); }));
  if (!$('eWhen').value) { const d2 = new Date(Date.now() + 86400000); d2.setHours(10, 0, 0, 0); $('eWhen').value = new Date(d2 - d2.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  if (!$('eVersiones').children.length) renderVersiones();
  renderDest(); renderProgramados(); renderGrupos(); renderCola(); contarSeg();
}
function renderDest() {
  const max = 14;
  $('eChips').innerHTML = dest.slice(0, max).map((c, i) => `<span class="person"><b>${esc(nombreDe(c))}</b><span class="muted">${fmtTel(c.telefono)}</span><button data-rm="${i}" aria-label="Quitar">×</button></span>`).join('') + (dest.length > max ? `<span class="small muted" style="align-self:center">y ${dest.length - max} más</span>` : '') + (dest.length > 1 ? `<button class="chip" id="eClear">Quitar todos</button>` : '');
  $('eChips').querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { dest.splice(+b.dataset.rm, 1); renderDest(); }));
  if ($('eClear')) $('eClear').onclick = () => { dest = []; renderDest(); };
  const tot = dest.length + ($('sOn').checked ? segN : 0);
  $('eTotal').textContent = `${tot} contacto${tot === 1 ? '' : 's'}`;
  renderPreview();
}
$('eAdd').onclick = () => {
  const tel = normPhone($('eTel').value);
  if (!tel) { $('eMsg').textContent = 'Revisa el teléfono (ej: +56 9 1234 5678)'; return; }
  if (dest.some((d) => d.telefono === tel)) { $('eMsg').textContent = 'Ese número ya está en la lista'; return; }
  const [n, ...a] = $('eNom').value.trim().split(/\s+/);
  dest.push({ nombre: n || '', apellido: a.join(' '), telefono: tel, origen: 'manual' });
  $('eNom').value = ''; $('eTel').value = ''; $('eMsg').textContent = ''; $('eNom').focus(); renderDest();
};
$('eTel').onkeydown = (e) => { if (e.key === 'Enter') $('eAdd').click(); };
$('eImport').onclick = () => $('eFile').click();
// Elegir uno o varios contactos de WhatsApp (chats recientes y contactos guardados en el celular)
$('eWa').onclick = async () => {
  let todos = [], filtro = 'chats', q = '';
  const sel = new Map();
  const ya = new Set(dest.map((d) => d.telefono));
  modal(`<span class="eyebrow">Envíos · Destinatarios</span><h3>Elegir de WhatsApp</h3>
    <label class="bq" style="height:46px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M20 20l-4-4"/></svg><span class="srh">Buscar</span><input type="text" id="wQ" placeholder="Buscar por nombre o número" autocomplete="off"></label>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="chips"><button type="button" class="chip on" data-wf="chats">Chats recientes</button><button type="button" class="chip" data-wf="todos">Todos mis contactos</button></div><span class="grow"></span><button type="button" class="lnk" id="wTodos">Marcar todos los de la lista</button></div>
    <div id="wLista" style="max-height:46vh;overflow-y:auto;border:1px solid var(--line);border-radius:16px"><div class="empty">Cargando tus contactos de WhatsApp…</div></div>
    <span class="small muted" id="wInfo"></span>
    <div style="display:flex;gap:12px;justify-content:flex-end;align-items:center"><span class="small muted grow" id="wCuenta">Ninguno elegido</span><button class="btn" data-close>Cancelar</button><button class="btn pri" id="wOk" disabled>Agregar</button></div>`, async (box, close) => {
    box.classList.add('wide2');
    const visibles = () => {
      const t = q.toLowerCase(), dig = q.replace(/\D/g, '');
      return todos.filter((c) => (filtro === 'todos' || c.chat) && (!t || (c.nombre || '').toLowerCase().includes(t) || (dig.length >= 3 && c.telefono.includes(dig))));
    };
    const cuenta = () => { const n = sel.size; $('wCuenta').textContent = n ? `${n} elegido${n === 1 ? '' : 's'}` : 'Ninguno elegido'; $('wOk').disabled = !n; $('wOk').textContent = n ? `Agregar ${n}` : 'Agregar'; };
    const pintar = () => {
      const v = visibles().slice(0, 400);
      $('wLista').innerHTML = v.length ? v.map((c) => {
        const bloq = c.baja || ya.has(c.telefono);
        return `<label class="li" style="cursor:${bloq ? 'default' : 'pointer'};opacity:${bloq ? 0.55 : 1}"><input type="checkbox" data-wt="${c.telefono}" ${sel.has(c.telefono) || ya.has(c.telefono) ? 'checked' : ''} ${bloq ? 'disabled' : ''}><span class="av" style="width:36px;height:36px;font-size:13px">${esc(ini(...String(c.nombre || '?').split(/\s+/)))}</span><div class="grow" style="min-width:0"><b class="ell" style="display:block">${esc(c.nombre || fmtTel(c.telefono))}</b><span class="small muted">${fmtTel(c.telefono)}${c.etapa ? ' · ' + esc(c.etapa) : ''}${c.fecha ? ' · último chat ' + hora(c.fecha) : ''}</span></div>${c.baja ? '<span class="pill p-bad">Pidió BAJA</span>' : ya.has(c.telefono) ? '<span class="pill p-mut">Ya en la lista</span>' : ''}</label>`;
      }).join('') + (visibles().length > 400 ? '<div class="small muted" style="padding:10px 20px">Se muestran 400. Escribe para encontrar a los demás.</div>' : '') : `<div class="empty">${filtro === 'chats' ? 'No hay chats con ese nombre. Prueba en "Todos mis contactos".' : 'Sin resultados'}</div>`;
      $('wLista').querySelectorAll('[data-wt]').forEach((x) => (x.onchange = () => { const c = todos.find((y) => y.telefono === x.dataset.wt); if (x.checked) sel.set(c.telefono, c); else sel.delete(c.telefono); cuenta(); }));
    };
    box.querySelectorAll('[data-wf]').forEach((b) => (b.onclick = () => { filtro = b.dataset.wf; box.querySelectorAll('[data-wf]').forEach((y) => y.classList.toggle('on', y === b)); pintar(); }));
    $('wQ').oninput = () => { q = $('wQ').value.trim(); pintar(); };
    $('wTodos').onclick = () => { for (const c of visibles()) if (!c.baja && !ya.has(c.telefono)) sel.set(c.telefono, c); pintar(); cuenta(); };
    $('wOk').onclick = () => {
      for (const c of sel.values()) { const [n, ...a] = String(c.nombre && !/^\+?[\d\s]+$/.test(c.nombre) ? c.nombre : '').split(/\s+/); dest.push({ nombre: n || '', apellido: a.join(' '), telefono: c.telefono, origen: 'whatsapp' }); }
      const n = sel.size; close(); renderDest(); $('eMsg').textContent = `${n} contacto${n === 1 ? '' : 's'} de WhatsApp agregado${n === 1 ? '' : 's'}.`;
    };
    $('wQ').focus();
    const d = await GET('/api/wa/contactos').catch(() => null);
    if (!$('wLista')) return;
    if (!d) { $('wLista').innerHTML = '<div class="empty">No se pudieron leer tus contactos</div>'; return; }
    todos = d.contactos;
    $('wInfo').textContent = d.wa !== 'listo' ? 'WhatsApp no está conectado: se muestran solo los chats guardados en el programa.' : `${todos.filter((c) => c.chat).length} chats recientes · ${d.deCelular} contactos guardados en tu celular. Los que pidieron BAJA no se pueden elegir.`;
    pintar(); cuenta();
  });
};
$('eFile').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return; e.target.value = '';
  const r = new FileReader();
  r.onload = async (ev) => {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      let inval = 0, dup = 0; const filas = [];
      for (const row of rows) {
        const tel = normPhone(pick(row, ['telefono', 'celular', 'fono', 'phone', 'whatsapp', 'numero']));
        if (!tel) { inval++; continue; }
        const c = { nombre: String(pick(row, ['nombre', 'name'])).trim(), apellido: String(pick(row, ['apellido'])).trim(), telefono: tel, edad: pick(row, ['edad']), renta: pick(row, ['sueldo', 'renta']), cargas: String(pick(row, ['carga'])).trim(), isapre: String(pick(row, ['isapre', 'prevision', 'fonasa'])).trim(), origen: 'excel' };
        filas.push(c);
        if (dest.some((d) => d.telefono === tel)) { dup++; continue; }
        dest.push(c);
      }
      const res = await POST('/api/contactos/importar', { filas });
      $('eMsg').textContent = `${f.name}: ${filas.length - dup} agregados${dup ? `, ${dup} repetidos` : ''}${inval ? `, ${inval} sin teléfono válido` : ''}. Guardados en tus contactos (${res.nuevos} nuevos).`;
      renderDest();
    } catch { $('eMsg').textContent = 'No se pudo leer el archivo. Revisa que la primera fila tenga los nombres de las columnas.'; }
  };
  r.readAsArrayBuffer(f);
};
const segFiltros = () => ({ etiqueta: $('sEtq').value, etapa: $('sEtapa').value, calificacion: $('sCal').value, isapre: $('sIsa').value, cargas: $('sCar').value, edadMin: $('sEMin').value, edadMax: $('sEMax').value, rentaMin: $('sRMin').value });
async function contarSeg() {
  const d = await POST('/api/segmento', { filtros: segFiltros() }).catch(() => ({ n: 0, muestra: [] }));
  segN = d.n; segMuestra = d.muestra; $('sCount').textContent = `+${segN} contactos`;
  $('sFilters').style.opacity = $('sOn').checked ? 1 : 0.5; renderDest();
}
['sEtapa', 'sCal', 'sIsa', 'sCar', 'sEtq', 'sOn'].forEach((id) => ($(id).onchange = () => { if (id !== 'sOn') $('sOn').checked = true; contarSeg(); }));
['sEMin', 'sEMax', 'sRMin'].forEach((id) => ($(id).oninput = () => { $('sOn').checked = true; clearTimeout(contarSeg._t); contarSeg._t = setTimeout(contarSeg, 300); }));
function renderPreview() {
  const lista = [...dest, ...($('sOn').checked ? segMuestra : [])];
  const vs = vers.map((v) => v.trim()).filter(Boolean);
  const seg = $('eSegOn').checked ? $('eSeg').value.trim() : '';
  const caja = $('pvBox');
  if (!lista.length || (!vs.length && !adjEnv)) { $('pvName').textContent = 'Vista previa'; $('pvPos').textContent = ''; caja.innerHTML = `<div class="b out">${!vs.length && !adjEnv ? 'Escribe el mensaje para verlo aquí.' : 'Agrega destinatarios para ver cómo le llega a cada uno.'}</div>`; return; }
  pvI = Math.min(pvI, lista.length - 1); const c = lista[pvI];
  const vi = vs.length ? pvI % vs.length : 0;
  $('pvName').textContent = nombreDe(c); $('pvPos').textContent = `${pvI + 1} de ${lista.length}${$('sOn').checked && segN > segMuestra.length ? ' (muestra)' : ''}${vs.length > 1 ? ` · ejemplo con versión ${vi + 1}` : ''}`;
  const media = adjEnv ? (/^image\//.test(adjEnv.mime) ? `<img class="pvimg" src="/api/adjuntos/${adjEnv.id}" alt="">` : /^video\//.test(adjEnv.mime) ? `<video class="pvimg" src="/api/adjuntos/${adjEnv.id}" muted preload="metadata"></video>` : '<div>📄 ' + esc(adjEnv.nombre) + '</div>') : '';
  caja.innerHTML = `<div class="b out">${media}${vs.length ? `<span>${esc(fill(vs[vi], c))}</span>` : ''}</div>` + (seg ? `<div class="b out">${esc(fill(seg, c))}</div>` : '');
}
$('pvPrev').onclick = () => { const n = dest.length + ($('sOn').checked ? segMuestra.length : 0); if (n) { pvI = (pvI - 1 + n) % n; renderPreview(); } };
$('pvNext').onclick = () => { const n = dest.length + ($('sOn').checked ? segMuestra.length : 0); if (n) { pvI = (pvI + 1) % n; renderPreview(); } };
$('eUsarM1').onclick = () => { vers[0] = CFG.secuencia.pasos[0].texto; renderVersiones(); };
async function enviar(programar) {
  const versiones = vers.map((v) => v.trim()).filter(Boolean);
  const texto = versiones[0] || '';
  const segundo = $('eSegOn').checked ? $('eSeg').value.trim() : '';
  const total = dest.length + ($('sOn').checked ? segN : 0);
  if (!texto && !adjEnv) return ($('eRes').textContent = 'Escribe el mensaje o adjunta una foto o video.');
  const detalle = [versiones.length > 1 ? `${versiones.length} versiones al azar` : '', adjEnv ? (/^video\//.test(adjEnv.mime) ? 'con video' : 'con foto') : '', segundo ? 'con segundo mensaje' : ''].filter(Boolean).join(' · ');
  if (!total) return ($('eRes').textContent = 'Agrega al menos un destinatario o activa un segmento.');
  let cuando = null;
  if (programar) { cuando = new Date($('eWhen').value); if (isNaN(cuando) || cuando < new Date()) return ($('eRes').textContent = 'Elige una fecha y hora futura.'); }
  const segmento = $('sOn').checked ? segFiltros() : null;
  const boton = $(programar ? 'eProg' : 'eNow'), txtBoton = boton.textContent;
  boton.disabled = true; boton.textContent = 'Preparando lista…';
  let vista;
  try { vista = await POST('/api/envios/vista', { destinatarios: dest, segmento }); }
  catch (e) { $('eRes').textContent = e.message; return; }
  finally { boton.disabled = false; boton.textContent = txtBoton; }
  if (!vista.lista.length) return ($('eRes').textContent = 'No hay destinatarios válidos.');
  const grupos = await GET('/api/tandas').catch(() => ({ tandas: [] }));
  const elegidos = await confirmarLista(vista.lista, { programar, cuando, detalle, hayGrupos: grupos.tandas.some((t) => t.pendientes > 0) });
  if (!elegidos) return;
  try {
    const d = await POST('/api/envios', { destinatarios: dest, segmento, excluir: elegidos.excluir, incluir: elegidos.incluir, texto, versiones, adjunto: adjEnv ? adjEnv.id : null, segundo, secuencia: $('eSeq').checked, noRepetir: $('eNoRep').checked, cuando: cuando ? cuando.toISOString() : null, nombre: $('eProgNom').value.trim() || null, modo: elegidos.modo });
    $('eRes').textContent = (programar ? `Programado para ${fechaLarga(cuando)} (${d.total} contactos).` : `${d.total} mensajes en la cola. Puedes seguir trabajando mientras se envían.`) + (d.total < elegidos.incluir.length ? ` ${elegidos.incluir.length - d.total} quedaron fuera porque pidieron la baja mientras revisabas.` : '');
    dest = []; renderDest(); renderProgramados(); renderGrupos();
  } catch (e) { $('eRes').textContent = e.message; }
}
// Ventana de confirmación con la lista completa: se puede desmarcar a quien no va.
// Devuelve { excluir, incluir, modo } (desmarcados, marcados y Después/Corriendo), o null si se canceló.
const MAX_FILAS = 200;
function confirmarLista(todos, { programar, cuando, detalle, hayGrupos }) {
  const lista = [...todos].sort((a, b) => (b.avisos.length > 0) - (a.avisos.length > 0));   // los que tienen aviso, arriba
  const auto = new Set(lista.filter((c) => c.avisos.some((a) => a.desmarcar)).map((c) => c.telefono));
  const fuera = new Set(auto);
  let filtro = '';
  const r = CFG.reglas;
  const visibles = () => { const q = filtro.trim().toLowerCase(), qd = q.replace(/\D/g, ''); return q ? lista.filter((c) => nombreDe(c).toLowerCase().includes(q) || (qd && c.telefono.includes(qd))) : lista; };
  return new Promise((res) => modal(`<h3>${programar ? 'Programar envío' : 'Enviar ahora'}</h3>
    <p style="margin:0" id="clRes"></p>
    ${detalle ? `<p style="margin:0">Mensaje: ${detalle}.</p>` : ''}
    ${$('eSeq').checked ? '<p style="margin:0" class="muted">Quienes no respondan recibirán los seguimientos automáticos.</p>' : ''}
    <div class="small" id="clAuto"></div>
    ${hayGrupos || programar ? `<div style="display:flex;flex-direction:column;gap:8px" id="clModo">${hayGrupos ? '<span class="small">Ya hay otro grupo en la cola de envío.</span>' : '<span class="small">Si a esa hora hay otro grupo en la cola:</span>'}
      <label class="opc on"><input type="radio" name="clModo" value="despues" checked><span><b>Después</b><span class="small muted" style="display:block">Empieza cuando terminen los grupos que ya están en la cola.</span></span></label>
      <label class="opc"><input type="radio" name="clModo" value="corriendo"><span><b>Corriendo</b><span class="small muted" style="display:block">Sale al mismo tiempo que los otros, con su propio ritmo.</span></span></label></div>` : ''}
    <div class="clbar"><input type="text" id="clQ" placeholder="Buscar por nombre o teléfono"><button class="lnk" id="clTodos">Marcar todos</button><button class="lnk" id="clNinguno">Desmarcar todos</button></div>
    <div class="clista" id="clLista"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px"><button class="btn" id="cNo">Cancelar</button><button class="btn pri" id="cSi"></button></div>`, (b, close) => {
    b.classList.add('ancho');
    const pintar = () => {
      const n = lista.length - fuera.size, k = [...auto].filter((t) => fuera.has(t)).length, vs = visibles();
      $('clRes').innerHTML = `Se enviará a <b>${n} de ${lista.length} contacto${lista.length === 1 ? '' : 's'}</b>${programar ? ` el <b>${esc(fechaLarga(cuando))}</b>` : ''}, con pausas de ${r.esperaMin} a ${r.esperaMax} segundos entre cada uno y solo dentro del horario permitido.`;
      $('clAuto').innerHTML = k ? `${k} desmarcado${k === 1 ? '' : 's'} por aviso · <button class="lnk" id="clVolver">Marcarlos de nuevo</button>` : '';
      if (k) $('clVolver').onclick = () => { auto.forEach((t) => fuera.delete(t)); pintar(); };
      $('clLista').innerHTML = vs.slice(0, MAX_FILAS).map((c) => `<label class="clrow${fuera.has(c.telefono) ? ' off' : ''}"><input type="checkbox" data-t="${esc(c.telefono)}"${fuera.has(c.telefono) ? '' : ' checked'}><span class="grow ell">${esc(nombreDe(c))}</span><span class="small muted">${esc(fmtTel(c.telefono))}</span>${c.etapa && !['Ingresado', 'Perdido'].includes(c.etapa) ? `<span class="pill p-mut">${esc(c.etapa)}</span>` : ''}${c.avisos.map((a) => `<span class="pill ${a.desmarcar ? 'p-terra' : 'p-mut'}">${esc(a.texto)}</span>`).join('')}</label>`).join('')
        + (vs.length > MAX_FILAS ? `<div class="small muted clmas">… y ${vs.length - MAX_FILAS} más: usa el buscador</div>` : '')
        + (!vs.length ? '<div class="small muted clmas">Nadie coincide con la búsqueda</div>' : '');
      $('cSi').textContent = `${programar ? 'Programar para' : 'Enviar a'} ${n}`;
      $('cSi').disabled = !n;
    };
    $('clLista').onchange = (e) => { const t = e.target.dataset.t; if (!t) return; if (e.target.checked) fuera.delete(t); else fuera.add(t); pintar(); };
    $('clQ').oninput = (e) => { filtro = e.target.value; pintar(); };
    if ($('clModo')) $('clModo').onchange = () => $('clModo').querySelectorAll('.opc').forEach((o) => o.classList.toggle('on', o.querySelector('input').checked));
    $('clTodos').onclick = () => { visibles().forEach((c) => fuera.delete(c.telefono)); pintar(); };
    $('clNinguno').onclick = () => { visibles().forEach((c) => fuera.add(c.telefono)); pintar(); };
    $('cNo').onclick = () => { close(); res(null); };
    $('cSi').onclick = () => { const m = b.querySelector('input[name=clModo]:checked'); res({ excluir: [...fuera], incluir: lista.filter((c) => !fuera.has(c.telefono)).map((c) => c.telefono), modo: m ? m.value : 'despues' }); close(); };
    pintar();
  }, () => res(null)));
}
$('eNow').onclick = () => enviar(false);
$('eProg').onclick = () => enviar(true);
async function renderProgramados() {
  const d = await GET('/api/programados').catch(() => ({ programados: [] }));
  $('eProgCard').hidden = !d.programados.length;
  $('eProgList').innerHTML = d.programados.length ? d.programados.map((p) => `<div class="li" style="flex-direction:column;align-items:stretch;gap:6px"><div style="display:flex;justify-content:space-between;gap:10px"><b>${esc(p.nombre)}</b><span class="pill p-mut">Programada</span></div><span class="small muted ell">${fechaLarga(p.fecha)} · ${p.total} contactos${p.extra && p.extra.versiones ? ` · ${p.extra.versiones.length} versiones` : ''}${p.extra && p.extra.adjunto ? ' · 📎' : ''}${p.extra && p.extra.segundo ? ' · 2 mensajes' : ''} · ${esc(p.texto)}</span><div style="display:flex;gap:14px"><button class="btn" data-pl="${p.id}">Ver lista</button><button class="btn" data-pe="${p.id}">Editar</button><button class="btn danger" data-pc="${p.id}">Cancelar</button></div></div>`).join('') : '';
  $('eProgList').querySelectorAll('[data-pl]').forEach((b) => (b.onclick = () => verProgramado(parseInt(b.dataset.pl))));
  $('eProgList').querySelectorAll('[data-pc]').forEach((b) => (b.onclick = async () => { if (await confirmar('No saldrá a la hora programada.', { titulo: '¿Cancelar este envío programado?', si: 'Cancelar envío', no: 'Volver', peligro: true })) { await DEL('/api/programados/' + b.dataset.pc); renderProgramados(); } }));
  $('eProgList').querySelectorAll('[data-pe]').forEach((b) => (b.onclick = () => { const p = d.programados.find((x) => x.id == b.dataset.pe); const fp = new Date(p.fecha); const loc = new Date(fp - fp.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    modal(`<h3>Editar envío programado</h3><label class="f">Nombre<input type="text" id="pN" value="${esc(p.nombre)}"></label><label class="f">Fecha y hora<input type="datetime-local" id="pF" value="${loc}"></label><label class="f">Mensaje<textarea id="pT" rows="6">${esc(p.texto)}</textarea></label><div style="display:flex;justify-content:flex-end;gap:10px"><button class="btn" data-close>Cancelar</button><button class="btn pri" id="pS">Guardar</button></div>`, (bx, close) => {
      $('pS').onclick = async () => { const f = new Date($('pF').value); if (isNaN(f)) return; await PATCH('/api/programados/' + p.id, { nombre: $('pN').value, texto: $('pT').value, fecha: f.toISOString() }); close(); renderProgramados(); };
    }); }));
}
// ---------- Tandas: avance de cada envío y la lista por estado ----------
const PESTANAS = [['pend', 'Pendientes', (e) => e === 'pendiente' || e === 'enviando'], ['env', 'Enviados', (e) => e === 'enviado'], ['omi', 'Omitidos y sacados', (e) => ['omitido', 'sacado', 'cancelado'].includes(e)], ['err', 'Errores', (e) => e === 'error'], ['todos', 'Todos', () => true]];
const ESTADO_FILA = { pendiente: ['p-mut', 'Pendiente'], enviando: ['p-info', 'Sale ahora'], enviado: ['p-ok', 'Enviado'], omitido: ['p-mut', 'Omitido'], sacado: ['p-mut', 'Sacado'], cancelado: ['p-mut', 'Cancelado'], error: ['p-bad', 'Error'] };
const PILL_TANDA = { Enviando: 'p-info', 'En pausa': 'p-mut', 'Espera su turno': 'p-mut', 'En espera': 'p-warn', Terminada: 'p-ok', Cancelada: 'p-mut' };
// Los grupos con pendientes, dentro de la tarjeta Cola de envío; al presionar uno se abre su lista
async function renderGrupos() {
  const d = await GET('/api/tandas').catch(() => null); if (!d) return;
  const vivos = d.tandas.filter((t) => t.pendientes > 0).reverse();   // el más antiguo arriba: sale primero
  const sig = JSON.stringify(vivos.map((t) => [t.id, t.nombre, t.pendientes, t.enviados, t.estadoTexto, t.despuesDe, t.modo])); if (renderGrupos.sig === sig) return; renderGrupos.sig = sig;
  $('qGrupos').innerHTML = vivos.map((t) => {
    const hechos = t.total - t.pendientes, pct = t.total ? Math.round((hechos / t.total) * 100) : 0;
    const modo = t.despuesDe ? `después de «${esc(t.despuesDe)}»` : t.modo === 'corriendo' ? 'corriendo' : '';
    return `<button type="button" class="grupo" data-tv="${t.id}">
      <span style="display:flex;justify-content:space-between;gap:10px;align-items:center"><b class="ell">${esc(t.nombre)}</b><span class="pill ${PILL_TANDA[t.estadoTexto] || 'p-mut'}">${t.estadoTexto}</span></span>
      <span class="bar"><span style="display:block;height:100%;width:${pct}%;background:var(--terra)"></span></span>
      <span class="small muted">${hechos} de ${t.total}${t.usuario ? ' · ' + esc(t.usuario) : ''} · ${esc(fechaLarga(t.creada))}${modo ? ' · <b>' + modo + '</b>' : ''}</span></button>`;
  }).join('');
  $('qGrupos').querySelectorAll('[data-tv]').forEach((b) => (b.onclick = () => verTanda(parseInt(b.dataset.tv))));
}
// La pestañita: la lista de un grupo por estado. Los pendientes se ordenan arrastrando desde ≡ y tienen «No enviar»
async function verTanda(id, pestana = 'pend') {
  let d, filtro = '', preguntando = null, arrastrado = null;
  const cargar = async () => { d = await GET('/api/tandas/' + id); };
  try { await cargar(); } catch (e) { return toast(e.message); }
  modal(`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 class="ell grow" id="tvNombre" style="margin:0"></h3><span id="tvAcc" style="display:flex;gap:8px"></span></div><div class="chips" id="tvTabs"></div><input type="text" id="tvQ" placeholder="Buscar por nombre o teléfono"><span class="small muted" id="tvAyuda"></span><div class="clista" id="tvLista"></div><div style="display:flex;justify-content:flex-end"><button class="btn" data-close>Cerrar</button></div>`, (b, close) => {
    b.classList.add('ancho');
    const ordenable = () => pestana === 'pend' && !filtro.trim() && d.tanda.puedeManejar && d.tanda.estado !== 'cancelada';
    const pintar = () => {
      if (!$('tvLista')) return;
      $('tvNombre').textContent = d.tanda.nombre;
      const quedan = d.items.some((x) => x.estado === 'pendiente');
      $('tvAcc').innerHTML = d.tanda.puedeManejar && quedan && d.tanda.estado !== 'cancelada' ? `<button class="btn sm" id="tvPausa">${d.tanda.pausada ? 'Reanudar' : 'Pausar este grupo'}</button><button class="btn sm danger" id="tvCancel">Cancelar grupo</button>` : '';
      $('tvAyuda').textContent = ordenable() && quedan ? 'Arrastra desde ≡ para cambiar el orden dentro del grupo.' : '';
      $('tvTabs').innerHTML = PESTANAS.map(([k, nom, f]) => `<button class="chip${k === pestana ? ' on' : ''}" data-k="${k}">${nom} (${d.items.filter((x) => f(x.estado)).length})</button>`).join('');
      const f = PESTANAS.find((p) => p[0] === pestana)[2], q = filtro.trim().toLowerCase(), qd = q.replace(/\D/g, '');
      const vs = d.items.filter((x) => f(x.estado) && (!q || (x.nombre || '').toLowerCase().includes(q) || (qd && x.telefono.includes(qd))));
      $('tvLista').innerHTML = vs.slice(0, MAX_FILAS).map((x, i) => {
        const [cls, txt] = ESTADO_FILA[x.estado] || ['p-mut', x.estado];
        const acciones = x.estado === 'pendiente' && d.tanda.puedeManejar
          ? (preguntando === x.id
            ? `<div class="clpreg"><span class="small">¿Sacarlo también de los seguimientos automáticos?</span><button class="btn sm" data-si="${x.id}">Sí, también</button><button class="btn sm" data-solo="${x.id}">Solo de esta tanda</button><button class="lnk" data-volver>Volver</button></div>`
            : `<button class="btn sm danger" data-no="${x.id}">No enviar</button>`)
          : '';
        const asa = x.estado === 'pendiente' && ordenable() ? '<span class="asa" draggable="true" title="Arrastra para cambiar el orden">≡</span>' : '';
        return `<div class="clrow" data-id="${x.id}" data-est="${x.estado}">${asa}<span class="small muted">${i + 1}</span><span class="grow ell">${esc(nombreDe(x))}</span><span class="small muted">${esc(fmtTel(x.telefono))}</span>${x.escribio ? `<span class="pill p-terra">${esc(x.escribio)}</span>` : ''}<span class="pill ${cls}" title="${esc(x.detalle || '')}">${txt}</span>${acciones}</div>`;
      }).join('') + (vs.length > MAX_FILAS ? `<div class="small muted clmas">… y ${vs.length - MAX_FILAS} más: usa el buscador</div>` : '') + (!vs.length ? '<div class="small muted clmas">No hay nadie aquí</div>' : '');
    };
    const recargar = async () => { try { await cargar(); } catch {} pintar(); renderGrupos.sig = null; renderGrupos(); };
    const sacar = async (itemId, seguimientos) => {
      const r = await POST(`/api/tandas/item/${itemId}/sacar`, { seguimientos }).catch((e) => { toast(e.message); return null; });
      if (r && r.resultado === 'ya_salio') toast(seguimientos ? 'Ya se estaba enviando. Los seguimientos automáticos quedaron detenidos.' : 'Ya se estaba enviando');
      preguntando = null; recargar();
    };
    $('tvTabs').onclick = (e) => { const k = e.target.dataset.k; if (k) { pestana = k; pintar(); } };
    $('tvQ').oninput = (e) => { filtro = e.target.value; pintar(); };
    $('tvLista').onclick = async (e) => {
      const ds = e.target.dataset;
      if (ds.no) { preguntando = parseInt(ds.no); pintar(); }
      else if (e.target.hasAttribute('data-volver')) { preguntando = null; pintar(); }
      else if (ds.si) sacar(ds.si, true);
      else if (ds.solo) sacar(ds.solo, false);
    };
    $('tvAcc').onclick = async (e) => {
      if (e.target.id === 'tvPausa') { await POST(`/api/tandas/${id}/pausa`, { pausada: !d.tanda.pausada }).catch((er) => toast(er.message)); recargar(); }
      if (e.target.id === 'tvCancel') { if (!(await confirmar('Los que ya salieron no cambian.', { titulo: '¿Cancelar los mensajes que faltan de este grupo?', si: 'Cancelar grupo', no: 'Volver', peligro: true }))) return; await POST(`/api/tandas/${id}/cancelar`).catch((er) => toast(er.message)); recargar(); }
    };
    // Arrastrar desde ≡: se suelta arriba o abajo de otra fila pendiente y el orden se guarda al tiro
    const lista = $('tvLista');
    const limpiar = () => lista.querySelectorAll('.sobre,.sobre-abajo,.arrastrando').forEach((x) => x.classList.remove('sobre', 'sobre-abajo', 'arrastrando'));
    const destino = (e) => { const f = e.target.closest('.clrow[data-est="pendiente"]'); return f && f.dataset.id != arrastrado ? f : null; };
    lista.addEventListener('dragstart', (e) => { const f = e.target.closest('.clrow'); if (!f || !e.target.classList.contains('asa')) return; arrastrado = f.dataset.id; f.classList.add('arrastrando'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', arrastrado); e.dataTransfer.setDragImage(f, 20, 16); });
    lista.addEventListener('dragover', (e) => { if (!arrastrado) return; const f = destino(e); if (!f) return; e.preventDefault(); const r = f.getBoundingClientRect(), abajo = e.clientY > r.top + r.height / 2; lista.querySelectorAll('.sobre,.sobre-abajo').forEach((x) => x.classList.remove('sobre', 'sobre-abajo')); f.classList.add(abajo ? 'sobre-abajo' : 'sobre'); });
    lista.addEventListener('dragend', () => { arrastrado = null; limpiar(); });
    lista.addEventListener('drop', async (e) => {
      const f = destino(e); if (!arrastrado || !f) return; e.preventDefault();
      const abajo = f.classList.contains('sobre-abajo'), mov = arrastrado; arrastrado = null; limpiar();
      const ids = d.items.filter((x) => x.estado === 'pendiente').map((x) => String(x.id)).filter((x) => x !== mov);
      ids.splice(ids.indexOf(f.dataset.id) + (abajo ? 1 : 0), 0, mov);
      const porId = new Map(d.items.map((x) => [String(x.id), x]));
      d.items = [...d.items.filter((x) => x.estado !== 'pendiente'), ...ids.map((x) => porId.get(x))].sort((a, b) => (a.estado === 'pendiente') - (b.estado === 'pendiente'));
      pintar();
      try { await PUT(`/api/tandas/${id}/orden`, { ids: ids.map(Number) }); } catch (er) { toast(er.message); }
      recargar();
    });
    // Mientras esté abierta, se actualiza sola (sin interrumpir una pregunta ni un arrastre en curso)
    verTanda.refrescar = async () => { if (!$('tvLista') || preguntando || arrastrado) return; await cargar().catch(() => {}); pintar(); };
    pintar();
  }, () => { verTanda.refrescar = null; });
}
// Lista de un envío programado: se puede sacar a alguien antes de que salga
async function verProgramado(id) {
  let d; try { d = await GET(`/api/programados/${id}/lista`); } catch (e) { return toast(e.message); }
  modal(`<h3 class="ell">${esc(d.nombre)}</h3><p class="small muted" style="margin:0" id="vpN"></p><div class="clista" id="vpLista"></div><div style="display:flex;justify-content:flex-end"><button class="btn" data-close>Cerrar</button></div>`, (b) => {
    b.classList.add('ancho');
    const pintar = () => {
      $('vpN').textContent = `Programada para ${d.items.length} contacto${d.items.length === 1 ? '' : 's'}`;
      $('vpLista').innerHTML = d.items.slice(0, MAX_FILAS).map((c, i) => `<div class="clrow"><span class="small muted">${i + 1}</span><span class="grow ell">${esc(c.nombre || fmtTel(c.telefono))}</span><span class="small muted">${esc(fmtTel(c.telefono))}</span>${d.puedeManejar ? `<button class="btn sm danger" data-t="${esc(c.telefono)}">No enviar</button>` : ''}</div>`).join('') + (d.items.length > MAX_FILAS ? `<div class="small muted clmas">… y ${d.items.length - MAX_FILAS} más</div>` : '');
    };
    $('vpLista').onclick = async (e) => {
      const t = e.target.dataset.t; if (!t) return;
      await POST(`/api/programados/${id}/quitar`, { telefono: t }).catch((er) => toast(er.message));
      d.items = d.items.filter((c) => c.telefono !== t); pintar(); renderProgramados();
    };
    pintar();
  });
}
const TIPO = { masivo: 'Envío', programado: 'Programado', seguimiento1: 'Seguimiento 1', seguimiento2: 'Seguimiento 2', meta: 'Mensaje 1 (Meta)', agendado: 'Agendado' };
function renderCola() {
  if (!EST) return; const q = EST.cola;
  const det = q.porTipo.map((t) => `${t.n} ${TIPO[t.tipo] || t.tipo}`).join(' · ');
  $('qInfo').textContent = q.pendientes ? `${q.pendientes} pendientes` : 'Sin pendientes';
  $('qBar').style.width = Math.min(100, (q.enviadosHoy / Math.max(1, q.limite)) * 100) + '%';
  const secs = q.nextAt ? Math.max(0, Math.round((q.nextAt - Date.now()) / 1000)) : null;
  $('qEspera').innerHTML = q.pausada ? `<span style="color:var(--warn)">${esc(q.estadoTexto || 'En pausa')}</span>` : q.espera ? `<span style="color:var(--warn)">${esc(q.espera)}</span>` : q.pendientes ? (secs != null ? `Próximo en ${secs > 90 ? Math.round(secs / 60) + ' min' : secs + ' s'} · ${esc(det)}` : 'Enviando… · ' + esc(det)) : `Hoy: ${q.enviadosHoy} de ${q.limite}`;
  $('qPause').textContent = q.pausada ? 'Reanudar todo' : 'Pausar todo';
  const sig = JSON.stringify(EST.eventos.slice(-40));
  if (renderCola.sig !== sig) { renderCola.sig = sig; $('qLog').innerHTML = [...EST.eventos].reverse().slice(0, 40).map((e) => `<div><span class="muted">${e.hora}</span><span class="st-${e.estado}">${e.estado}</span><span class="grow">${esc(e.quien || '')}${e.detalle ? ' · ' + esc(e.detalle) : ''}</span>${e.tel ? `<button class="lnk" data-chat="${esc(e.tel)}">Abrir en WhatsApp</button>` : ''}</div>`).join('') || '<div class="muted" style="display:block">Aquí verás cada envío.</div>'; }
}
$('qPause').onclick = async () => { await POST('/api/cola/pausa', { pausada: !EST.cola.pausada }); poll(); };   // solo los envíos masivos: los seguimientos se pausan en Automáticos
$('qCancel').onclick = async () => {
  if (!(await confirmar('Los seguimientos automáticos se manejan aparte, en Automáticos.', { titulo: '¿Cancelar todos los envíos masivos pendientes?', si: 'Cancelar envíos', no: 'Volver', peligro: true }))) return;
  await POST('/api/cola/cancelar'); await poll();
  toast('Envíos cancelados.' + (EST.auto && EST.auto.pendientes ? ` Los ${EST.auto.pendientes} seguimientos siguen en Automáticos.` : ''), 5000);
};

// ---------------- Cotizador ----------------
// En el programa, miscotizadores va en su propia vista con la sesión guardada (como WhatsApp); syncVista la ubica sobre #cotizCaja.
// En un navegador común (pruebas) va incrustada. Se carga una sola vez: al cambiar de sección y volver, sigue donde quedó
const COTIZADOR = 'https://panel.miscotizadores.cl/dashboard';
function loadCotizador() {
  $('headActions').innerHTML = '<button class="btn" id="cotRec">Recargar</button><button class="btn" id="cotNav">Abrir en el navegador</button>';
  $('cotNav').onclick = () => window.open(COTIZADOR, '_blank');
  if (NATIVO && window.crmNativo.cotVista) { $('cotRec').onclick = () => window.crmNativo.cotRecargar(); syncVista(true); return; }
  let f = $('cotizCaja').querySelector('iframe');
  if (!f) { f = document.createElement('iframe'); f.title = 'Cotizador'; f.allow = 'clipboard-read; clipboard-write'; f.src = COTIZADOR; $('cotizCaja').appendChild(f); }
  $('cotRec').onclick = () => { f.src = COTIZADOR; };
}

// ---------------- Automáticos ----------------
async function loadAuto() {
  CFG = await GET('/api/config');
  const s = CFG.secuencia;
  $('headActions').innerHTML = '<button class="btn pri" id="aSave">Guardar secuencia</button>';
  const nombres = ['Mensaje 1', 'Seguimiento 1', 'Seguimiento 2'];
  $('aSteps').innerHTML = s.pasos.map((p, i) => `<article class="glass card"><div class="hd"><div><div class="small" style="color:var(--terra-d);font-weight:700;letter-spacing:.08em">PASO ${i + 1}</div><b style="font-size:16px">${nombres[i]}</b></div>${i ? `<label class="check" style="font-size:13px;color:var(--muted)">Activo<input type="checkbox" data-act="${i}" ${p.activo ? 'checked' : ''}></label>` : ''}</div>
    ${i ? `<div style="display:flex;align-items:flex-end;gap:10px"><label class="f">Si no responde en (horas)<input type="number" min="1" data-h="${i}" value="${p.horas}" style="width:120px"></label><span class="small muted" style="margin-bottom:11px">desde el Mensaje 1${i === 2 ? ' · último' : ''}</span></div>` : '<span class="small muted">Se envía al contactar: desde Envíos ("Usar Mensaje 1") y como primer mensaje a los leads de Meta.</span>'}
    <label class="f">Texto<textarea rows="10" data-t="${i}">${esc(p.texto)}</textarea></label></article>`).join('');
  $('fhOn').checked = CFG.fueraHorario.activa; $('fhTxt').value = CFG.fueraHorario.texto;
  const h = CFG.reglas.horario; const f = (x, n) => (x.on ? `${n} ${x.desde}–${x.hasta}` : `${n} cerrado`);
  $('fhInfo').innerHTML = `Se envía una vez al día cuando alguien escribe fuera de: ${f(h.lv, 'L–V')} · ${f(h.sab, 'Sáb')} · ${f(h.dom, 'Dom')}. <a href="#" data-go="config" class="lnk">Cambiar horario</a>`;
  $('aSave').onclick = guardarAuto;
  renderAgendados(); renderColaAuto(true);
}
// Automáticos en cola: seguimientos y Mensaje 1 de Meta, con su propia pausa (los agendados salen siempre a su hora)
let colaAutoAbierta = false;
async function renderColaAuto(forzar) {
  const el = $('aCola'); if (!el || !EST || !EST.auto) return;
  const a = EST.auto, sig = JSON.stringify(a) + colaAutoAbierta;
  if (!forzar && renderColaAuto.sig === sig) return; renderColaAuto.sig = sig;
  const det = a.porTipo.map((t) => `${t.n} ${TIPO[t.tipo] || t.tipo}`).join(' · ');
  const estado = a.pausada ? `<span style="color:var(--warn)">En pausa${a.pendientes ? ' · esperan ' + esc(det) : ''}</span>` : a.pendientes ? esc(det) + ' · salen de a uno, con las mismas pausas y el máximo diario' : 'Nada en cola: los seguimientos y el Mensaje 1 de Meta aparecen aquí mientras esperan salir';
  el.innerHTML = `<div class="hd"><div><h2>En cola ahora</h2><span class="small muted">Seguimientos y Mensaje 1 a leads de Meta que esperan salir</span></div><span class="small muted">${a.pendientes} pendiente${a.pendientes === 1 ? '' : 's'}</span></div>
    <span class="small">${estado}</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="acPausa">${a.pausada ? 'Reanudar seguimientos' : 'Pausar seguimientos'}</button>${a.pendientes && esAdmin() ? '<button class="btn sm danger" id="acCancel">Cancelar los de la cola</button>' : ''}${a.pendientes ? `<button class="btn sm" id="acVer">${colaAutoAbierta ? 'Ocultar' : 'Ver a quiénes'}</button>` : ''}</div>
    <div id="acLista" class="aclista" ${colaAutoAbierta && a.pendientes ? '' : 'hidden'}></div>`;
  $('acPausa').onclick = async () => { await POST('/api/auto/pausa', { pausada: !a.pausada }); await poll(); renderColaAuto(true); };
  if ($('acCancel')) $('acCancel').onclick = async () => {
    if (!(await confirmar('Esas personas salen de la secuencia de seguimiento.', { titulo: `¿Cancelar los ${a.pendientes} mensajes automáticos que esperan?`, si: 'Cancelar mensajes', no: 'Volver', peligro: true }))) return;
    const r = await POST('/api/auto/cancelar').catch((e) => { toast(e.message); return null; }); await poll(); renderColaAuto(true); if (r) toast(`Se cancelaron ${r.n} mensajes automáticos`);
  };
  if ($('acVer')) $('acVer').onclick = () => { colaAutoAbierta = !colaAutoAbierta; renderColaAuto(true); };
  if (colaAutoAbierta && a.pendientes) {
    const d = await GET('/api/auto/cola').catch(() => ({ items: [] }));
    $('acLista').innerHTML = d.items.map((x) => `<div class="li"><div class="grow" style="min-width:0"><b>${esc(nombreDe(x))}</b> <span class="small muted">${fmtTel(x.telefono)}</span></div><span class="pill p-mut">${esc(TIPO[x.tipo] || x.tipo)}</span><span class="small muted">desde ${esc(cuando(x.creado))}</span></div>`).join('') + (a.pendientes > d.items.length ? `<div class="small muted" style="padding:8px 20px">y ${a.pendientes - d.items.length} más</div>` : '');
  }
}
async function guardarAuto() {
  const s = CFG.secuencia;
  s.pasos.forEach((p, i) => { p.texto = document.querySelector(`[data-t="${i}"]`).value; if (i) { p.activo = document.querySelector(`[data-act="${i}"]`).checked; p.horas = Math.max(1, parseInt(document.querySelector(`[data-h="${i}"]`).value) || p.horas); } });
  if (s.pasos[2].horas <= s.pasos[1].horas) { toast('El seguimiento 2 debe salir después del seguimiento 1'); return; }
  await PUT('/api/config/secuencia', { valor: s });
  await PUT('/api/config/fueraHorario', { valor: { activa: $('fhOn').checked, texto: $('fhTxt').value } });
  toast('Cambios guardados. Aplican a todos los clientes.');
}

// ---------------- Mensajes agendados (Automáticos) ----------------
const ETIQ = { llamada: 'Confirmación de llamada', llamada_rec: 'Recordatorio de llamada', postventa: 'Bienvenida', control: 'Control postventa', referidos: 'Pedir referidos' };
async function renderAgendados() {
  const d = await GET('/api/agendados').catch(() => ({ agendados: [] }));
  const nombres = (l) => l.slice(0, 3).map((c) => esc(c.nombre || fmtTel(c.telefono))).join(', ') + (l.length > 3 ? ` y ${l.length - 3} más` : '');
  const EST = { enviado: ['p-ok', 'Enviado'], cancelado: ['p-mut', 'Cancelado'] };
  $('agList').innerHTML = d.agendados.length ? d.agendados.map((a) => {
    const pend = a.estado === 'pendiente';
    const etq = ETIQ[a.etiqueta];
    return `<div class="li agi ${pend ? '' : 'hecho'}"><span class="pill ${pend ? 'p-info' : EST[a.estado]?.[0] || 'p-mut'}">${pend ? fechaLarga(a.fecha) : (EST[a.estado]?.[1] || a.estado) + ' · ' + fechaLarga(a.fecha)}</span>
      <div class="grow" style="min-width:0"><b>${nombres(a.destinatarios)}</b>${etq ? ` <span class="pill p-mut">${etq}</span>` : ''}<div class="small muted ell">${a.adjuntoInfo ? '📎 ' : ''}${esc(a.texto || (a.adjuntoInfo ? a.adjuntoInfo.nombre : ''))}</div></div>
      ${pend ? `<button class="btn sm" data-age="${a.id}">Editar</button><button class="btn sm" data-agc="${a.id}">Cancelar</button>` : ''}</div>`;
  }).join('') : '<div class="empty">No hay mensajes agendados. Usa "Agendar mensaje" para avisarle algo a un cliente en una fecha y hora.</div>';
  $('agList').querySelectorAll('[data-agc]').forEach((b) => (b.onclick = async () => { if (!(await confirmar('No saldrá en la fecha agendada.', { titulo: '¿Cancelar este mensaje agendado?', si: 'Cancelar mensaje', no: 'Volver', peligro: true }))) return; await DEL('/api/agendados/' + b.dataset.agc); renderAgendados(); }));
  $('agList').querySelectorAll('[data-age]').forEach((b) => (b.onclick = () => agendarModal(d.agendados.find((x) => x.id == b.dataset.age))));
}
function agendarModal(a) {
  const edit = !!a;
  let lista = edit ? a.destinatarios.map((c) => ({ ...c })) : [];
  let adj = edit && a.adjuntoInfo ? { id: a.adjunto, nombre: a.adjuntoInfo.nombre, mime: a.adjuntoInfo.mime, tam: a.adjuntoInfo.tam } : null;
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; };
  const OPC = [['En 1 hora', () => new Date(Date.now() + 3600000)], ['Mañana 10:00', manana], ['En 2 días', () => { const d = manana(); d.setDate(d.getDate() + 1); return d; }], ['En 1 semana', () => { const d = manana(); d.setDate(d.getDate() + 6); return d; }]];
  modal(`<h3>${edit ? 'Editar mensaje agendado' : 'Agendar mensaje'}</h3>
    <div class="f" style="position:relative"><span>Clientes</span><input type="text" id="agQ" placeholder="Busca por nombre o escribe un teléfono…" autocomplete="off"><div class="sugs glass" id="agSug" hidden></div></div>
    <div class="chips" id="agDest"></div>
    <div class="tools"><div class="chips" id="agVars"></div><span class="grow"></span><button class="btn sm" id="agEmo" type="button">😊 Emojis</button><button class="btn sm" id="agAdj" type="button">📎 Foto, video o PDF</button><input type="file" id="agFile" accept="image/*,video/*,application/pdf" hidden></div>
    <div class="adjbox" id="agAdjBox" hidden></div>
    <label><span class="srh">Mensaje</span><textarea id="agT" rows="5" placeholder="Ej: Hola {nombre} 👋 Te recuerdo que mañana a las 10:00 firmamos tu nuevo plan. ¡Nos vemos!">${esc(edit ? a.texto : '')}</textarea></label>
    <div class="chips">${OPC.map(([t], i) => `<button class="chip ${!edit && i === 1 ? 'on' : ''}" type="button" data-op="${i}">${t}</button>`).join('')}</div>
    <label class="f">Fecha y hora<input type="datetime-local" id="agF" value="${local(edit ? new Date(a.fecha) : manana())}"></label>
    <span class="small muted">Sale a esa hora aunque esté fuera del horario de envíos y no cuenta para el máximo diario. Si WhatsApp está desconectado, sale apenas se conecte.</span>
    <span class="small" id="agErr" style="color:var(--bad)"></span>
    <div style="display:flex;justify-content:flex-end;gap:10px"><button class="btn" data-close>Cancelar</button><button class="btn pri" id="agOk">${edit ? 'Guardar cambios' : 'Agendar'}</button></div>`, (box, close) => {
    box.classList.add('wide2');
    const pintarDest = () => {
      $('agDest').innerHTML = lista.map((c, i) => `<span class="person"><b>${esc(c.nombre || 'Sin nombre')}</b><span class="muted">${fmtTel(c.telefono)}</span><button type="button" data-rm="${i}" aria-label="Quitar">×</button></span>`).join('') || '<span class="small muted">Aún no eliges clientes</span>';
      $('agDest').querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { lista.splice(+b.dataset.rm, 1); pintarDest(); }));
    };
    const agregar = (c) => { if (!lista.some((x) => x.telefono === c.telefono)) lista.push(c); $('agQ').value = ''; $('agSug').hidden = true; pintarDest(); $('agQ').focus(); };
    let t = null;
    $('agQ').oninput = () => { clearTimeout(t); t = setTimeout(async () => {
      const q = $('agQ').value.trim(); if (!q) { $('agSug').hidden = true; return; }
      const d = await GET('/api/contactos?limite=8&q=' + encodeURIComponent(q)).catch(() => ({ contactos: [] }));
      const tel = normPhone(q);
      const ops = d.contactos.slice(0, 8).map((c) => ({ telefono: c.telefono, nombre: [c.nombre, c.apellido].filter(Boolean).join(' ') }));
      if (tel && !ops.some((o) => o.telefono === tel)) ops.unshift({ telefono: tel, nombre: '', nuevo: true });
      $('agSug').innerHTML = ops.map((o, i) => `<button type="button" data-s="${i}"><b>${o.nuevo ? 'Agregar número' : esc(o.nombre || 'Sin nombre')}</b><span class="muted">${fmtTel(o.telefono)}</span></button>`).join('') || '<div class="small muted" style="padding:10px 12px">Sin resultados. Escribe el teléfono completo para agregarlo.</div>';
      $('agSug').hidden = false;
      $('agSug').querySelectorAll('[data-s]').forEach((b) => (b.onmousedown = (ev) => { ev.preventDefault(); agregar(ops[+b.dataset.s]); }));
    }, 200); };
    $('agQ').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = $('agSug').querySelector('[data-s]'); if (b) b.dispatchEvent(new MouseEvent('mousedown')); } if (e.key === 'Escape') $('agSug').hidden = true; };
    $('agQ').onblur = () => setTimeout(() => { if ($('agSug')) $('agSug').hidden = true; }, 150);
    $('agVars').innerHTML = ['{nombre}', '{apellido}', '{isapre}'].map((v) => `<button class="var" type="button" data-var="${v}">${v}</button>`).join('');
    $('agVars').querySelectorAll('[data-var]').forEach((b) => (b.onmousedown = (ev) => { ev.preventDefault(); insertarEn($('agT'), b.dataset.var); }));
    $('agEmo').onclick = () => selectorEmojis($('agEmo'), (e) => insertarEn($('agT'), e));
    const pintarAdj = () => { $('agAdjBox').hidden = !adj; $('agAdjBox').innerHTML = adj ? adjuntoHTML(adj) + '<button class="btn sm" type="button" id="agAdjX">Quitar</button>' : ''; if ($('agAdjX')) $('agAdjX').onclick = () => { adj = null; pintarAdj(); }; };
    $('agAdj').onclick = () => $('agFile').click();
    $('agFile').onchange = async () => { const f = $('agFile').files[0]; $('agFile').value = ''; if (!f) return; $('agAdj').disabled = true; try { adj = await subirAdjunto(f); pintarAdj(); } catch (e) { $('agErr').textContent = e.message; } $('agAdj').disabled = false; };
    box.querySelectorAll('[data-op]').forEach((x) => (x.onclick = () => { box.querySelectorAll('[data-op]').forEach((y) => y.classList.toggle('on', y === x)); $('agF').value = local(OPC[+x.dataset.op][1]()); }));
    $('agOk').onclick = async () => {
      const f = new Date($('agF').value);
      if (!lista.length) return ($('agErr').textContent = 'Elige al menos un cliente');
      if (!$('agT').value.trim() && !adj) return ($('agErr').textContent = 'Escribe el mensaje');
      if (isNaN(f)) return ($('agErr').textContent = 'Elige la fecha y hora');
      if (f < new Date(Date.now() - 60000)) return ($('agErr').textContent = 'Esa fecha ya pasó');
      const body = { destinatarios: lista, texto: $('agT').value, adjunto: adj ? adj.id : null, fecha: f.toISOString() };
      try { if (edit) await PUT('/api/agendados/' + a.id, body); else await POST('/api/agendados', body); close(); toast(`Agendado para el ${fechaLarga(f.toISOString())}`); renderAgendados(); }
      catch (e) { $('agErr').textContent = e.message; }
    };
    pintarDest(); pintarAdj(); if (!edit) $('agQ').focus();
  });
}
$('agNuevo').onclick = () => agendarModal(null);

// ---------------- Configuración ----------------
async function loadConfig() {
  CFG = await GET('/api/config');
  renderWaCard(true);
  document.querySelectorAll('[data-av]').forEach((c) => { c.checked = !!CFG.avisos[c.dataset.av]; c.onchange = () => { CFG.avisos[c.dataset.av] = c.checked; PUT('/api/config/avisos', { valor: CFG.avisos }); }; });
  Object.assign(UI, CFG.ui || {});
  $('uDesc').checked = UI.desc !== false; $('uCons').checked = UI.consejo !== false;
  $('uDesc').onchange = () => { guardarUI({ desc: $('uDesc').checked }); aplicarUI(); };
  $('uCons').onchange = () => guardarUI({ consejo: $('uCons').checked, consejosVistos: 0 });
  $('uEst').value = CFG.estancado?.dias || 5;
  $('uEst').onchange = async () => { const n = Math.max(1, Math.min(60, parseInt($('uEst').value) || 5)); $('uEst').value = n; await PUT('/api/config/estancado', { valor: { dias: n } }); loadPipeline.sig = ''; toast(`Un lead se marca estancado después de ${n} días`); };
  const r = CFG.reglas, H = [['lv', 'Lunes a viernes'], ['sab', 'Sábado'], ['dom', 'Domingo']];
  $('rHor').innerHTML = H.map(([k, n]) => `<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><input type="checkbox" data-hon="${k}" ${r.horario[k].on ? 'checked' : ''} aria-label="${n} activo"><span style="width:120px;font-weight:600;font-size:14px">${n}</span><input type="text" data-hd="${k}" value="${r.horario[k].desde}" style="width:72px" aria-label="Desde"><span class="muted">a</span><input type="text" data-hh="${k}" value="${r.horario[k].hasta}" style="width:72px" aria-label="Hasta"></div>`).join('');
  $('rLim').value = r.limiteDiario; $('rMin').value = r.esperaMin; $('rMax').value = r.esperaMax; $('rCada').value = r.descansoCada; $('rDesc').value = r.descansoMin;
  renderUp(); pintarTemasConfig(); pintarSiete();
}
// Configuración del 7%: UF vigente (del día 5) y tope imponible
function pintarSiete() {
  const u = EST && EST.uf && EST.uf.vigente;
  const prox = (() => { const h = new Date(); const d = new Date(h.getFullYear(), h.getMonth() + (h.getDate() >= 5 ? 1 : 0), 5); return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }); })();
  $('kSiete').innerHTML = `<h2>Cálculo del 7%</h2><div class="kv"><span>UF vigente</span><b>${u ? '$' + u.valor.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' <span class="small muted">(del ' + fechaUF(u.fecha) + ')</span>' : 'sin conexión'}</b></div><div class="kv"><span>Próxima actualización</span><b>${prox}</b></div><label class="check">Tope imponible (UF)<input type="number" id="sTope" min="1" max="500" step="0.1" style="width:100px"></label><span class="small muted">Si la renta pasa el tope, el 7% se calcula sobre el tope.</span>`;
  $('sTope').value = (CFG.siete && CFG.siete.topeUF) || 90;
  $('sTope').onchange = async () => { const n = Math.round(Math.max(1, Math.min(500, parseFloat(String($('sTope').value).replace(',', '.')) || 90)) * 10) / 10; $('sTope').value = n; CFG.siete = { topeUF: n }; await PUT('/api/config/siete', { valor: CFG.siete }); toast(`Tope imponible: ${n} UF`); };
}
function renderWaCard(force) {
  if (!EST) return; const w = EST.wa;
  const sig = w.state + (w.qr || '') + (w.detalle || '') + (w.progreso ?? '');
  if (!force && renderWaCard.sig === sig) return; renderWaCard.sig = sig;
  $('kWa').innerHTML = `<h2>WhatsApp</h2><div style="display:flex;align-items:center;gap:8px;font-weight:600"><span class="dot ${w.state === 'listo' ? 'ok' : ['error', 'desconectado'].includes(w.state) ? 'bad' : ''}"></span>${esc(WA_TXT[w.state] || w.state)}${w.me ? ' · ' + fmtTel(w.me) : ''}</div>
    ${w.state === 'qr' && w.qr ? `<img class="qrimg" src="${w.qr}" alt="Código QR para vincular WhatsApp"><ol class="small muted" style="margin:0;padding-left:18px"><li>Abre WhatsApp en el teléfono del número que enviará.</li><li>Ve a Configuración → Dispositivos vinculados.</li><li>Toca Vincular un dispositivo y escanea este código.</li></ol>` : ''}
    ${w.state === 'descargando' ? `<span class="small muted">Descargando un componente necesario (solo esta vez)${w.progreso != null ? ' · ' + w.progreso + '%' : ''}. No cierres el programa.</span>` : ''}
    ${w.state === 'iniciando' ? '<span class="small muted">La primera vez puede tardar hasta un minuto.</span>' : ''}
    ${w.state === 'error' ? `<span class="small muted" style="word-break:break-word">${esc(w.detalle || w.err || '')}</span>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${['error', 'desconectado'].includes(w.state) ? '<button class="btn pri" id="wRetry">Reintentar</button>' : ''}${w.state === 'listo' ? '<button class="btn" id="wOut">Desvincular número</button>' : ''}<a class="btn" href="#" id="wLog">Ver registro técnico</a></div>`;
  if ($('wRetry')) $('wRetry').onclick = () => { POST('/api/reintentar'); toast('Reintentando…'); };
  if ($('wLog')) $('wLog').onclick = async (e) => {
    e.preventDefault();
    const t = await fetch('/api/registro').then((r) => r.text()).catch(() => 'No se pudo leer el registro');
    const lineas = t.split('\n').filter((l) => l.startsWith('[')).slice(-150).reverse().join('\n');
    modal(`<h3>Registro técnico</h3><span class="small muted">Lo más reciente arriba. Sirve para revisar fallas de conexión.</span><pre class="logpre">${esc(lineas || 'Sin registros')}</pre><div style="display:flex;justify-content:flex-end;gap:10px"><button class="btn" id="lgCopy">Copiar</button><button class="btn pri" data-close>Cerrar</button></div>`, (b) => { b.classList.add('wide2'); $('lgCopy').onclick = () => navigator.clipboard.writeText(lineas).then(() => toast('Registro copiado')); });
  };
  if ($('wOut')) $('wOut').onclick = async () => { if (await confirmar('Para volver a usarlo tendrás que escanear el código QR con tu celular.', { titulo: '¿Desvincular este número del programa?', si: 'Desvincular', peligro: true })) POST('/api/cerrar-sesion'); };
}
$('rSave').onclick = async () => {
  const r = CFG.reglas; const okH = (s) => /^\d{1,2}:\d{2}$/.test(s);
  for (const k of ['lv', 'sab', 'dom']) {
    const d = document.querySelector(`[data-hd="${k}"]`).value.trim(), h = document.querySelector(`[data-hh="${k}"]`).value.trim();
    if (!okH(d) || !okH(h)) return toast('Escribe las horas como 9:30 o 20:00');
    r.horario[k] = { on: document.querySelector(`[data-hon="${k}"]`).checked, desde: d, hasta: h };
  }
  r.limiteDiario = Math.max(1, +$('rLim').value || 80); r.esperaMin = Math.max(0, +$('rMin').value || 0); r.esperaMax = Math.max(r.esperaMin, +$('rMax').value || r.esperaMin);
  r.descansoCada = Math.max(0, +$('rCada').value || 0); r.descansoMin = Math.max(1, +$('rDesc').value || 1);
  await PUT('/api/config/reglas', { valor: r }); toast('Reglas guardadas');
};
function renderUp() {
  const u = EST?.actualizacion;
  const txt = !u ? 'Las actualizaciones automáticas se activan cuando el programa esté publicado en GitHub.' : { buscando: 'Buscando actualizaciones…', descargando: `Bajando la versión ${u.version || ''}${u.progreso != null ? ' · ' + u.progreso + '%' : ''}${u.tipo === 'liviana' ? ' (actualización liviana)' : ''}…`, lista: `Versión ${u.version} lista: toca «Reiniciar y actualizar».`, aldia: 'Estás en la última versión.', error: 'No se pudo revisar (sin internet o sin publicar).', inactivo: 'Actualizaciones automáticas no configuradas todavía.' }[u.estado] || '';
  $('kUp').innerHTML = `<h2>Actualizaciones</h2><div style="display:flex;align-items:center;gap:12px">${LOGO_SVG(40)}<div><b style="font-family:var(--serif);letter-spacing:.06em">CRM HERMES</b><div class="small muted">Conecta Salud</div></div></div><div class="kv"><span>Versión instalada</span><b>${esc(EST?.version || '')}</b></div><span class="small muted">${esc(txt)}</span><div style="display:flex;gap:8px">${u && u.estado === 'lista' ? '<button class="btn pri" id="uI">Reiniciar y actualizar</button>' : ''}${u && u.estado !== 'inactivo' ? '<button class="btn" id="uB">Buscar ahora</button>' : ''}</div>`;
  if ($('uB')) $('uB').onclick = async () => { await POST('/api/actualizacion/buscar'); toast('Buscando…'); setTimeout(() => { poll().then(renderUp); }, 3000); };
  if ($('uI')) $('uI').onclick = async () => { if (!(await confirmar('Se cerrará todo el programa, también WhatsApp, y volverá a abrir solo con la versión nueva.', { titulo: 'Reiniciar y actualizar', si: 'Reiniciar ahora' }))) return; POST('/api/actualizacion/instalar').catch(() => {}); };
}

// ---------------- Leads de Meta ----------------
let leadForm = '', leadEstado = '';
const CAMPO_TXT = { '': 'No usar', nombre: 'Nombre', apellido: 'Apellido', nombre_completo: 'Nombre completo', telefono: 'Teléfono', edad: 'Edad', renta: 'Renta', cargas: 'Cargas', isapre: 'Isapre/Fonasa' };
async function loadLeads() {
  const m = await GET('/api/meta').catch(() => null); if (!m) return;
  if (!m.conectado) { if (!esAdmin()) { $('headActions').innerHTML = ''; $('lBody').innerHTML = '<div class="glass soonbox"><h2>Meta aún no está conectado</h2><p class="muted">El administrador debe conectar los formularios de Facebook e Instagram. Cuando lo haga, los leads aparecerán aquí.</p></div>'; return; } return renderMetaSetup(); }
  $('headActions').innerHTML = esAdmin() ? '<button class="btn" id="lForms">Formularios</button><button class="btn pri" id="lRev">Revisar ahora</button>' : '';
  if ($('lRev')) $('lRev').onclick = async () => { $('lRev').disabled = true; try { const r = await POST('/api/meta/revisar'); toast(r.nuevos ? `${r.nuevos} leads nuevos` : 'No hay leads nuevos'); } catch (e) { toast(e.message); } loadLeads(); };
  if ($('lForms')) $('lForms').onclick = () => formsModal(m);
  const d = await GET(`/api/meta/leads?form=${encodeURIComponent(leadForm)}&estado=${leadEstado}`);
  $('subtitle').textContent = `${d.hoy} leads hoy · ${d.mes} en los últimos 30 días`;
  const chips = [['', 'Todos'], ['hoy', 'Nuevos hoy'], ['enviado', 'Mensaje enviado'], ['pendiente', 'En cola'], ['invalido', 'Número inválido']];
  const estadoMsj = (l) => {
    if (!/^\d{8,13}$/.test(l.telefono || '')) return ['p-warn', 'Número inválido'];
    if (l.enviado) return ['p-ok', 'Enviado ' + hora(l.enviado)];
    if (l.previo) return ['p-mut', 'Ya contactado antes'];
    if (l.enCola) return ['p-info', d.enHorario ? 'En cola' : 'Sale en horario'];
    if (l.fallo) return ['p-bad', l.fallo];
    return ['p-mut', m.autoMensaje ? '—' : 'Sin envío automático'];
  };
  $('lBody').innerHTML = `<div class="glass card" style="flex-direction:row;align-items:center;gap:16px;margin-bottom:16px">
      <span class="dot ${m.error ? 'bad' : 'ok'}"></span>
      <div class="grow"><b>${esc(m.pageNombre || 'Página conectada')}</b><div class="small muted">${m.error ? esc(m.error) : `Revisa cada ${m.intervaloMin} min · última revisión ${m.ultimaRevision ? 'hace ' + hace(m.ultimaRevision) : 'pendiente'}${m.revisando ? ' · revisando ahora…' : ''}`}</div></div>
      <label class="check" style="gap:10px"><span>Primer mensaje automático</span><input type="checkbox" id="lAuto" ${m.autoMensaje ? 'checked' : ''} ${esAdmin() ? '' : 'disabled'}></label>
      <label class="f" style="flex-direction:row;align-items:center;gap:8px">Revisar cada<select id="lInt" style="width:110px" ${esAdmin() ? '' : 'disabled'}>${[2, 5, 10, 15, 30].map((n) => `<option value="${n}" ${n === m.intervaloMin ? 'selected' : ''}>${n} min</option>`).join('')}</select></label>
    </div>
    <div class="glass card small" style="margin-bottom:16px;flex-direction:row;gap:12px;align-items:center"><span class="grow">${m.autoMensaje ? 'Cada lead nuevo recibe el <b>Mensaje 1</b> de la secuencia apenas llega. Si llega fuera de horario, sale en la próxima apertura. Luego sigue con los seguimientos de 24 h y 72 h si no responde.' : 'El primer mensaje automático está apagado: los leads llegan como contactos, pero no se les escribe solo.'}</span>${puedo('automaticos') ? '<button class="btn" data-go="auto">Editar mensaje</button>' : ''}</div>
    <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap">
      <label class="f">Formulario<select id="lForm" style="min-width:240px"><option value="">Todos los formularios (${m.forms.filter((f) => f.activo).length} activos)</option>${m.forms.map((f) => `<option value="${f.id}" ${f.id === leadForm ? 'selected' : ''}>${esc(f.nombre)}</option>`).join('')}</select></label>
      <div class="chips">${chips.map(([k, t]) => `<button class="chip ${k === leadEstado ? 'on' : ''}" data-le="${k}">${t}</button>`).join('')}</div>
    </div>
    <div class="glass" style="overflow-x:auto"><table class="t"><thead><tr><th>Llegó</th><th>Nombre</th><th>Teléfono</th><th>Edad</th><th>Renta</th><th>Cargas</th><th>Isapre/Fonasa</th><th>Formulario</th><th>Primer mensaje</th><th></th></tr></thead><tbody>
      ${d.leads.map((l) => { const [cl, tx] = estadoMsj(l); const cp = l.campos || {}; return `<tr style="cursor:pointer" data-lchat="${/^\d{8,13}$/.test(l.telefono || '') ? l.telefono : ''}"><td class="muted">${hora(l.creado)}</td><td><b>${esc(l.nombre || '—')}</b></td><td>${esc(fmtTel(l.telefono) || l.telefono)}</td><td>${esc(l.edad ?? cp.edad ?? '')}</td><td>${esc(l.renta ? money(l.renta) : cp.renta || '')}</td><td>${esc(l.cargas ?? cp.cargas ?? '')}</td><td>${esc(l.isapre ?? cp.isapre ?? '')}</td><td class="muted">${esc(l.form_nombre)}</td><td><span class="pill ${cl}">${esc(tx)}</span></td><td>${/^\d{8,13}$/.test(l.telefono || '') ? `<button class="btn sm" data-chat="${l.telefono}">Abrir en WhatsApp</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="10" class="empty">${m.forms.some((f) => f.activo) ? 'Aún no llegan leads. Cuando alguien llene tu formulario, aparecerá aquí.' : 'No hay formularios activos. Toca "Formularios" para elegir cuáles revisar.'}</td></tr>`}
    </tbody></table></div>`;
  $('lAuto').onchange = async () => { await PUT('/api/meta/opciones', { autoMensaje: $('lAuto').checked }); loadLeads(); };
  $('lInt').onchange = async () => { await PUT('/api/meta/opciones', { intervaloMin: +$('lInt').value }); loadLeads(); };
  $('lForm').onchange = () => { leadForm = $('lForm').value; loadLeads(); };
  document.querySelectorAll('[data-le]').forEach((b) => (b.onclick = () => { leadEstado = b.dataset.le; loadLeads(); }));
  document.querySelectorAll('[data-lchat]').forEach((r) => (r.onclick = (e) => { if (!e.target.closest('[data-chat]') && r.dataset.lchat) window.abrirChat(r.dataset.lchat); }));
}
function renderMetaSetup(paginas) {
  $('headActions').innerHTML = '';
  $('lBody').innerHTML = `<div class="grid g2" style="align-items:start">
    <div class="glass card"><h2>Conecta tus formularios de Meta</h2>
      <p class="small muted" style="margin:0">Se hace una sola vez. Necesitas ser administrador de la página de Facebook de Conecta Salud.</p>
      <ol style="margin:0;padding-left:20px;line-height:1.7;font-size:14px">
        <li>Entra a <b>developers.facebook.com</b> → <b>Mis apps</b> → <b>Crear app</b>. Elige el tipo <b>Empresa</b> (o "Otro" y luego Empresa) y vincúlala al portafolio comercial de Conecta Salud.</li>
        <li>En la app, ve a <b>Configuración de la app → Básica</b> y copia el <b>Identificador de la app</b> y la <b>Clave secreta</b>.</li>
        <li>Abre el <b>Explorador de la API Graph</b> (en el menú Herramientas). Elige tu app y, en "Permisos", agrega: <b>pages_show_list</b>, <b>pages_read_engagement</b>, <b>pages_manage_ads</b> y <b>leads_retrieval</b>.</li>
        <li>Toca <b>Generate Access Token</b>, acepta los permisos y copia el código que aparece.</li>
        <li>Pega los tres datos aquí al lado y aprieta <b>Conectar</b>.</li>
      </ol>
      <p class="small muted" style="margin:0">Mientras la app esté en modo desarrollo funciona solo para ti y los administradores de la app, que es justo lo que necesitas. Meta cambia sus menús seguido: si algo no coincide, mándame una captura.</p>
    </div>
    <div class="glass card" id="mConn">${paginas ? `<h2>Elige la página</h2>${paginas.map((p) => `<button class="btn" style="justify-content:flex-start" data-pag="${p.id}">${esc(p.nombre)}</button>`).join('')}` : `<h2>Datos de tu app</h2>
      <label class="f">Identificador de la app (App ID)<input type="text" id="mId"></label>
      <label class="f">Clave secreta de la app (App Secret)<input type="text" id="mSec" autocomplete="off"></label>
      <label class="f">Código de acceso del Explorador<textarea id="mTok" rows="4"></textarea></label>
      <span class="small" id="mtErr" style="color:var(--bad)"></span>
      <button class="btn pri" id="mGo">Conectar</button>
      <span class="small muted">El programa convierte ese código en uno permanente de tu página. La clave secreta no se guarda.</span>`}</div></div>`;
  if (paginas) document.querySelectorAll('[data-pag]').forEach((b) => (b.onclick = async () => { b.disabled = true; try { const r = await POST('/api/meta/pagina', { pageId: b.dataset.pag }); toast('Página conectada'); formsModal(r.meta); loadLeads(); } catch (e) { toast(e.message); b.disabled = false; } }));
  else $('mGo').onclick = async () => { $('mGo').disabled = true; $('mtErr').textContent = ''; try { const r = await POST('/api/meta/conectar', { appId: $('mId').value, appSecret: $('mSec').value, userToken: $('mTok').value }); renderMetaSetup(r.paginas); } catch (e) { $('mtErr').textContent = e.message; $('mGo').disabled = false; } };
}
function formsModal(m) {
  modal(`<h3>Formularios de ${esc(m.pageNombre || 'tu página')}</h3>
    <span class="small muted">Marca cuáles revisar y revisa que cada pregunta vaya al campo correcto. Lo que dejes en "No usar" queda guardado igual en el lead.</span>
    ${m.forms.length ? m.forms.map((f) => `<div class="glass" style="padding:14px;background:rgba(0,0,0,.2);display:flex;flex-direction:column;gap:8px">
      <label class="check"><b>${esc(f.nombre)}</b><span class="small muted" style="margin-left:auto">${f.estado === 'ACTIVE' ? 'Activo en Meta' : 'Archivado en Meta'}</span><input type="checkbox" data-fa="${f.id}" ${f.activo ? 'checked' : ''}></label>
      ${f.preguntas.map((q) => `<div class="kv" style="align-items:center"><span class="small ell">${esc(q.label)}</span><select data-fm="${f.id}" data-q="${esc(q.key)}" style="width:170px;height:34px">${Object.entries(CAMPO_TXT).map(([k, t]) => `<option value="${k}" ${f.mapeo[q.key] === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`).join('')}
    </div>`).join('') : '<div class="empty">Esta página no tiene formularios de clientes potenciales.</div>'}
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div style="display:flex;gap:10px"><button class="btn" id="fRef">Actualizar lista</button><button class="btn danger" id="fOff">Desconectar Meta</button></div><button class="btn pri" id="fOk">Guardar</button></div>`, (box, close) => {
    $('fOk').onclick = async () => {
      for (const f of m.forms) {
        const mapeo = {}; box.querySelectorAll(`[data-fm="${f.id}"]`).forEach((s) => (mapeo[s.dataset.q] = s.value));
        await PUT('/api/meta/formularios/' + f.id, { activo: box.querySelector(`[data-fa="${f.id}"]`).checked, mapeo });
      }
      close(); toast('Formularios guardados'); loadLeads();
    };
    $('fRef').onclick = async () => { try { const r = await POST('/api/meta/formularios'); close(); formsModal(r.meta); } catch (e) { toast(e.message); } };
    $('fOff').onclick = async () => { if (!(await confirmar('Los leads que ya llegaron se mantienen.', { titulo: '¿Desconectar Meta?', si: 'Desconectar', peligro: true }))) return; await POST('/api/meta/desconectar'); close(); loadLeads(); };
  });
}

// ---------------- Métricas ----------------
let mDias = 30;
const pct = (x) => (x == null ? '—' : (Math.round(x * 1000) / 10).toLocaleString('es-CL') + '%');
function barras(lista, max, color) {
  return lista.map((x) => `<div style="display:flex;flex-direction:column;gap:4px"><div style="display:flex;justify-content:space-between;font-size:13px;gap:10px"><span class="ell">${esc(x.k)}</span><b>${esc(x.v)}</b></div><div style="height:8px;border-radius:4px;background:var(--sand2)"><div style="height:8px;border-radius:4px;width:${max ? Math.max(2, (x.n / max) * 100) : 0}%;background:${color}"></div></div></div>`).join('') || '<div class="empty">Sin datos en este período</div>';
}
async function loadMetricas() {
  $('headActions').innerHTML = `<label class="f" style="flex-direction:row;align-items:center;gap:8px">Período<select id="mDias" style="width:160px">${[[7, 'Últimos 7 días'], [30, 'Últimos 30 días'], [90, 'Últimos 90 días']].map(([n, t]) => `<option value="${n}" ${n === mDias ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  $('mDias').onchange = () => { mDias = +$('mDias').value; loadMetricas(); };
  const d = await GET('/api/metricas?dias=' + mDias).catch(() => null); if (!d) return;
  const alertaBajas = d.tasaBajas >= 0.02;
  const tiles = [
    { c: 't0', k: 'Enviados', n: d.enviados.toLocaleString('es-CL'), s: `${d.contactados} personas contactadas` },
    { c: 't1', k: 'Leídos', n: pct(d.leidos), s: 'Doble check azul' },
    { c: 't2', k: 'Tasa de respuesta', n: pct(d.tasaRespuesta), s: `${d.respondieron} respondieron` },
    { c: alertaBajas ? 't6' : 't4', k: 'Bajas', n: pct(d.tasaBajas), s: alertaBajas ? 'Sobre 2%: baja el ritmo o revisa el mensaje' : 'Bajo el límite de 2%' },
    { c: 't3', k: 'Ingresados', n: d.ingresados, s: `${d.nuevos} contactos nuevos en el período` }
  ];
  // Mejor hora para enviar: de cada hora, cuántos responden
  const hs = (d.horas || []).filter((x) => x.h >= 7 && x.h <= 22);
  const conDatos = hs.filter((x) => x.env >= 5);
  const mejor0 = conDatos.length ? conDatos.reduce((a, b) => (b.resp / b.env > a.resp / a.env ? b : a)) : null;
  const mejor = mejor0 && mejor0.resp > 0 ? mejor0 : null;
  const maxR = Math.max(0.0001, ...hs.map((x) => (x.env ? x.resp / x.env : 0)));
  const horaCard = `<div class="glass card"><div class="hd"><h2>Mejor hora para enviar</h2>${mejor ? `<span class="pill p-terra">${mejor.h}:00 a ${mejor.h + 1}:00 · ${pct(mejor.resp / mejor.env)}</span>` : ''}</div>
    <span class="small muted">De los mensajes que enviaste a cada hora, cuántos recibieron respuesta. ${mejor ? `Programa tus envíos cerca de las <b>${mejor.h}:00</b>.` : 'Recomienda una hora cuando haya al menos 5 envíos en esa hora y alguna respuesta.'}</span>
    ${hs.length ? `<div class="horas">${hs.map((x) => { const r = x.env ? x.resp / x.env : 0; return `<div class="hcol" title="${x.h}:00 · ${x.env} enviados · ${pct(r)} respondió"><span>${x.env >= 5 ? pct(r) : ''}</span><div class="hb2 ${mejor && x.h === mejor.h ? 'top' : ''}" style="height:${Math.max(3, (r / maxR) * 100)}px;opacity:${x.env >= 5 ? 1 : 0.4}"></div></div>`; }).join('')}</div><div class="horas hl" style="height:auto;border:0">${hs.map((x) => `<span>${x.h}</span>`).join('')}</div>` : '<div class="empty">Aparecerá cuando envíes mensajes</div>'}</div>`;
  const nombres = ['Mensaje 1', 'Seguimiento 1', 'Seguimiento 2'];
  const maxPaso = Math.max(...d.pasos.map((p) => (p.env ? p.resp / p.env : 0)), 0.0001);
  const TIPO_TXT = { masivo: 'Envío', programado: 'Programado', meta: 'Mensaje 1 (Meta)', seguimiento1: 'Seguimiento 1', seguimiento2: 'Seguimiento 2' };
  $('mBody').innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">${tiles.map((t) => `<div class="tile ${t.c}"><span class="k">${t.k}</span><span class="n">${t.n}</span><span class="s">${esc(t.s)}</span></div>`).join('')}</div>
    <div class="grid g3" style="margin-top:16px;align-items:start">
      <div class="glass card"><h2>Conversión por etapa</h2><span class="small muted">Contactos nuevos del período que llegaron al menos a cada etapa</span>${barras(d.embudo.map((e) => ({ k: e.etapa, v: e.n, n: e.n })), d.embudo[0]?.n || 0, 'var(--green)')}</div>
      <div class="glass card"><h2>Respuesta por paso de la secuencia</h2><span class="small muted">De cada mensaje enviado, cuántos recibieron respuesta antes del siguiente</span>
        <div style="display:flex;align-items:flex-end;gap:22px;height:170px;padding:0 10px;border-bottom:1px solid var(--line)">${d.pasos.map((p, i) => { const r = p.env ? p.resp / p.env : 0; return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px"><b>${pct(r)}</b><div style="width:60px;height:${Math.max(3, (r / maxPaso) * 120)}px;background:${['#B4472C', '#D9895F', '#E9C2A6'][i]};border-radius:6px 6px 0 0"></div></div>`; }).join('')}</div>
        <div style="display:flex;gap:22px;padding:0 10px">${d.pasos.map((p, i) => `<span class="small muted" style="flex:1;text-align:center">${nombres[i]}<br>${p.env} enviados</span>`).join('')}</div></div>
      <div class="glass card"><h2>Motivos de pérdida</h2>${(() => { const tot = d.motivos.reduce((a, m) => a + m.n, 0); return barras(d.motivos.map((m) => ({ k: m.motivo, v: m.n + ' · ' + pct(m.n / tot), n: m.n })), Math.max(0, ...d.motivos.map((m) => m.n)), '#B4472C'); })()}</div>
    </div>
    <div class="grid g2" style="margin-top:16px;align-items:start">${horaCard}<div class="glass card"><h2>Cómo leer esto</h2><span class="small muted">La respuesta se cuenta si el cliente escribe antes de tu siguiente mensaje automático. Las horas en gris claro tienen pocos envíos todavía.</span></div></div>
    <div class="grid g2" style="margin-top:16px;align-items:start">
      <div class="glass"><div class="card" style="padding-bottom:6px"><h2>Mensajes: cuál responde mejor</h2></div><div style="overflow-x:auto"><table class="t"><thead><tr><th>Mensaje</th><th>Tipo</th><th>Enviados</th><th>Respuesta</th><th>Bajas</th></tr></thead><tbody>${d.plantillas.map((p) => `<tr><td class="ell" style="max-width:320px" title="${esc(p.texto)}">${esc(p.texto.replace(/\s+/g, ' ').slice(0, 70))}</td><td class="muted">${TIPO_TXT[p.tipo] || p.tipo}</td><td>${p.env}</td><td><b>${pct(p.env ? p.resp / p.env : 0)}</b></td><td>${pct(p.env ? p.bajas / p.env : 0)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aparecerá cuando envíes mensajes con esta versión</td></tr>'}</tbody></table></div></div>
      <div class="glass"><div class="card" style="padding-bottom:6px"><h2>Formularios de Meta: cuál trae leads que cierran</h2></div><div style="overflow-x:auto"><table class="t"><thead><tr><th>Formulario</th><th>Leads</th><th>Respondieron</th><th>Calificados</th><th>Ingresados</th></tr></thead><tbody>${d.forms.map((f) => `<tr><td><b>${esc(f.form)}</b></td><td>${f.leads}</td><td>${pct(f.leads ? f.respondieron / f.leads : 0)}</td><td>${f.calificados}</td><td><b>${f.ingresados}</b></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin leads de Meta en este período</td></tr>'}</tbody></table></div></div>
    </div>`;
}

// ---------------- Seguridad (PIN) ----------------
const pinInput = (id) => `<input type="password" id="${id}" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" style="letter-spacing:.5em;text-align:center">`;
function pedirPin(texto, fn) {
  modal(`<h3>Confirma tu PIN</h3><p class="small muted" style="margin:0">${esc(texto)}</p><label class="f">Tu PIN${pinInput('cP')}</label><span class="small" id="cErr" style="color:var(--bad)"></span><div style="display:flex;justify-content:flex-end;gap:10px"><button class="btn" data-close>Cancelar</button><button class="btn pri" id="cOk">Continuar</button></div>`, (b, close) => {
    $('cP').oninput = () => ($('cP').value = $('cP').value.replace(/\D/g, '').slice(0, 4));
    $('cOk').onclick = async () => { try { await fn($('cP').value); } catch (e) { $('cErr').textContent = e.message; } };
    $('cP').onkeydown = (e) => { if (e.key === 'Enter') $('cOk').click(); };
  });
}
function mostrarCodigo(codigo) {
  modal(`<h3>Código de recuperación</h3><p style="margin:0">Guárdalo en un lugar seguro (una nota en tu celular o impreso). Sirve para entrar si olvidas tu PIN. <b>No se vuelve a mostrar.</b></p><div class="codigo" style="text-align:center;color:var(--text)">${esc(codigo)}</div><div style="display:flex;justify-content:flex-end;gap:10px"><button class="btn" id="kCopy">Copiar</button><button class="btn pri" data-close>Ya lo guardé</button></div>`, () => {
    $('kCopy').onclick = () => { navigator.clipboard.writeText(codigo).then(() => toast('Código copiado')); };
  });
}
function cambiarPin() {
  modal(`<h3>Cambiar PIN</h3><label class="f">PIN actual${pinInput('pA')}</label><label class="f">PIN nuevo${pinInput('pN')}</label><label class="f">Repite el PIN nuevo${pinInput('pR')}</label><span class="small" id="pErr" style="color:var(--bad)"></span><div style="display:flex;justify-content:flex-end;gap:10px"><button class="btn" data-close>Cancelar</button><button class="btn pri" id="pOk">Cambiar</button></div>`, (b, close) => {
    ['pA', 'pN', 'pR'].forEach((id) => ($(id).oninput = () => ($(id).value = $(id).value.replace(/\D/g, '').slice(0, 4))));
    $('pOk').onclick = async () => {
      if (!/^\d{4}$/.test($('pN').value)) return ($('pErr').textContent = 'El PIN nuevo debe tener 4 números');
      if ($('pN').value !== $('pR').value) return ($('pErr').textContent = 'Los PIN nuevos no coinciden');
      try { await POST('/api/seguridad/pin', { actual: $('pA').value, nuevo: $('pN').value }); close(); toast('PIN actualizado'); } catch (e) { $('pErr').textContent = e.message; }
    };
  });
}
$('sPin').onclick = cambiarPin;
$('sRec').onclick = () => pedirPin('Confirma con tu PIN para generar un código nuevo. El anterior dejará de servir.', async (pin) => { const r = await POST('/api/seguridad/recuperacion', { pin }); mostrarCodigo(r.codigo); });
$('meLock').onclick = () => bloquear('manual');

// ---------------- Pantalla de ingreso (PIN de 4 dígitos) ----------------
const LK = { modo: 'pin', pin: '', tmp: {}, ocupado: false };
const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ']];
function lockHTML() {
  const cab = `<img class="lg" src="logo.png" alt=""><h2>CRM HERMES</h2>`;
  const pad = (izq, der) => `<div class="pad">${KEYS.map(([n, l]) => `<button data-k="${n}" aria-label="${n}"><b>${n}</b>${l ? `<small>${l}</small>` : '<small>&nbsp;</small>'}</button>`).join('')}${izq}<button data-k="0" aria-label="0"><b>0</b><small>+</small></button>${der}</div>`;
  const borrar = `<button class="txt" data-k="del" aria-label="Borrar">Borrar</button>`;
  const dots = `<div class="dots" id="lkDots">${[0, 1, 2, 3].map((i) => `<i class="${i < LK.pin.length ? 'on' : ''}"></i>`).join('')}</div>`;
  const err = `<div class="lk-err" id="lkErr" role="alert"></div>`;
  switch (LK.modo) {
    case 'pin': return cab + `<p>Ingresa tu PIN</p>` + dots + err + pad(`<button class="txt" data-k="olvido">Olvidé</button>`, borrar);
    case 'setup2': return cab + `<p>Bienvenido. Protege tus datos con un PIN.<br>Crea tu PIN de 4 dígitos</p>` + dots + err + pad('<span class="blank"></span>', borrar);
    case 'setup3': return cab + `<p>Repite tu PIN</p>` + dots + err + pad(`<button class="txt" data-k="atras">Atrás</button>`, borrar);
    case 'rec1': return cab + `<p>Escribe tu código de recuperación</p><input class="lk" id="lkRec" placeholder="XXXX-XXXX-XXXX" maxlength="14" style="font-family:ui-monospace,Consolas,monospace;letter-spacing:.08em">${err}<button class="lkbtn" id="lkSig">Continuar</button><button class="lklink" data-k="cancelar">Volver</button>`;
    case 'rec2': return cab + `<p>Crea un PIN nuevo de 4 dígitos</p>` + dots + err + pad(`<button class="txt" data-k="cancelar">Volver</button>`, borrar);
    case 'rec3': return cab + `<p>Repite el PIN nuevo</p>` + dots + err + pad(`<button class="txt" data-k="atras">Atrás</button>`, borrar);
    case 'olvido': return cab + `<p>Puedes entrar con el código de recuperación que guardaste al crear tu PIN y elegir uno nuevo.</p><button class="lkbtn" data-k="recuperar">Usar código de recuperación</button><button class="lklink" data-k="cancelar">Volver</button>`;
    case 'codigo': return cab + `<p><b>Guarda este código de recuperación.</b><br>Te sirve para entrar si olvidas tu PIN. No se vuelve a mostrar.</p><div class="codigo">${esc(LK.tmp.codigo)}</div><button class="lklink" id="lkCopy">Copiar código</button><button class="lkbtn" id="lkListo">Ya lo guardé, entrar</button>`;
  }
}
function pintarLock() {
  $('lockCard').innerHTML = lockHTML();
  const card = $('lockCard');
  card.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => tecla(b.dataset.k)));
  if ($('lkSig')) $('lkSig').onclick = siguienteTexto;
  ['lkNom', 'lkRec'].forEach((id) => { if ($(id)) { $(id).focus(); $(id).onkeydown = (e) => { if (e.key === 'Enter') siguienteTexto(); }; } });
  if ($('lkCopy')) $('lkCopy').onclick = () => navigator.clipboard.writeText(LK.tmp.codigo).then(() => ($('lkCopy').textContent = 'Copiado ✓'));
  if ($('lkListo')) $('lkListo').onclick = () => entrar();
}
function errorLock(msg, sacudir = true) {
  LK.pin = ''; pintarLock();
  $('lkErr').textContent = msg || '';
  if (sacudir) { const d = $('lkDots'); if (d) { d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); } }
}
async function siguienteTexto() {
  if (LK.modo === 'rec1') { const c = $('lkRec').value.trim(); if (c.replace(/[^A-Za-z0-9]/g, '').length !== 12) return ($('lkErr').textContent = 'El código tiene 12 caracteres'); LK.tmp.codigoRec = c; LK.modo = 'rec2'; LK.pin = ''; return pintarLock(); }
}
async function tecla(k) {
  if (LK.ocupado) return;
  if (k === 'del') { LK.pin = LK.pin.slice(0, -1); return pintarLock(); }
  if (k === 'olvido') { LK.modo = 'olvido'; return pintarLock(); }
  if (k === 'recuperar') { LK.modo = 'rec1'; LK.tmp = {}; return pintarLock(); }
  if (k === 'cancelar') { LK.modo = 'pin'; LK.pin = ''; LK.tmp = {}; return pintarLock(); }
  if (k === 'atras') { LK.modo = LK.modo === 'setup3' ? 'setup2' : 'rec2'; LK.pin = ''; return pintarLock(); }
  if (!/^\d$/.test(k) || LK.pin.length >= 4) return;
  LK.pin += k; pintarLock();
  if (LK.pin.length < 4) return;
  const pin = LK.pin;
  if (LK.modo === 'pin') {
    LK.ocupado = true;
    try { await fetchJSON('/api/auth/ingresar', { pin }); await entrar(); }
    catch (e) { errorLock(e.message); }
    finally { LK.ocupado = false; }
  } else if (LK.modo === 'setup2' || LK.modo === 'rec2') { LK.tmp.pin = pin; LK.modo = LK.modo === 'setup2' ? 'setup3' : 'rec3'; LK.pin = ''; pintarLock(); }
  else if (LK.modo === 'setup3' || LK.modo === 'rec3') {
    if (pin !== LK.tmp.pin) { LK.modo = LK.modo === 'setup3' ? 'setup2' : 'rec2'; return errorLock('Los PIN no coinciden. Inténtalo de nuevo.'); }
    LK.ocupado = true;
    try {
      const r = LK.modo === 'setup3'
        ? await fetchJSON('/api/auth/configurar', { pin })
        : await fetchJSON('/api/auth/recuperar', { codigo: LK.tmp.codigoRec, pin });
      LK.tmp.codigo = r.codigo; LK.modo = 'codigo'; LK.pin = ''; pintarLock();
    } catch (e) { if (LK.modo === 'rec3' && /código/i.test(e.message)) { LK.modo = 'rec1'; pintarLock(); $('lkErr').textContent = e.message; } else { LK.modo = LK.modo === 'setup3' ? 'setup2' : 'rec2'; errorLock(e.message); } }
    finally { LK.ocupado = false; }
  }
}
async function fetchJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error ' + r.status); return j;
}
document.addEventListener('keydown', (e) => {
  if (document.body.classList.contains('locked') && !['lkNom', 'lkRec'].includes(document.activeElement?.id)) {
    if (/^\d$/.test(e.key)) { e.preventDefault(); tecla(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); tecla('del'); }
  }
});
// Detrás del PIN: la estructura del CRM sin datos
function esqueleto() {
  document.body.classList.add('hub'); document.body.classList.remove('barra', 'en-chats', 'tapado');
  current = 'inicio';
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('on'));
  ['iTiles', 'iChats', 'iRec', 'iSinProx', 'iEst', 'iProg', 'iSalud', 'cFicha', 'waBar', 'board', 'lBody', 'mBody', 'eChips', 'qLog'].forEach((id) => { if ($(id)) $(id).innerHTML = ''; });
  for (const el of $('sats').children) { el.querySelector('.dato').textContent = ''; el.querySelector('.bdg').hidden = true; }
  $('pendHoy').textContent = 'Ver tu día'; $('saludo').textContent = 'Hola';
  ['ufHoy', 'waTxt', 'hoyTxt'].forEach((id) => ($(id).textContent = '—'));
  $('waBanner').hidden = true; $('consejo').hidden = true;
  cerrarPops(); $('bienvenida').hidden = true;
  layout();
}
let pollTimer = null, refreshTimer = null;
async function mostrarLock() {
  document.body.classList.add('locked'); $('lock').classList.remove('off');
  esqueleto(); $('modal').hidden = true; $('modalBox').innerHTML = '';
  const d = await fetch('/api/auth/estado').then((r) => r.json()).catch(() => null);
  if (d && d.version) $('barraTitulo').textContent = 'CRM HERMES · versión ' + d.version;
  if (d) {
    LK.pin = ''; LK.tmp = {};
    LK.modo = d.configurado ? 'pin' : 'setup2';
  }
  pintarLock();
}
function bloquear(motivo) {
  clearInterval(pollTimer); clearInterval(refreshTimer); pollTimer = refreshTimer = null;
  YO = null; EST = null; chatSel = null; fichaSig = '';
  syncVista(true);   // WhatsApp se oculta en el mismo instante
  fetch('/api/auth/bloquear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) }).catch(() => {});
  mostrarLock();
}
async function entrar() {
  const d = await fetch('/api/auth/estado').then((r) => r.json());
  if (!d.sesion) return mostrarLock();
  YO = d.sesion;
  $('lock').classList.add('off'); document.body.classList.remove('locked');
  ultimaRespuesta = Date.now(); avisoBloqueo = false;
  try { CFG = await GET('/api/config'); Object.assign(UI, CFG.ui || {}); } catch {}
  aplicarUI(); cargarTema(CFG && CFG.apariencia);
  // Consejo de uso: solo las primeras veces que abres el programa
  const vistos = UI.consejosVistos || 0;
  mostrarConsejo = UI.consejo !== false && vistos < 3;
  if (mostrarConsejo) guardarUI({ consejosVistos: vistos + 1 });
  await poll(); pollTimer = setInterval(poll, 2000);
  refreshTimer = setInterval(() => { if (current === 'inicio') actualizarHub(); if (current === 'hoy' && $('modal').hidden) loadHoy(); if (current === 'pipeline' && !document.querySelector('.col.drop') && $('modal').hidden) loadPipeline(); }, 15000);
  current = ''; go('inicio');
  if (pendienteChat) { const t = pendienteChat; pendienteChat = null; openChat(t); }
}
// Bloqueo automático: 30 minutos sin responder ningún chat
const BLOQUEO_MIN = 30;
let avisoBloqueo = false;
setInterval(() => {
  if (!YO) return;
  const pasado = Date.now() - ultimaRespuesta;
  if (pasado > BLOQUEO_MIN * 60000) return bloquear('inactividad');
  if (!avisoBloqueo && pasado > (BLOQUEO_MIN - 2) * 60000) { avisoBloqueo = true; toast('El programa se bloqueará en 2 minutos si no respondes ningún chat'); }
}, 15000);

// ---------------- Venta cerrada: felicitaciones y anualidad ----------------
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dma = (f) => String(f).slice(0, 10).split('-').reverse().join('-');   // AAAA-MM-DD → DD-MM-AAAA
const MOTIVOS_ANUAL = ['Apertura de cartera', 'Cambio de plan'];
// Cambia la etapa desde cualquier lugar; si el lead pasa a Ingresado por primera vez, celebra
async function cambiarEtapa(tel, etapa, motivo = '') {
  const r = await PATCH('/api/contactos/' + tel, { etapa, motivo_perdida: motivo });
  if (r && r.celebrar) celebrar(r.celebrar);
  return r;
}
function confeti(caja, n) {
  const C = ['var(--terra)', 'var(--green)', 'var(--orange)', 'var(--cream)', 'var(--ok)', 'var(--terra-d)'];
  caja.innerHTML = Array.from({ length: n }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${C[i % C.length]};animation-duration:${2.4 + Math.random() * 2}s;animation-delay:${-Math.random() * 3}s;--giro:${Math.random() < 0.5 ? -1 : 1}"></i>`).join('');
}
// 1) Tarjeta al centro con confeti; 2) al cerrarla, baja una franja verde que se va sola a los 5 segundos
function celebrar(d) {
  const f = $('fiesta'); clearTimeout(celebrar._t);
  f.className = 'fiesta tarjeta'; f.hidden = false;
  f.innerHTML = `<div class="conf"></div><div class="ftar" role="dialog" aria-modal="true" aria-labelledby="ftT"><div class="em" aria-hidden="true">🎉</div><h3 id="ftT">¡Felicitaciones!</h3><p>${esc(d.nombre)} ya es tu cliente${d.isapre ? ` en <b>${esc(d.isapre)}</b>` : ''}.</p><div class="dato">Su anualidad cuenta desde hoy, <b>${dma(d.desde)}</b>.<br>Te aviso un mes antes del <b>${dma(d.aniversario)}</b>.</div><button class="btn pri lg" id="ftOk">¡Vamos!</button></div>`;
  confeti(f.querySelector('.conf'), 70);
  document.body.classList.add('tapado'); syncVista(true);
  $('ftOk').focus();
  $('ftOk').onclick = () => {
    document.body.classList.remove('tapado'); syncVista(true);
    f.className = 'fiesta franja';
    f.innerHTML = `<div class="conf"></div><div class="fban" role="status"><span class="em" aria-hidden="true">🎉</span><span><b>¡Venta cerrada!</b><br><span class="small">${esc(d.nombre)}${d.isapre ? ' · ' + esc(d.isapre) : ''} · anualidad desde hoy ${dma(d.desde)}</span></span></div>`;
    confeti(f.querySelector('.conf'), 30);
    celebrar._t = setTimeout(() => { f.hidden = true; f.innerHTML = ''; }, 5000);
  };
}
// Bloque «Anualidad» de la ficha (se completa con el historial al llegar)
function anualHTML(c) {
  if (!c || (c.etapa !== 'Ingresado' && !c.anualidad)) return '';
  const a = c.anualidad;
  if (!a) return `<div class="fsec anual" data-anual="${c.telefono}"><span class="small muted" style="font-weight:700">Anualidad</span><span class="small muted">Sin anualidad: entró a Ingresado antes de esta versión y no hay fecha guardada.</span><button class="btn sm" data-afijar>Fijar anualidad</button></div>`;
  return `<div class="fsec anual" data-anual="${c.telefono}"><span class="small muted" style="font-weight:700">Anualidad</span><span>Desde <b>${dma(a.desde)}</b> · aniversario <b>${dma(a.aniversario)}</b></span><div class="abar"><span style="width:${Math.round(a.progreso * 100)}%"></span></div><span class="small muted">${a.mesesFaltan ? `Faltan ${a.mesesFaltan} mes${a.mesesFaltan === 1 ? '' : 'es'}` : a.diasFaltan ? `Faltan ${a.diasFaltan} día${a.diasFaltan === 1 ? '' : 's'}` : 'Es hoy'} · ${a.aviso >= hoyISO() ? 'te aviso el ' + dma(a.aviso) : 'aviso ya enviado'} · se renueva sola</span><button class="btn sm" data-arenovar>↻ Renovar anualidad</button><div class="ahist" hidden></div></div>`;
}
const TIPO_ANUAL = { ingreso: 'Ingresado', automatica: 'Se renovó sola', fijada: 'Anualidad fijada a mano' };
async function activarAnual(raiz, c, listo) {
  const el = raiz.querySelector('[data-anual]'); if (!el) return;
  const nom = nombreDe(c);
  const b1 = el.querySelector('[data-arenovar]'), b2 = el.querySelector('[data-afijar]');
  if (b1) b1.onclick = () => renovarModal(c, 'renovada', listo);
  if (b2) b2.onclick = () => renovarModal(c, 'fijada', listo);
  const h = el.querySelector('.ahist'); if (!h) return;
  const d = await GET(`/api/contactos/${c.telefono}/anualidad`).catch(() => null);
  if (!d || !d.historial.length) return;
  h.innerHTML = '<span class="small muted" style="font-weight:700">Historial</span>' + d.historial.slice(0, 6).map((x) => `<span class="small">${dma(x.fecha)} · ${x.tipo === 'renovada' ? 'Renovada por ' + esc(String(x.motivo || '').toLowerCase()) : TIPO_ANUAL[x.tipo] || ''}${x.isapre ? ' (' + esc(x.isapre) + ')' : ''}</span>`).join('');
  h.hidden = false; void nom;
}
// Renovar (apertura de cartera, cambio de plan u otro) o fijar la fecha de un cliente sin anualidad
function renovarModal(c, tipo, listo) {
  const hoy = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const renovar = tipo === 'renovada';
  modal(`<span class="eyebrow">Anualidad</span><h3>${renovar ? 'Renovar anualidad' : 'Fijar anualidad'}</h3><span class="small muted">${esc(nombreDe(c))} ${renovar ? 'empezará a contar un año nuevo.' : 'empezará a contar su año desde la fecha que elijas.'}</span>
    ${renovar ? `<span class="small muted" style="font-weight:700">Motivo</span>${[...MOTIVOS_ANUAL, 'Otro motivo…'].map((m, i) => `<label class="opc ${i ? '' : 'on'}"><input type="radio" name="amot" value="${i < MOTIVOS_ANUAL.length ? esc(m) : ''}" ${i ? '' : 'checked'}><span>${m}</span></label>`).join('')}<input id="aOtro" maxlength="80" placeholder="Escribe el motivo" hidden>` : ''}
    <label class="f">${renovar ? 'Nueva fecha de inicio' : 'Fecha de inicio'}<input type="date" id="aFecha" value="${hoy}"></label>
    ${renovar ? `<label class="f">Nueva Isapre (si cambió)<input id="aIsa" list="isaList2" placeholder="${esc(c.isapre || '')}"></label><datalist id="isaList2">${['Banmédica', 'Colmena', 'Consalud', 'Cruz Blanca', 'Esencial', 'Nueva Masvida', 'Vida Tres'].map((x) => `<option>${x}</option>`).join('')}</datalist>` : ''}
    <span class="small" id="aErr" style="color:var(--bad)"></span>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn pri" id="aOk">${renovar ? 'Renovar' : 'Fijar'}</button></div>`, (box, close) => {
    box.querySelectorAll('input[name=amot]').forEach((r) => (r.onchange = () => { box.querySelectorAll('.opc').forEach((o) => o.classList.toggle('on', o.contains(r) && r.checked)); $('aOtro').hidden = r.value !== ''; if (!$('aOtro').hidden) $('aOtro').focus(); }));
    $('aOk').onclick = async () => {
      const sel = box.querySelector('input[name=amot]:checked');
      const motivo = renovar ? (sel && sel.value ? sel.value : $('aOtro').value.trim()) : '';
      if (renovar && !motivo) { $('aErr').textContent = 'Escribe el motivo'; return; }
      try {
        await POST(`/api/contactos/${c.telefono}/anualidad`, { tipo, fecha: $('aFecha').value, motivo, isapre: renovar ? $('aIsa').value : '' });
        close(); toast(renovar ? 'Anualidad renovada' : 'Anualidad fijada'); loadPipeline.sig = ''; if (listo) listo();
      } catch (e) { $('aErr').textContent = e.message; }
    };
  });
}

// ---------------- Documentos de clientes (carpeta del escritorio) ----------------
const kb = (n) => (n >= 1048576 ? (n / 1048576).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' kB');
const icoDoc = (n) => { const e = (String(n).split('.').pop() || '').toLowerCase(); return e === 'pdf' ? ['PDF', 'pdf'] : /^(jpe?g|png|webp|heic|gif)$/.test(e) ? ['IMG', 'img'] : /^(docx?|xlsx?|odt)$/.test(e) ? [e.slice(0, 3).toUpperCase(), 'ofi'] : ['DOC', 'otro']; };
async function pintarDocs(el, tel) {
  if (!el) return;
  const d = await GET('/api/documentos/' + tel).catch(() => ({ archivos: [] }));
  if (!d.archivos.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span class="small muted" style="font-weight:700">Documentos (${d.archivos.length})</span>${d.archivos.slice(0, 8).map((a) => { const [t, k] = icoDoc(a.nombre); return `<button type="button" class="docit" data-doc="${esc(a.nombre)}" title="Abrir"><span class="dico ${k}">${t}</span><span class="grow ell">${esc(a.nombre)}<span class="small muted"> · ${esc(cuando(a.fecha))} · ${kb(a.tam)}</span></span></button>`; }).join('')}${d.archivos.length > 8 ? `<span class="small muted">y ${d.archivos.length - 8} más en la carpeta</span>` : ''}<button class="btn sm" data-docdir>Abrir carpeta</button>`;
  el.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => POST(`/api/documentos/${tel}/abrir`, { nombre: b.dataset.doc }).catch((e) => toast(e.message))));
  el.querySelector('[data-docdir]').onclick = () => POST(`/api/documentos/${tel}/abrir`).catch((e) => toast(e.message));
}
// Aviso al guardar un documento, con la opción de mandarlo a Descargas si no era del cliente
let docVisto = null;
function avisoDocumento(d) {
  if (!d) return;
  if (docVisto === null) { docVisto = d.id; return; }   // al abrir el programa no se repite el último aviso
  if (d.id === docVisto) return;
  docVisto = d.id;
  const el = $('docAviso'); clearTimeout(avisoDocumento._t);
  el.innerHTML = `<span>✓ Guardado en la carpeta de <b>${esc(d.cliente)}</b><span class="small"> · ${esc(d.archivo)}</span></span><button class="btn sm" id="daMover">Mover a Descargas</button><button class="lnk" id="daX" aria-label="Cerrar">×</button>`;
  el.hidden = false;
  $('daX').onclick = () => { el.hidden = true; };
  $('daMover').onclick = async () => { try { await POST('/api/documentos/mover-a-descargas', { ruta: d.ruta }); el.hidden = true; toast('Movido a Descargas'); fichaSig = ''; if (current === 'chats') leerActivo(); } catch (e) { toast(e.message); } };
  avisoDocumento._t = setTimeout(() => { el.hidden = true; }, 12000);
  if (current === 'chats') { fichaSig = ''; leerActivo(); }
}

// ---------------- Tema de color ----------------
// Claro, Invertido, Oscuro o Automático (oscuro de noche). Se guarda en la configuración y en este PC para abrir sin destello
const TEMA = { tema: 'claro', auto: { ...TEMAS.AUTO } };
try { TEMA.tema = localStorage.getItem('tema') || 'claro'; TEMA.auto = JSON.parse(localStorage.getItem('temaAuto') || 'null') || TEMA.auto; } catch {}
function aplicarTema() {
  const ef = TEMAS.temaEfectivo(TEMA.tema, new Date(), TEMA.auto);
  if (document.documentElement.dataset.tema !== ef) { document.documentElement.dataset.tema = ef; if (typeof layout === 'function' && document.body.classList.contains('hub')) layout(); }
  const t = TEMAS.TEMAS.find((x) => x.id === TEMA.tema) || TEMAS.TEMAS[0];
  $('bTema').innerHTML = TEMAS.ICONO[t.id]; $('bTema').title = 'Tema: ' + t.nombre; $('bTema').setAttribute('aria-label', 'Tema de color: ' + t.nombre);
  if (window.crmNativo && window.crmNativo.tema && aplicarTema.ultimo !== ef) { aplicarTema.ultimo = ef; window.crmNativo.tema(ef); }
}
function cargarTema(ap) {
  if (ap && ap.tema) TEMA.tema = ap.tema;
  if (ap && ap.auto) TEMA.auto = { ...TEMAS.AUTO, ...ap.auto };
  try { localStorage.setItem('tema', TEMA.tema); localStorage.setItem('temaAuto', JSON.stringify(TEMA.auto)); } catch {}
  aplicarTema();
}
async function guardarTema(cambios) {
  Object.assign(TEMA, cambios); cargarTema();
  const ap = { ...((CFG && CFG.apariencia) || {}), tema: TEMA.tema, auto: TEMA.auto };
  if (CFG) CFG.apariencia = ap;
  await PUT('/api/config/apariencia', { valor: ap }).catch(() => {});
  pintarTemasConfig();
}
function pintarTemasPop() {
  $('temaPop').innerHTML = TEMAS.TEMAS.map((t) => `<button type="button" role="menuitemradio" aria-checked="${t.id === TEMA.tema}" class="tit ${t.id === TEMA.tema ? 'on' : ''}" data-tema="${t.id}">${TEMAS.ICONO[t.id]}<span>${t.nombre}</span></button>`).join('');
  $('temaPop').querySelectorAll('[data-tema]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); guardarTema({ tema: b.dataset.tema }); cerrarPops(); }));
}
function pintarTemasConfig() {
  if (!$('kTemas')) return;
  $('kTemas').innerHTML = TEMAS.TEMAS.map((t) => `<button type="button" class="tit ${t.id === TEMA.tema ? 'on' : ''}" data-tema="${t.id}">${TEMAS.ICONO[t.id]}<span>${t.nombre}</span></button>`).join('');
  $('kTemas').querySelectorAll('[data-tema]').forEach((b) => (b.onclick = () => guardarTema({ tema: b.dataset.tema })));
  $('tOsc').value = TEMA.auto.oscuro; $('tCla').value = TEMA.auto.claro;
  $('tOsc').onchange = $('tCla').onchange = () => { if ($('tOsc').value && $('tCla').value && $('tOsc').value !== $('tCla').value) guardarTema({ auto: { oscuro: $('tOsc').value, claro: $('tCla').value } }); };
}
$('bTema').onclick = (e) => {
  e.stopPropagation();
  if (!$('temaPop').hidden) return cerrarPops();
  cerrarPops(); pintarTemasPop(); const r = $('bTema').getBoundingClientRect(); Object.assign($('temaPop').style, { top: r.bottom + 8 + 'px', right: Math.max(8, innerWidth - r.right) + 'px' }); $('temaPop').hidden = false; $('bTema').classList.add('on');
  const f = $('temaPop').querySelector('.on'); if (f) f.focus();
};
document.addEventListener('mousedown', (e) => { if (!$('temaPop').hidden && !$('temaPop').contains(e.target) && !$('bTema').contains(e.target)) cerrarPops(); });
aplicarTema(); setInterval(aplicarTema, 60000);

// ---------------- Buscador y atajos ----------------
function cerrarPops() {
  $('temaPop').hidden = true; $('bTema').classList.remove('on');
  $('buscador').hidden = true;
  if ($('bienvenida').hidden) document.body.classList.remove('tapado');
  syncVista(true);
}
function tapar() { document.body.classList.add('tapado'); syncVista(true); }
let bqSel = 0, bqLista = [];
function abrirBuscar() {
  if (!YO || document.body.classList.contains('locked')) return;
  cerrarPops(); tapar(); $('buscador').hidden = false; $('bqIn').value = ''; $('bqRes').innerHTML = '<div class="small muted" style="padding:6px 12px">Escribe un nombre o un teléfono</div>'; bqLista = []; $('bqIn').focus();
}
window.abrirBuscar = abrirBuscar;
$('bBuscar').onclick = abrirBuscar;
$('bqX').onclick = cerrarPops;
$('buscador').addEventListener('mousedown', (e) => { if (e.target.id === 'buscador') cerrarPops(); });
function pintarBusqueda() {
  $('bqRes').innerHTML = bqLista.length ? bqLista.map((c, i) => `<div class="bres ${i === bqSel ? 'sel' : ''}" data-bi="${i}"><span class="av" style="background:${c.lead ? 'var(--green)' : 'var(--sand2)'};color:${c.lead ? 'var(--cream)' : 'var(--text)'}">${esc(ini(c.nombre, c.apellido))}</span><div class="grow" style="min-width:0"><b class="ell" style="display:block">${esc(nombreDe(c))}</b><span class="small muted">${fmtTel(c.telefono)}${c.etapa ? ' · ' + esc(c.etapa) : ' · aún no es lead'}</span></div><button class="btn sm" data-bchat="${c.telefono}">Abrir chat</button>${c.lead ? `<button class="btn sm" data-bficha="${c.telefono}">Ver ficha</button>` : ''}</div>`).join('') : '<div class="small muted" style="padding:6px 12px">Sin resultados</div>';
  $('bqRes').querySelectorAll('[data-bchat]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); cerrarPops(); openChat(b.dataset.bchat); }));
  $('bqRes').querySelectorAll('[data-bficha]').forEach((b) => (b.onclick = async (e) => { e.stopPropagation(); cerrarPops(); const r = await GET('/api/contactos?limite=5&q=' + encodeURIComponent(b.dataset.bficha)).catch(() => null); const c = r && r.contactos.find((x) => x.telefono === b.dataset.bficha); if (c) contactoModal(c, () => { if (current === 'pipeline') loadPipeline(); }); }));
  $('bqRes').querySelectorAll('[data-bi]').forEach((b) => (b.onclick = () => { cerrarPops(); openChat(bqLista[+b.dataset.bi].telefono); }));
}
$('bqIn').oninput = () => { clearTimeout(abrirBuscar._t); abrirBuscar._t = setTimeout(async () => {
  const q = $('bqIn').value.trim(); if (!q) { bqLista = []; $('bqRes').innerHTML = ''; return; }
  const d = await GET('/api/buscar?q=' + encodeURIComponent(q)).catch(() => ({ resultados: [] }));
  const tel = normPhone(q); bqLista = d.resultados;
  if (tel && !bqLista.some((x) => x.telefono === tel)) bqLista.push({ telefono: tel, nombre: '', apellido: '', etapa: null, lead: false });
  bqSel = 0; pintarBusqueda();
}, 160); };
$('bqIn').onkeydown = (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); bqSel = Math.min(bqLista.length - 1, bqSel + 1); pintarBusqueda(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); bqSel = Math.max(0, bqSel - 1); pintarBusqueda(); }
  else if (e.key === 'Enter' && bqLista[bqSel]) { e.preventDefault(); const t = bqLista[bqSel].telefono; cerrarPops(); openChat(t); }
};
const ATAJOS = { 1: 'inicio', 2: 'chats', 3: 'pipeline', 4: 'envios', 5: 'leads', 6: 'auto', 7: 'cotizador' };
document.addEventListener('keydown', (e) => {
  if (!YO || document.body.classList.contains('locked')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBuscar(); return; }
  if (e.key === 'Escape') {
    if (e.defaultPrevented) return;
    if (!$('modal').hidden || !$('bienvenida').hidden) return;
    if (!$('buscador').hidden || !$('temaPop').hidden) { cerrarPops(); return; }
    if (document.querySelector('.emojipop')) return;
    go('inicio'); return;
  }
  const t = e.target; const escribiendo = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (escribiendo || e.ctrlKey || e.altKey || e.metaKey || !$('modal').hidden || !$('buscador').hidden) return;
  if (ATAJOS[e.key]) { e.preventDefault(); go(ATAJOS[e.key]); }
});

// ---------------- Arranque ----------------
let pendienteChat = null;
(async () => {
  const d = await fetch('/api/auth/estado').then((r) => r.json()).catch(() => null);
  if (d && d.sesion) await entrar(); else await mostrarLock();
  // La pantalla abrió y conversa con el programa: si esta versión vino como actualización liviana, queda confirmada
  if (d && window.crmNativo && window.crmNativo.sano) window.crmNativo.sano();
})();
window.abrirChat = (tel) => { if (!YO) { pendienteChat = tel; return; } openChat(tel); };
