// CRM HERMES · Conecta Salud — servidor local del programa
const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { Client, LocalAuth, NoAuth } = require('whatsapp-web.js');

module.exports.start = async function start({ dataDir, browserPaths = [], port = 0, version = '', notify = () => {}, updater = null, embebido = null }) {
const DATA = dataDir;
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
const { openDb, ETAPAS } = require('./db');
const db = await openDb(DATA);
try { db.limpiarContactosLid(); db.limpiarDuplicados(); } catch (e) { console.log(e); }
setTimeout(() => { try { repararLids(); } catch (e) { console.log(e); } }, 1000);

// ---------- Registro ----------
const LOG = path.join(DATA, 'registro.txt');
const log = (m) => { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {} console.log(m); };
const eventos = [];   // actividad reciente que ve el usuario
const evento = (e) => { eventos.push({ hora: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }), ...e }); if (eventos.length > 300) eventos.shift(); };

// ---------- Utilidades ----------
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('560')) d = '56' + d.slice(3);
  if (d.length === 9 && d[0] === '9') d = '56' + d;
  if (d.length === 8) d = '569' + d;
  return /^569\d{8}$/.test(d) ? d : null;
}
const money = (v) => { const n = parseInt(String(v ?? '').replace(/\D/g, '')); return isNaN(n) ? String(v ?? '') : '$' + n.toLocaleString('es-CL'); };
const edadActual = (c) => { if (c.edad == null) return ''; const años = c.edad_fecha ? Math.floor((Date.now() - new Date(c.edad_fecha)) / 31557600000) : 0; return String(c.edad + Math.max(0, años)); };
function fill(tpl, c = {}) {
  return String(tpl || '')
    .replace(/\{nombre\}/gi, (c.nombre || '').trim())
    .replace(/\{apellido\}/gi, (c.apellido || '').trim())
    .replace(/\{cargas\}/gi, (c.cargas || '').trim())
    .replace(/\{sueldo\}|\{renta\}/gi, c.renta ? money(c.renta) : '')
    .replace(/\{edad\}/gi, c.edad != null && c.edad !== '' ? (c.edad_fecha ? edadActual(c) : String(c.edad)) : '')
    .replace(/\{isapre\}/gi, (c.isapre || 'tu Isapre').trim())
    .replace(/[ \t]+([,.!?])/g, '$1').replace(/ {2,}/g, ' ').trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.round(a + Math.random() * (b - a));
const hhmm = (s) => { const [h, m] = String(s || '0:0').split(':').map((x) => parseInt(x) || 0); return h * 60 + m; };
function enHorario(d = new Date()) {
  const h = db.getConfig('reglas').horario;
  const dia = d.getDay(); const r = dia === 0 ? h.dom : dia === 6 ? h.sab : h.lv;
  if (!r || !r.on) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= hhmm(r.desde) && m < hhmm(r.hasta);
}
const OPTOUT_RX = /^\s*(baja|stop|no\s*m[aá]s|no\s*me\s*escrib|no\s*gracias|eliminar|desuscrib)/i;

// ---------- WhatsApp ----------
const wa = { state: 'iniciando', qr: null, me: null, err: null, detalle: null, progreso: null };
const SESSION = path.join(DATA, 'sesion');
let client = null;

// Borra bloqueos que quedan si el programa se cerró de golpe
function clearLocks() {
  const walk = (d) => { try { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (/^Singleton(Lock|Cookie|Socket)$|^lockfile$/.test(f.name)) { try { fs.rmSync(p, { force: true }); } catch {} }
  } } catch {} };
  walk(SESSION);
}

// Descarga (una sola vez) el navegador que usa WhatsApp por detrás, como fallback
async function ensureOwnChrome() {
  const B = require('@puppeteer/browsers');
  const { PUPPETEER_REVISIONS } = require('puppeteer-core/lib/cjs/puppeteer/revisions.js');
  const cacheDir = path.join(DATA, 'navegador');
  const platform = B.detectBrowserPlatform();
  const buildId = PUPPETEER_REVISIONS.chrome;
  const exe = B.computeExecutablePath({ browser: B.Browser.CHROME, buildId, cacheDir, platform });
  if (fs.existsSync(exe)) return exe;
  wa.state = 'descargando'; wa.progreso = 0;
  log('Descargando navegador propio ' + buildId);
  await B.install({ browser: B.Browser.CHROME, buildId, cacheDir, platform,
    downloadProgressCallback: (d, t) => { wa.progreso = t ? Math.round(d / t * 100) : null; } });
  wa.progreso = null;
  return exe;
}

// WhatsApp a veces identifica a las personas con un código interno (LID) en vez del número.
// Estas funciones traducen ese código al número real y al revés.
const lidCache = new Map(), telLid = new Map();
const esTel = (t) => /^\d{8,13}$/.test(String(t || ''));
const esLid = (t) => /^\d{14,16}$/.test(String(t || '')) && !/^569\d{8}$/.test(String(t));
function aprenderLid(lid, tel) {
  if (!lid || !esTel(tel) || lid === tel) return;
  if (lidCache.get(lid + '@lid') === tel) return;
  lidCache.set(lid + '@lid', tel); telLid.set(tel, lid + '@lid');
  db.fusionarLid(lid, tel);
  log(`Código interno ${lid} = ${tel}`);
}
async function resolvePhone(id) {
  id = String(id || '');
  if (id.endsWith('@c.us')) { const u = id.split('@')[0]; return esLid(u) ? (db.telDeLid(u) || null) : u; }
  if (!id.endsWith('@lid')) return null;
  const lid = id.split('@')[0];
  if (lidCache.has(id)) return lidCache.get(id);
  let tel = db.telDeLid(lid);
  if (!tel) {
    try { const [r] = await client.getContactLidAndPhone([id]); const pn = r && r.pn ? r.pn.split('@')[0] : null; if (esTel(pn) && pn !== lid) tel = pn; }
    catch (e) { log('getContactLidAndPhone: ' + (e.message || e)); }
  }
  if (tel) aprenderLid(lid, tel);
  return tel;
}
// Clave con que se guarda un chat: el número real si se conoce; si WhatsApp lo oculta, su código interno
async function telDe(msg, campo) {
  const id = String(msg[campo] || '');
  const tel = await resolvePhone(id);
  if (tel) return tel;
  return id.endsWith('@lid') ? id.split('@')[0] : null;
}
// Envío con confirmación: WhatsApp a veces envía el mensaje pero no lo informa de vuelta.
// Para no mandar dos veces, se espera a ver el mensaje salir (evento de WhatsApp) antes de reintentar.
const esperando = new Set();
function esperarSalida(pred, ms) {
  let w;
  const p = new Promise((resolve) => { w = { pred, resolve }; esperando.add(w); setTimeout(() => { esperando.delete(w); resolve(null); }, ms); });
  p.cancel = () => esperando.delete(w);
  return p;
}
function avisarSalida(msg) {
  for (const w of esperando) { let si = false; try { si = w.pred(msg); } catch {} if (si) { esperando.delete(w); w.resolve(msg); return true; } }
  return false;
}
async function enviarUnaVez(destino, contenido, opts = {}) {
  const esTexto = typeof contenido === 'string';
  const cap = String(esTexto ? contenido : opts.caption || '').trim();
  const salida = esperarSalida((m) => String(m.body || '').trim() === cap && (esTexto ? !m.hasMedia : m.hasMedia), esTexto ? 12000 : 45000);
  let m;
  try { m = await client.sendMessage(destino, contenido, { sendSeen: false, ...opts }); }
  catch (e) { salida.cancel(); throw e; }
  if (m) { salida.cancel(); return m; }
  return await salida;   // null si en 12 s no se vio salir
}
async function yaSalio(chatIds, cuerpo, conArchivo) {
  const cap = String(cuerpo || '').trim(), desde = Date.now() / 1000 - 180;
  for (const cid of chatIds) {
    try {
      const ch = await client.getChatById(cid); if (!ch) continue;
      const ms = await ch.fetchMessages({ limit: 8, fromMe: true });
      const m = ms.reverse().find((x) => x.fromMe && x.timestamp >= desde && String(x.body || '').trim() === cap && (!!x.hasMedia === !!conArchivo));
      if (m) return m;
    } catch {}
  }
  return null;
}
async function enviarA(tel, texto, opts) {
  let m;
  if (esLid(tel)) m = await enviarUnaVez(tel + '@lid', texto, opts);   // chat con número oculto
  else {
    const id = await client.getNumberId(tel);
    if (!id) { const e = new Error('No tiene WhatsApp'); e.sinWa = true; throw e; }
    m = await enviarUnaVez(id._serialized, texto, opts);
    if (!m) {   // no se vio salir: antes de reintentar, revisa si igual salió (para no mandarlo dos veces)
      let lid = telLid.get(tel);
      if (!lid) { try { const [r] = await client.getContactLidAndPhone([id._serialized]); lid = r && r.lid; } catch {} }
      m = await yaSalio([id._serialized, lid].filter(Boolean), typeof texto === 'string' ? texto : (opts && opts.caption) || '', typeof texto !== 'string');
      if (!m && lid) m = await enviarUnaVez(lid, texto, opts);
    }
  }
  if (!m) throw new Error('WhatsApp no confirmó el envío. Revisa en tu celular si el mensaje salió antes de reenviarlo.');
  const remoto = String(m.id?.remote?._serialized || m.id?.remote || m.to || '');
  if (!esLid(tel) && remoto.endsWith('@lid')) aprenderLid(remoto.split('@')[0], tel);
  if (m.id) db.run('UPDATE mensajes SET telefono = ? WHERE wa_id IN (?, ?)', [tel, m.id.id || '', m.id._serialized || '']);
  return m;
}
async function chatDe(tel) {
  if (esLid(tel)) { try { return await client.getChatById(tel + '@lid'); } catch { return null; } }
  const id = await client.getNumberId(tel).catch(() => null);
  const lidDb = db.lidDeTel(tel);
  const intentos = [id && id._serialized, telLid.get(tel), lidDb && lidDb + '@lid', tel + '@c.us'].filter(Boolean);
  for (const x of intentos) { try { const ch = await client.getChatById(x); if (ch) return ch; } catch {} }
  return null;
}
// Repara chats guardados con código interno comparando con lo que el programa envió (mismo texto, misma hora)
function repararLids() {
  const filas = db.all("SELECT DISTINCT telefono FROM mensajes WHERE LENGTH(telefono) >= 14");
  for (const { telefono: lid } of filas) {
    if (!esLid(lid)) continue;
    const conocido = db.telDeLid(lid); if (conocido) { db.fusionarLid(lid, conocido); continue; }
    const mios = db.all('SELECT texto, fecha FROM mensajes WHERE telefono = ? AND de_mi = 1 ORDER BY fecha DESC LIMIT 10', [lid]);
    for (const m of mios) {
      const t0 = new Date(new Date(m.fecha) - 5 * 60000).toISOString(), t1 = new Date(new Date(m.fecha).getTime() + 5 * 60000).toISOString();
      const e = db.get("SELECT telefono FROM envios WHERE texto = ? AND fecha BETWEEN ? AND ? AND estado = 'enviado' AND LENGTH(telefono) <= 13 LIMIT 1", [m.texto, t0, t1]);
      if (e) { aprenderLid(lid, e.telefono); break; }
    }
  }
}
// Trae los chats recientes de WhatsApp a la bandeja (al conectar)
let sincronizando = false;
async function sincronizarChats() {
  if (sincronizando || wa.state !== 'listo') return; sincronizando = true;
  try {
    const chats = (await client.getChats()).filter((c) => !c.isGroup && ['c.us', 'lid'].includes(c.id?.server)).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 60);
    wa.sync = { total: chats.length, hechos: 0 };
    for (const ch of chats) {
      try {
        const tel = (await resolvePhone(ch.id._serialized)) || (ch.id.server === 'lid' ? ch.id.user : null);
        if (!tel || tel === wa.me) continue;
        if (ch.name && db.nombreWa(tel) !== ch.name) db.guardarNombreWa(tel, ch.name);
        // Solo trae lo nuevo: si el chat no tiene actividad desde lo último guardado, se salta
        const ultimo = db.get('SELECT MAX(fecha) AS f FROM mensajes WHERE telefono = ?', [tel]).f;
        const noLeidos = ch.unreadCount || 0;
        if (ultimo && ch.timestamp && ch.timestamp * 1000 <= new Date(ultimo).getTime() + 1000) {
          if (!noLeidos && db.get('SELECT 1 AS x FROM mensajes WHERE telefono = ? AND leido = 0 LIMIT 1', [tel])) db.marcarLeido(tel);
          wa.sync.hechos++; continue;
        }
        const msgs = await ch.fetchMessages({ limit: ultimo ? 20 : 30 });
        const entrantes = msgs.filter((m) => !m.fromMe);
        const sinLeer = new Set(entrantes.slice(entrantes.length - noLeidos).map((m) => m.id?.id || m.id?._serialized));
        for (const m of msgs) guardarMsj(m, tel, { leido: m.fromMe || !sinLeer.has(m.id?.id || m.id?._serialized) });
      } catch (e) { log('sync chat: ' + e.message); }
      wa.sync.hechos++;
    }
    log(`Chats sincronizados: ${chats.length}`);
    repararLids(); db.limpiarDuplicados();
  } catch (e) { log('sync: ' + (e.stack || e)); }
  wa.sync = null; sincronizando = false;
}
function tipoMsj(msg) { return msg.type === 'chat' ? null : msg.type; }
// ---------- Imágenes y archivos ----------
const MEDIA = path.join(DATA, 'media');
if (!fs.existsSync(MEDIA)) fs.mkdirSync(MEDIA, { recursive: true });
const AUTO_MEDIA = ['image', 'sticker', 'ptt', 'audio'];           // se descargan solos
const MAX_AUTO = 16 * 1024 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/pdf': 'pdf' };
const extDe = (mime, nombre) => { const e = nombre && /\.([a-z0-9]{1,5})$/i.exec(nombre); return (e && e[1].toLowerCase()) || EXT[String(mime || '').split(';')[0]] || 'bin'; };
function datosMsj(msg, tel, extra = {}) {
  const d = { wa_id: msg.id?.id || msg.id?._serialized, wa_ser: msg.id?._serialized, telefono: tel, de_mi: msg.fromMe, texto: textoMsj(msg), fecha: new Date((msg.timestamp || Date.now() / 1000) * 1000).toISOString(), ack: msg.ack, tipo: tipoMsj(msg), ...extra };
  if (msg.hasMedia) {
    d.media_mime = msg._data?.mimetype || null; d.media_nombre = msg._data?.filename || null; d.media_tam = msg._data?.size || null; d.media_estado = 'pendiente';
    if (msg.body) d.texto = msg.body;   // pie de foto
    else d.texto = '';
  }
  return d;
}
const descargando = new Map();
async function bajarMedia(id, msgObj) {
  if (descargando.has(id)) return descargando.get(id);
  const p = (async () => {
    const m = db.mensajeMedia(id); if (!m) throw new Error('No existe');
    if (m.media_archivo && fs.existsSync(path.join(MEDIA, m.media_archivo))) return m.media_archivo;
    if (wa.state !== 'listo') throw new Error('WhatsApp no está conectado');
    let msg = msgObj;
    if (!msg && m.wa_ser) { try { msg = await client.getMessageById(m.wa_ser); } catch {} }
    if (!msg) { db.marcarMedia(id, 'error'); throw new Error('Este archivo ya no está disponible en WhatsApp'); }
    const media = await msg.downloadMedia().catch(() => null);
    if (!media || !media.data) { db.marcarMedia(id, 'error'); throw new Error('Este archivo ya no está disponible en WhatsApp'); }
    const archivo = id + '.' + extDe(media.mimetype || m.media_mime, media.filename || m.media_nombre);
    fs.writeFileSync(path.join(MEDIA, archivo), Buffer.from(media.data, 'base64'));
    if (!m.media_mime && media.mimetype) db.run('UPDATE mensajes SET media_mime = ? WHERE id = ?', [media.mimetype, id]);
    if (!m.media_nombre && media.filename) db.run('UPDATE mensajes SET media_nombre = ? WHERE id = ?', [media.filename, id]);
    db.marcarMedia(id, 'ok', archivo);
    return archivo;
  })();
  descargando.set(id, p);
  try { return await p; } finally { descargando.delete(id); }
}
// Guarda un mensaje y, si es imagen, sticker o audio, lo descarga solo
function guardarMsj(msg, tel, extra) {
  const d = datosMsj(msg, tel, extra);
  const id = db.guardarMensaje(d);
  return id;
}
// Limpieza: archivos de más de 6 meses
try { for (const m of db.mediaAntigua(new Date(Date.now() - 180 * 86400000).toISOString())) { fs.rmSync(path.join(MEDIA, m.media_archivo), { force: true }); db.run("UPDATE mensajes SET media_archivo = NULL, media_estado = 'pendiente' WHERE id = ?", [m.id]); } } catch {}
function textoMsj(msg) {
  if (msg.body) return msg.body;
  const t = { image: '📷 Imagen', video: '🎥 Video', ptt: '🎤 Audio', audio: '🎤 Audio', document: '📄 Documento', sticker: 'Sticker', location: '📍 Ubicación', vcard: 'Contacto' };
  return t[msg.type] || '(mensaje)';
}

function wireClient(c) {
  c.on('qr', async (qr) => {
    if (wa.state !== 'qr') {
      log('WhatsApp pide escanear el QR');
      if (wa.me) notify('WhatsApp se desvinculó', 'Abre CRM HERMES → Chats y escanea el código QR con tu celular para volver a conectar.');
    }
    wa.state = 'qr'; wa.err = null; wa.qr = await QRCode.toDataURL(qr);
  });
  c.on('authenticated', () => { wa.state = 'autenticando'; wa.qr = null; });
  c.on('ready', async () => {
    const repetido = c._listo; c._listo = true;   // WhatsApp a veces avisa dos veces: se ignora la segunda
    wa.state = 'listo'; wa.qr = null; wa.err = null;
    if (repetido) return;
    const wid = c.info?.wid?._serialized || '';
    wa.me = (await resolvePhone(wid)) || c.info?.wid?.user || null;
    if (wa.me && !/^569\d{8}$/.test(wa.me)) { try { const [r] = await c.getContactLidAndPhone([wid]); if (r && r.pn) wa.me = r.pn.split('@')[0]; } catch {} }
    log('WhatsApp conectado como ' + wa.me); reconexion.intentos = 0;
    setTimeout(sincronizarChats, 4000);
  });
  c.on('auth_failure', (m) => { wa.state = 'error'; wa.err = 'Falló la autenticación: ' + m; log(wa.err); });
  c.on('disconnected', (r) => {
    c._listo = false; wa.state = 'desconectado'; log('Desconectado: ' + r); reconexion.proxima = Date.now() + 5000;
    if (r === 'LOGOUT' && wa.me) notify('WhatsApp se desvinculó', 'Abre CRM HERMES → Chats y escanea el código QR para volver a conectar.');
  });
  // Si lees un chat en WhatsApp (aquí o en el celular), se marca leído también en el CRM
  c.on('unread_count', async (ch) => {
    try { if (ch.unreadCount) return; const tel = (await resolvePhone(ch.id._serialized)) || (ch.id.server === 'c.us' ? ch.id.user : null); if (tel && db.get('SELECT 1 AS x FROM mensajes WHERE telefono = ? AND leido = 0 LIMIT 1', [tel])) db.marcarLeido(tel); } catch {}
  });

  // Todos los mensajes (entrantes y los que salen, también desde el celular) quedan en la bandeja
  c.on('message_create', async (msg) => {
    try {
      if (msg.fromMe && !avisarSalida(msg)) wa.ultimaRespuesta = Date.now();   // escribiste tú (no un envío automático)
      if (msg.isStatus || String(msg.from).includes('broadcast')) return;
      if (String(msg.from).endsWith('@g.us') || String(msg.to).endsWith('@g.us')) return;
      let tel = await telDe(msg, msg.fromMe ? 'to' : 'from');
      if (!tel) return;
      if (esLid(tel)) { await sleep(1500); tel = db.telDeLid(tel) || tel; }   // da tiempo a que el envío confirme el número
      guardarMsj(msg, tel);
    } catch (e) { log('message_create: ' + e.message); }
  });
  c.on('message_ack', (msg, ack) => { try { db.actualizarAck(msg.id?.id || msg.id?._serialized, ack); } catch {} });

  // Mensajes entrantes: bajas, etapa, secuencia, avisos y respuesta fuera de horario
  c.on('message', async (msg) => {
    try {
      if (msg.fromMe || msg.isStatus || String(msg.from).endsWith('@g.us')) return;
      let tel = await telDe(msg, 'from');
      if (!tel) return;
      if (esLid(tel)) tel = db.telDeLid(tel) || tel;
      let ct = db.contacto(tel);
      if (!ct && esLid(tel)) {
        try { const k = await msg.getContact(); db.guardarNombreWa(tel, k.name || k.pushname || ''); } catch {}
        ct = { telefono: tel, nombre: db.nombreWa(tel) };
      } else if (!ct) {
        let nombre = '';
        try { const k = await msg.getContact(); nombre = k.name || k.pushname || ''; db.guardarNombreWa(tel, nombre); } catch {}
        const [n, ...a] = nombre.split(' ');
        db.guardarContacto({ telefono: tel, nombre: n || '', apellido: a.join(' '), origen: 'whatsapp', etapa: 'Nuevo' });
        ct = db.contacto(tel);
      }
      db.run('UPDATE contactos SET ultimo_entrante = ? WHERE telefono = ?', [new Date().toISOString(), tel]);
      const quien = `${ct.nombre || ''} ${ct.apellido || ''}`.trim() || (esLid(tel) ? 'Número oculto' : '+' + tel);
      if (OPTOUT_RX.test(msg.body || '')) {
        db.agregarBaja(tel);
        evento({ quien, tel, estado: 'baja', detalle: 'Pidió no recibir más mensajes' });
        if (db.getConfig('avisos').baja) notify('Un contacto pidió BAJA', quien);
        return;
      }
      db.detenerSecuencia(tel, 'respondió');
      db.moverEtapaSi(tel, ['Nuevo', 'Contactado'], 'Respondió');
      if (db.getConfig('avisos').chatNuevo) notify('Nuevo mensaje de ' + quien, textoMsj(msg).slice(0, 120), { chat: tel });
      // Respuesta automática fuera de horario (una vez al día por persona)
      const fh = db.getConfig('fueraHorario');
      if (fh.activa && !enHorario() && !db.fueraHorarioHoy(tel) && !fhEnCurso.has(tel) && !db.esBaja(tel)) {
        fhEnCurso.add(tel); setTimeout(() => fhEnCurso.delete(tel), 120000);   // varios mensajes seguidos = una sola respuesta
        await sleep(rand(4000, 12000));
        const texto = fill(fh.texto, ct);
        await c.sendMessage(msg.from, texto, { sendSeen: false });
        db.registrarEnvio(tel, texto, 'fuera_horario');
        evento({ quien, tel, estado: 'enviado', detalle: 'Respuesta fuera de horario' });
      }
    } catch (e) { log('message: ' + (e.stack || e)); }
  });
}

// Cierra navegadores "fantasma" que quedaron usando la carpeta de sesión
const fhEnCurso = new Set();
async function killOrphans() {
  const { execFile } = require('child_process');
  const run = (cmd, args, env) => new Promise((r) => execFile(cmd, args, { timeout: 20000, windowsHide: true, env: { ...process.env, ...env } }, () => r()));
  if (process.platform === 'win32') {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and $_.CommandLine -and $_.CommandLine.Contains($env:ENV_SESION) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"],
      { ENV_SESION: SESSION });
  } else {
    await run('pkill', ['-f', SESSION]);
  }
  await new Promise((r) => setTimeout(r, 800));
}

// WhatsApp Web dentro del programa: la librería se conecta a la vista que muestra el CRM (un solo QR, un solo dispositivo)
async function conectarVista() {
  const puerto = await embebido.puerto();
  const c = new Client({
    authStrategy: new NoAuth(),
    puppeteer: {
      browserURL: 'http://127.0.0.1:' + puerto, defaultViewport: null, protocolTimeout: 120000,
      saltarCarga: primeraConexion,   // la primera vez WhatsApp ya viene cargando: no se recarga
      elegirPagina: async (browser) => {
        const t = await browser.waitForTarget((t) => t.type() === 'page' && /crmwa|web\.whatsapp\.com/.test(t.url()), { timeout: 20000 });
        // la vista puede estar a medio cargar: se reintenta unos segundos antes de rendirse
        for (let i = 0; ; i++) {
          try { const p = await t.page(); p.mainFrame(); return p; }
          catch (e) { if (i >= 8) throw e; await sleep(1000); }
        }
      }
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    webVersionCache: { type: 'none' }
  });
  primeraConexion = false;
  wireClient(c);
  // Nunca se queda pegado: si en 3 minutos no terminó de abrir, se corta y se reintenta
  let limite;
  try { await Promise.race([c.initialize(), new Promise((_, no) => { limite = setTimeout(() => no(new Error('WhatsApp tardó demasiado en abrir')), 180000); })]); }
  catch (e) { try { await c.destroy(); } catch {} throw e; }
  finally { clearTimeout(limite); }
  return c;
}

async function tryLaunch(exe) {
  await killOrphans();
  clearLocks();
  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION }),
    puppeteer: { headless: true, executablePath: exe, timeout: 90000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions'] }
  });
  wireClient(c);
  try { await c.initialize(); }
  catch (e) { try { await c.destroy(); } catch {} await killOrphans(); throw e; }
  return c;
}

// Reconexión automática: si WhatsApp se cae, reintenta solo (5 s, 30 s, 1 min, 2 min… hasta 10 min)
const reconexion = { intentos: 0, proxima: 0, pausada: false };
setInterval(() => {
  if (reconexion.pausada || starting || !['desconectado', 'error'].includes(wa.state)) return;
  if (!reconexion.proxima) { reconexion.proxima = Date.now() + 5000; return; }
  if (Date.now() < reconexion.proxima) return;
  reconexion.intentos++;
  reconexion.proxima = Date.now() + Math.min(180000, 20000 * 2 ** Math.min(4, reconexion.intentos - 1));   // máximo cada 3 min
  log('Reconexión automática, intento ' + reconexion.intentos);
  startWhatsApp().catch(() => {});
}, 5000).unref?.();

let starting = false, puertoServidor = 0, primeraConexion = true;
async function startWhatsApp() {
  if (starting) return; starting = true;
  wa.state = 'iniciando'; wa.err = null; wa.detalle = null; wa.qr = null;
  if (client) { try { await client.destroy(); } catch {} client = null; }
  if (embebido) {
    try { log('Abriendo WhatsApp dentro del programa'); client = await conectarVista(); }
    catch (e) {
      const m = String(e && e.message || e).split('\n')[0];
      const red = /net::ERR_(CONNECTION|NAME_NOT|INTERNET|NETWORK|TIMED_OUT|ADDRESS|PROXY|TUNNEL)/.test(m);
      wa.state = 'error';
      wa.err = red ? 'No hay conexión con WhatsApp. Revisa tu internet o prueba con otra red (algunas redes de oficina o universidad bloquean WhatsApp Web).' : 'No se pudo abrir WhatsApp.';
      wa.detalle = m; wa.sinRed = red;
      log('Falló WhatsApp integrado: ' + (red ? m : (e && e.stack || e)));
      if (/too early|detached|Target closed|Session closed/i.test(m)) reconexion.proxima = Date.now() + 3000;   // falla pasajera: reintenta al tiro
    }
    starting = false; return;
  }
  const errores = [];
  const candidatos = [...browserPaths];
  let own = null;
  try { own = require('@puppeteer/browsers').computeExecutablePath({ browser: 'chrome', buildId: require('puppeteer-core/lib/cjs/puppeteer/revisions.js').PUPPETEER_REVISIONS.chrome, cacheDir: path.join(DATA, 'navegador') }); } catch {}
  if (own && fs.existsSync(own)) candidatos.unshift(own);   // si ya se descargó y funcionó antes, primero
  // el último navegador que funcionó va primero (evita esperar minutos probando los que fallan)
  const OKF = path.join(DATA, 'navegador-ok.txt');
  try { const ok1 = fs.readFileSync(OKF, 'utf8').trim(); if (ok1 && fs.existsSync(ok1)) { candidatos.splice(candidatos.indexOf(ok1) >>> 0, candidatos.includes(ok1) ? 1 : 0); candidatos.unshift(ok1); } } catch {}
  for (const exe of candidatos) {
    try { log('Intentando con ' + exe); client = await tryLaunch(exe); client.once('ready', () => { try { fs.writeFileSync(OKF, exe); } catch {} }); starting = false; return; }
    catch (e) { const m = String(e && e.message || e).split('\n')[0]; errores.push(`${path.basename(exe)}: ${m}`); log('Falló ' + exe + ': ' + (e && e.stack || e)); }
  }
  // Último recurso: descargar navegador propio
  try {
    const exe = await ensureOwnChrome();
    if (!candidatos.includes(exe)) { log('Intentando con navegador propio'); wa.state = 'iniciando'; client = await tryLaunch(exe); starting = false; return; }
  } catch (e) { const m = String(e && e.message || e).split('\n')[0]; errores.push('navegador propio: ' + m); log('Falló navegador propio: ' + (e && e.stack || e)); }
  wa.state = 'error';
  wa.err = 'No se pudo abrir WhatsApp.';
  wa.detalle = errores.join(' | ');
  starting = false;
}
// ---------- Cola de envío (masivos, programados y seguimientos) ----------
const cola = { carriles: {}, espera: null };   // carriles: { auto | t<id>: { nextAt, enviadosSesion } }
const CARRILES = require('./carriles');
const modoDe = (m) => (m === 'corriendo' ? 'corriendo' : 'despues');
// El próximo envío con pausa pendiente, entre todos los carriles (para «Próximo en …»)
const proximoEnvio = () => { const ahora = Date.now(), f = Object.values(cola.carriles).map((c) => c.nextAt || 0).filter((t) => t > ahora); return f.length ? Math.min(...f) : null; };
// Algo frena a todos los grupos: WhatsApp, «Pausar todo», fuera de horario o máximo diario
const bloqueoGlobal = () => wa.state !== 'listo' || !!db.getConfig('cola_pausada', false) || !enHorario() || db.enviadosHoy() >= db.getConfig('reglas').limiteDiario;
let cerrandoPrograma = false;   // al salir se corta WhatsApp: el envío en curso falla con un error técnico que no sirve al usuario
const ADJ = path.join(DATA, 'adjuntos');
if (!fs.existsSync(ADJ)) fs.mkdirSync(ADJ, { recursive: true });
function mediaDeAdjunto(id) {
  const a = db.adjunto(id); if (!a) return null;
  const f = path.join(ADJ, a.archivo); if (!fs.existsSync(f)) return null;
  const { MessageMedia } = require('whatsapp-web.js');
  return new MessageMedia(a.mime, fs.readFileSync(f).toString('base64'), a.nombre, a.tam);
}
async function textoPara(it, ct) {
  const pasos = db.getConfig('secuencia').pasos;
  if (it.tipo === 'seguimiento1' || it.tipo === 'seguimiento2') return fill(pasos[it.tipo === 'seguimiento1' ? 1 : 2].texto, ct);
  if (it.tipo === 'meta') return fill(pasos[0].texto, { ...(it.datos.contacto || {}), ...ct });
  return fill(it.texto, { ...(it.datos.contacto || {}), ...ct });
}
function plantillaDe(it) {
  const pasos = db.getConfig('secuencia').pasos;
  if (it.tipo === 'seguimiento1') return pasos[1].texto;
  if (it.tipo === 'seguimiento2') return pasos[2].texto;
  if (it.tipo === 'meta') return pasos[0].texto;
  return it.texto;
}
// Un mensaje por vuelta: entre el carril de automáticos y los grupos que pueden enviar, sale el que lleva más rato esperando
async function tick() {
  if (wa.state !== 'listo') { cola.espera = 'WhatsApp no está conectado'; return; }
  if (db.getConfig('cola_pausada', false)) { cola.espera = 'Envíos en pausa'; return; }
  const auto = db.siguienteAuto();
  const tandas = db.tandasQuePuedenEnviar().map((t) => ({ id: t.id, item: db.siguienteDeTanda(t.id) }));
  if (!auto && !tandas.some((t) => t.item)) { cola.espera = null; return; }
  const r = db.getConfig('reglas');
  const horario = enHorario(), limite = db.enviadosHoy() >= r.limiteDiario;
  cola.espera = !horario ? 'Fuera de horario: continúa en la próxima apertura' : limite ? `Llegaste al máximo diario (${r.limiteDiario}): continúa mañana` : null;
  const e = CARRILES.elegir({ auto, tandas, carriles: cola.carriles, ahora: Date.now(), puedeMasivo: horario && !limite });
  if (!e) return;
  const c = cola.carriles[e.clave];
  const res = await enviarItem(e.item);
  if (res === 'enviado') CARRILES.despuesDeEnviar(c, { reglas: r, agendado: e.item.tipo === 'agendado', ahora: Date.now(), rand });
  else if (res === 'error') CARRILES.trasError(c, Date.now());
}
// Devuelve 'enviado', 'omitido' (no espera la pausa) o 'error'
async function enviarItem(it) {
  const agendado = it.tipo === 'agendado';   // avisos a clientes: no cambian etapa ni secuencia
  const tel = normPhone(it.telefono) || (esLid(it.telefono) ? it.telefono : null);
  const ct = tel ? db.contacto(tel) || { telefono: tel } : {};
  const quien = `${ct.nombre || it.datos.contacto?.nombre || ''} ${ct.apellido || ''}`.trim() || it.telefono;
  const cerrar = (estado, detalle) => { db.cerrarItem(it.id, estado, detalle); evento({ quien, tel: tel || it.telefono, estado, detalle, tipo: it.tipo }); };
  if (!tel) return cerrar('omitido', 'Número inválido');
  if (db.esBaja(tel)) return cerrar('omitido', 'Pidió la baja');
  const esSeg = it.tipo.startsWith('seguimiento');
  if (esSeg && ct.seq_estado !== 'activa') return cerrar('omitido', 'Seguimiento cancelado: ' + (ct.seq_motivo || 'secuencia detenida'));
  if (it.datos.noRepetir && db.yaEnviado(tel)) return cerrar('omitido', 'Ya se le envió antes');
  let cerrado = false;
  try {
    // Versiones al azar: a cada persona le llega una distinta
    const vers = (it.datos.versiones || []).filter((v) => String(v || '').trim());
    const plantilla = vers.length > 1 ? vers[Math.floor(Math.random() * vers.length)] : plantillaDe(it);
    const texto = vers.length > 1 ? fill(plantilla, { ...(it.datos.contacto || {}), ...ct }) : await textoPara(it, ct);
    const media = it.datos.adjunto ? mediaDeAdjunto(it.datos.adjunto) : null;
    if (it.datos.adjunto && !media) return cerrar('error', 'La foto o video ya no está en el PC');
    if (!db.marcarEnviando(it.id)) return;   // lo sacaron de la tanda justo ahora
    try {
      if (media) await enviarA(tel, media, { caption: texto || undefined, sendMediaAsDocument: !/^(image|video)\//.test(media.mimetype) });
      else await enviarA(tel, texto);
    } catch (e) { if (e.sinWa) return cerrar('omitido', 'No tiene WhatsApp'); throw e; }
    db.registrarEnvio(tel, texto || '[' + (media ? media.filename : 'archivo') + ']', it.tipo, 'enviado', plantilla, it.datos.usuario || it.datos.contacto?._usuario || null);
    // Se marca como enviado al tiro: si el programa se cierra ahora, no se vuelve a mandar
    cerrado = true;
    cerrar('enviado', agendado ? 'Mensaje agendado' : it.tipo === 'seguimiento1' ? 'Seguimiento 1' : it.tipo === 'seguimiento2' ? 'Seguimiento 2' : it.tipo === 'programado' ? 'Programado' : it.tipo === 'meta' ? 'Primer mensaje a lead de Meta' : null);
    if (agendado) { /* aviso a cliente: no cambia etapa ni secuencia */ }
    else if (!esSeg) {
      db.moverEtapaSi(tel, ['Nuevo'], 'Contactado');
      if (it.datos.secuencia && ct.seq_estado !== 'activa' && !db.sinSeguimiento(it.id)) db.iniciarSecuencia(tel);
    } else if (it.tipo === 'seguimiento2' || !db.getConfig('secuencia').pasos[2].activo) {
      db.avanzarSecuencia(tel, 3, true);
    }
    // Segundo mensaje: llega unos segundos después, como si lo escribieras en dos partes (cuenta para el máximo diario)
    const seg = String(it.datos.segundo || '').trim();
    if (seg) {
      await sleep(rand(3, 7) * 1000);
      const t2 = fill(seg, { ...(it.datos.contacto || {}), ...ct });
      try { await enviarA(tel, t2); db.registrarEnvio(tel, t2, agendado ? 'agendado' : 'segundo', 'enviado', null, null); }
      catch (e) { log('segundo mensaje: ' + e.message); evento({ quien, tel, estado: 'error', detalle: 'No salió el segundo mensaje' }); }
    }
    return 'enviado';
  } catch (e) {
    if (!cerrado) cerrar('error', cerrandoPrograma ? 'El programa se cerró mientras se enviaba: revisa en tu celular si salió' : String(e.message || e).slice(0, 140)); else log('cola después de enviar: ' + (e.message || e));
    return 'error';
  }
}
(async () => { for (;;) { await sleep(1500); try { await tick(); } catch (e) { log('cola: ' + (e.stack || e)); } } })();

// ---------- Tareas cada minuto: secuencias, programados y UF ----------
function revisarSecuencias() {
  const cfg = db.getConfig('secuencia');
  if (cfg.pausada) return;
  const [, p1, p2] = cfg.pasos;
  for (const s of db.secuenciasActivas()) {
    const horas = (Date.now() - new Date(s.seq_inicio)) / 3600000;
    if (s.seq_paso === 1) {
      if (!p1.activo) { db.avanzarSecuencia(s.telefono, 2, !p2.activo); continue; }
      if (horas >= p1.horas && !db.yaEnCola(s.telefono, 'seguimiento1')) { db.encolar([{ telefono: s.telefono, texto: '', tipo: 'seguimiento1' }]); db.avanzarSecuencia(s.telefono, 2, false); }
    } else if (s.seq_paso === 2) {
      if (!p2.activo) { if (!db.yaEnCola(s.telefono, 'seguimiento1')) db.avanzarSecuencia(s.telefono, 3, true); continue; }
      if (horas >= p2.horas && !db.yaEnCola(s.telefono, 'seguimiento1') && !db.yaEnCola(s.telefono, 'seguimiento2')) { db.encolar([{ telefono: s.telefono, texto: '', tipo: 'seguimiento2' }]); db.avanzarSecuencia(s.telefono, 3, false); }
    }
  }
}
function revisarProgramados() {
  for (const p of db.programadosVencidos()) {
    const ex = p.extra || {};
    const versiones = Array.isArray(ex.versiones) && ex.versiones.length ? [p.texto, ...ex.versiones.slice(1)] : null;
    const tanda = db.crearTanda({ nombre: p.nombre || 'Envío programado', usuario: (p.destinatarios[0] && p.destinatarios[0]._usuario) || null, tipo: 'programado', programado: p.id, total: p.destinatarios.length, modo: modoDe(ex.modo) });
    db.encolar(p.destinatarios.map((c) => ({ telefono: c.telefono, texto: p.texto, tipo: 'programado', datos: { contacto: c, secuencia: !!p.secuencia, versiones, adjunto: ex.adjunto || null, segundo: ex.segundo || '', noRepetir: !!ex.noRepetir } })), tanda);
    db.estadoProgramado(p.id, 'enviado');
    evento({ estado: 'programado', detalle: `"${p.nombre || 'Envío programado'}" pasó a la cola (${p.destinatarios.length} contactos)` });
  }
}
let uf = db.getConfig('uf', null);
async function actualizarUF() {
  if (uf && Date.now() - new Date(uf.consultado) < 6 * 3600000 && uf.hoy?.fecha?.slice(0, 10) === new Date().toISOString().slice(0, 10)) return;
  try {
    const r = await fetch('https://mindicador.cl/api/uf', { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    const serie = (j.serie || []).map((x) => ({ fecha: x.fecha, valor: x.valor }));
    if (!serie.length) return;
    const hoy = serie[0];
    const mes = hoy.fecha.slice(0, 7);
    const primero = serie.find((x) => x.fecha.slice(0, 10) === mes + '-01') || null;
    uf = { hoy, primero, consultado: new Date().toISOString() };
    db.setConfig('uf', uf);
  } catch (e) { log('UF: ' + e.message); clearTimeout(actualizarUF._t); actualizarUF._t = setTimeout(actualizarUF, 5 * 60000); }   // sin internet: reintenta en 5 min
}
function revisarAgendados() {
  for (const a of db.agendadosVencidos()) {
    db.encolar(a.destinatarios.map((c) => ({ telefono: c.telefono, texto: a.texto, tipo: 'agendado', datos: { contacto: c, adjunto: a.adjunto || null, agendado: a.id } })));
    db.estadoAgendado(a.id, 'enviado');
    evento({ estado: 'programado', detalle: `Mensaje agendado pasó a la cola (${a.destinatarios.length} contacto${a.destinatarios.length === 1 ? '' : 's'})` });
  }
}
setInterval(() => { try { revisarAgendados(); } catch (e) { log('agendados: ' + (e.stack || e)); } }, 20000);
setInterval(() => { try { revisarSecuencias(); revisarProgramados(); } catch (e) { log('tareas: ' + (e.stack || e)); } }, 60000);
setTimeout(() => { try { revisarSecuencias(); revisarProgramados(); } catch {} }, 5000);
actualizarUF(); setInterval(actualizarUF, 3600000);

// ---------- 4.0.0 · Llamadas agendadas, postventa, referidos, resumen diario ----------
const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const horaTxt = (d) => new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
function diaTxt(f, ref = new Date()) {
  const a = new Date(ref); a.setHours(0, 0, 0, 0); const b = new Date(f); b.setHours(0, 0, 0, 0);
  const n = Math.round((b - a) / 86400000);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana ' + DIAS_SEM[b.getDay()];
  return `el ${DIAS_SEM[b.getDay()]} ${b.getDate()}`;
}
const destinoDe = (tel) => { const c = db.contacto(tel) || {}; return [{ telefono: tel, nombre: c.nombre || db.nombreWa(tel) || '', apellido: c.apellido || '' }]; };
// Al agendar una llamada: confirmación al cliente, recordatorio al cliente antes y aviso de Windows para ti
function programarLlamada(id) {
  const l = db.llamada(id); if (!l) return;
  const cfg = db.getConfig('llamadas'); const f = new Date(l.fecha); const dest = destinoDe(l.telefono);
  const prep = (t, ref) => String(t || '').replace(/\{dia\}/gi, diaTxt(f, ref)).replace(/\{hora\}/gi, horaTxt(f)).trim();
  const c = { conf_id: null, rec_id: null, recordatorio_id: null };
  if (cfg.confirmacion?.on && prep(cfg.confirmacion.texto)) c.conf_id = db.crearAgendado({ texto: prep(cfg.confirmacion.texto, new Date()), destinatarios: dest, fecha: new Date().toISOString(), etiqueta: 'llamada', telefono: l.telefono });
  const min = Math.max(1, parseInt(cfg.recordatorio?.minutos) || 60);
  const fr = new Date(f.getTime() - min * 60000);
  if (cfg.recordatorio?.on && prep(cfg.recordatorio.texto) && fr.getTime() > Date.now() + 5 * 60000) c.rec_id = db.crearAgendado({ texto: prep(cfg.recordatorio.texto, fr), destinatarios: dest, fecha: fr.toISOString(), etiqueta: 'llamada_rec', telefono: l.telefono });
  const aviso = new Date(f.getTime() - Math.max(0, parseInt(cfg.avisoMin ?? 10) || 0) * 60000);
  c.recordatorio_id = db.crearRecordatorio(l.telefono, aviso.toISOString(), '📞 Llamada a las ' + horaTxt(f), id);
  db.editarLlamada(id, c);
  try { revisarAgendados(); } catch {}
}
function desprogramarLlamada(l) {
  for (const k of ['conf_id', 'rec_id']) if (l[k]) db.cancelarAgendado(l[k]);
  if (l.recordatorio_id) db.borrarRecordatorio(l.recordatorio_id);
}
// Postventa ya no se agenda sola (4.1.0); al salir de Ingresado se cancela la que quedó de antes
function alSalirDeIngresado(tel) {
  db.cancelarAgendadosDe(tel, ['postventa', 'control', 'referidos']);
  db.run('UPDATE contactos SET postventa = 0 WHERE telefono = ?', [tel]);
}
// Leads estancados y sin próxima acción
const ETAPAS_VIVAS = ['Contactado', 'Respondió', 'Cotización enviada', 'Firma/documentos'];
const CONVERSANDO = ['Respondió', 'Cotización enviada', 'Firma/documentos'];
function enriquecer(lista) {
  const prox = db.proximasAcciones(); const lim = Math.max(1, parseInt(db.getConfig('estancado').dias) || 5);
  return lista.map((c) => {
    const p = prox[c.telefono]; const et = c.etapa || 'Nuevo';
    const dias = c.etapa_fecha ? Math.max(0, Math.floor((Date.now() - new Date(c.etapa_fecha)) / 86400000)) : 0;
    return { ...c, edadActual: edadActual(c), diasEtapa: dias,
      prox: p ? { fecha: p.fecha, texto: p.texto, llamada: !!p.llamada_id } : c.seq_estado === 'activa' ? { seguimiento: true } : null,
      estancado: ETAPAS_VIVAS.includes(et) && dias >= lim, sinProx: CONVERSANDO.includes(et) && !p && c.seq_estado !== 'activa' };
  });
}
function estadoLeads() {
  const l = enriquecer(db.all(`SELECT * FROM contactos WHERE etapa IN (${ETAPAS_VIVAS.map(() => '?').join(',')}) AND telefono NOT IN (SELECT telefono FROM bajas)`, ETAPAS_VIVAS));
  const corto = (c) => ({ telefono: c.telefono, nombre: c.nombre, apellido: c.apellido, etapa: c.etapa, diasEtapa: c.diasEtapa });
  const est = l.filter((c) => c.estancado).sort((a, b) => b.diasEtapa - a.diasEtapa);
  const sin = l.filter((c) => c.sinProx).sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
  return { estancados: est.length, estancadosLista: est.slice(0, 12).map(corto), sinProx: sin.length, sinProxLista: sin.slice(0, 12).map(corto), diasEstancado: Math.max(1, parseInt(db.getConfig('estancado').dias) || 5) };
}
const finDeHoy = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
// Contactos repetidos: mismo nombre y apellido con distinto número
const normNom = (c) => `${c.nombre || ''} ${c.apellido || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function duplicados() {
  const ign = new Set(db.getConfig('dup_ignorados', []));
  const g = {};
  for (const c of db.all("SELECT * FROM contactos WHERE IFNULL(nombre, '') <> '' AND IFNULL(apellido, '') <> ''")) { const k = normNom(c); if (k.length >= 5) (g[k] ||= []).push(c); }
  return Object.entries(g).filter(([k, l]) => l.length > 1 && !ign.has(k)).slice(0, 100)
    .map(([k, l]) => ({ clave: k, contactos: l.map((c) => ({ ...c, edadActual: edadActual(c), mensajes: db.contarMensajes(c.telefono) })) }));
}
function unirContactos(queda, sale) {
  const a = db.contacto(queda), b = db.contacto(sale);
  if (!a || !b || queda === sale) throw new Error('No se encontraron los contactos');
  const campos = ['nombre', 'apellido', 'edad', 'edad_fecha', 'renta', 'cargas', 'isapre', 'calificacion', 'referido_por', 'motivo_perdida', 'origen'];
  const sets = [], vals = [];
  for (const k of campos) if ((a[k] == null || a[k] === '') && b[k] != null && b[k] !== '') { sets.push(k + ' = ?'); vals.push(b[k]); }
  const rango = (e) => (e === 'Perdido' ? -1 : ETAPAS.indexOf(e || 'Nuevo'));
  if (rango(b.etapa) > rango(a.etapa)) { sets.push('etapa = ?', 'etapa_fecha = ?'); vals.push(b.etapa, b.etapa_fecha); }
  if (sets.length) db.run(`UPDATE contactos SET ${sets.join(', ')}, actualizado = ? WHERE telefono = ?`, [...vals, new Date().toISOString(), queda]);
  db.run('UPDATE recordatorios SET telefono = ? WHERE telefono = ?', [queda, sale]);
  db.run('UPDATE llamadas SET telefono = ? WHERE telefono = ?', [queda, sale]);
  db.eliminarContacto(sale);
}

// ---------- Meta (formularios) ----------
const META = require('./meta')({ db, log, notify, normPhone, evento, sleep,
  encolar: (tel, datos) => db.encolar([{ telefono: tel, texto: '', tipo: 'meta', datos: { contacto: { ...datos, telefono: tel }, secuencia: true } }]) });

// ---------- Métricas ----------
function metricas(dias) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const AUTO = "('masivo','programado','meta','seguimiento1','seguimiento2')";
  const env = db.all(`SELECT telefono, tipo, fecha, plantilla FROM envios WHERE estado = 'enviado' AND tipo IN ${AUTO} AND fecha >= ? ORDER BY telefono, fecha`, [desde]);
  const tels = [...new Set(env.map((e) => e.telefono))];
  const entrantes = {};
  for (const m of db.all('SELECT telefono, fecha FROM mensajes WHERE de_mi = 0 AND fecha >= ? ORDER BY fecha', [desde])) (entrantes[m.telefono] ||= []).push(m.fecha);
  const bajasF = Object.fromEntries(db.all('SELECT telefono, fecha FROM bajas WHERE fecha >= ?', [desde]).map((b) => [b.telefono, b.fecha]));
  const porTel = {}; for (const e of env) (porTel[e.telefono] ||= []).push(e);
  const paso = (t) => (t === 'seguimiento1' ? 1 : t === 'seguimiento2' ? 2 : 0);
  const pasos = [{ env: 0, resp: 0 }, { env: 0, resp: 0 }, { env: 0, resp: 0 }];
  const plant = {};
  const horas = Array.from({ length: 24 }, (_, h) => ({ h, env: 0, resp: 0 }));
  let contactados = 0, respondieron = 0;
  for (const tel of tels) {
    const lista = porTel[tel]; const inc = entrantes[tel] || [];
    const primera = lista[0].fecha; contactados++;
    if (inc.some((f) => f > primera)) respondieron++;
    lista.forEach((e, i) => {
      const hasta = lista[i + 1] ? lista[i + 1].fecha : '9999';
      const resp = inc.some((f) => f > e.fecha && f < hasta);
      const p = pasos[paso(e.tipo)]; p.env++; if (resp) p.resp++;
      const hh = horas[new Date(e.fecha).getHours()]; hh.env++; if (resp) hh.resp++;
      if (e.plantilla) {
        const k = e.plantilla.slice(0, 400); const x = (plant[k] ||= { texto: k, tipo: e.tipo, env: 0, resp: 0, bajas: 0 });
        x.env++; if (resp) x.resp++;
        if (bajasF[tel] && bajasF[tel] > e.fecha && bajasF[tel] < hasta) x.bajas++;
      }
    });
  }
  const own = db.get("SELECT COUNT(*) AS n, SUM(CASE WHEN ack >= 3 THEN 1 ELSE 0 END) AS leidos FROM mensajes WHERE de_mi = 1 AND ack >= 1 AND fecha >= ?", [desde]);
  const nuevos = db.get('SELECT COUNT(*) AS n FROM contactos WHERE creado >= ?', [desde]).n;
  const etapas = Object.fromEntries(db.all('SELECT etapa, COUNT(*) AS n FROM contactos WHERE creado >= ? GROUP BY etapa', [desde]).map((r) => [r.etapa || 'Nuevo', r.n]));
  const orden = ETAPAS.filter((e) => e !== 'Perdido');
  const embudo = orden.map((et, i) => ({ etapa: et, n: orden.slice(i).reduce((a, e) => a + (etapas[e] || 0), 0) }));
  embudo[0].n += etapas['Perdido'] || 0;
  const motivos = db.all("SELECT IFNULL(NULLIF(motivo_perdida,''),'Sin motivo') AS motivo, COUNT(*) AS n FROM contactos WHERE etapa = 'Perdido' AND creado >= ? GROUP BY motivo ORDER BY n DESC", [desde]);
  const forms = db.all(`SELECT l.form_nombre AS form, COUNT(*) AS leads,
      SUM(CASE WHEN c.calificacion = 'Calificado' THEN 1 ELSE 0 END) AS calificados,
      SUM(CASE WHEN c.etapa = 'Ingresado' THEN 1 ELSE 0 END) AS ingresados,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM mensajes m WHERE m.telefono = l.telefono AND m.de_mi = 0 AND m.fecha > l.recibido) THEN 1 ELSE 0 END) AS respondieron
    FROM leads_meta l LEFT JOIN contactos c ON c.telefono = l.telefono WHERE l.creado >= ? GROUP BY l.form_nombre ORDER BY leads DESC`, [desde]);
  const enviados = env.length, bajas = Object.keys(bajasF).length;
  return {
    dias, enviados, contactados, respondieron,
    tasaRespuesta: contactados ? respondieron / contactados : 0,
    leidos: own.n ? (own.leidos || 0) / own.n : null,
    bajas, tasaBajas: enviados ? bajas / enviados : 0,
    nuevos, ingresados: db.get("SELECT COUNT(*) AS n FROM contactos WHERE etapa = 'Ingresado' AND actualizado >= ?", [desde]).n,
    embudo, motivos, pasos, forms,
    horas: horas.filter((x) => x.env > 0),
    referidos: db.get("SELECT COUNT(*) AS n FROM contactos WHERE IFNULL(referido_por, '') <> '' AND creado >= ?", [desde]).n,
    plantillas: Object.values(plant).sort((a, b) => b.env - a.env).slice(0, 8)
  };
}

// ---------- API ----------
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Solo se aceptan pedidos hechos a este mismo programa (evita que una página web externa use la API)
app.set('case sensitive routing', true);
app.use((req, res, next) => {
  const host = String(req.headers.host || '').toLowerCase();
  if (puertoServidor && host !== '127.0.0.1:' + puertoServidor && host !== 'localhost:' + puertoServidor) return res.status(403).end();
  next();
});
const AUTH = require('./auth')({ db, log });
app.use(AUTH.requerir);
AUTH.rutas(app);
// Fotos, videos y PDF para envíos (se guardan solo en este PC)
app.post('/api/adjuntos', express.raw({ type: () => true, limit: '70mb' }), (req, res) => {
  const buf = req.body; if (!Buffer.isBuffer(buf) || !buf.length) return fail(res, 'Archivo vacío');
  const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
  let nombre = 'archivo'; try { nombre = decodeURIComponent(String(req.headers['x-nombre'] || 'archivo')).slice(0, 120); } catch {}
  const esImg = /^image\//.test(mime), esVid = /^video\//.test(mime);
  if (!esImg && !esVid && mime !== 'application/pdf') return fail(res, 'Solo se pueden adjuntar fotos, videos o PDF');
  if (buf.length > (esVid ? 64 : 16) * 1024 * 1024) return fail(res, esVid ? 'El video pesa más de 64 MB' : 'El archivo pesa más de 16 MB');
  const id = require('crypto').randomBytes(8).toString('hex');
  const archivo = id + '.' + extDe(mime, nombre);
  fs.writeFileSync(path.join(ADJ, archivo), buf);
  db.guardarAdjunto({ id, nombre, mime, tam: buf.length, archivo });
  ok(res, { adjunto: { id, nombre, mime, tam: buf.length } });
});
const { soloAdmin, puede } = AUTH;
const act = (req, accion, detalle) => AUTH.registrar(req.usuario, accion, detalle);
const nombreC = (tel) => { const c = db.contacto(tel); return c ? `${c.nombre || ''} ${c.apellido || ''}`.trim() || '+' + tel : '+' + tel; };
app.get('/vendor/xlsx.js', (req, res) => res.sendFile(require.resolve('xlsx/dist/xlsx.full.min.js')));
const ok = (res, v = {}) => res.json({ ok: true, ...v });
const fail = (res, msg, code = 400) => res.status(code).json({ error: msg });

app.get('/api/estado', (req, res) => {
  const r = db.getConfig('reglas');
  res.json({
    version, wa, ultimaRespuesta: wa.ultimaRespuesta || 0, uf, actualizacion: updater ? updater.estado() : null, yo: { nombre: req.usuario.nombre },
    cola: { pausada: db.getConfig('cola_pausada', false), pendientes: db.pendientesCola(), porTipo: db.pendientesPorTipo(),
      nextAt: proximoEnvio(), espera: cola.espera, enviadosHoy: db.enviadosHoy(), limite: r.limiteDiario, enHorario: enHorario() },
    noLeidos: db.get('SELECT COUNT(DISTINCT telefono) AS n FROM mensajes WHERE leido = 0').n,
    avisos: { leadsHoy: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return db.leadsMetaDesde(d.toISOString()); })(), agendadosHoy: db.agendadosHoy(), campana: db.contarRecordatoriosHasta(finDeHoy().toISOString()) },
    eventos: eventos.slice(-80)
  });
});
app.post('/api/reintentar', (req, res) => { reconexion.pausada = false; reconexion.intentos = 0; ok(res); if (['error', 'desconectado'].includes(wa.state)) startWhatsApp(); });
app.post('/api/sincronizar', soloAdmin, (req, res) => { ok(res); sincronizarChats(); });
// Meta
app.get('/api/meta', (req, res) => res.json(META.publico()));
app.post('/api/meta/conectar', soloAdmin, async (req, res) => { try { ok(res, { paginas: await META.conectar(req.body || {}) }); } catch (e) { fail(res, e.message); } });
app.post('/api/meta/pagina', soloAdmin, async (req, res) => { try { await META.elegirPagina(req.body.pageId); ok(res, { meta: META.publico() }); } catch (e) { fail(res, e.message); } });
app.post('/api/meta/formularios', soloAdmin, async (req, res) => { try { await META.actualizarFormularios(); ok(res, { meta: META.publico() }); } catch (e) { fail(res, e.message); } });
app.put('/api/meta/formularios/:id', soloAdmin, (req, res) => { META.formulario(req.params.id, req.body || {}); ok(res, { meta: META.publico() }); });
app.put('/api/meta/opciones', soloAdmin, (req, res) => { META.opciones(req.body || {}); ok(res, { meta: META.publico() }); });
app.post('/api/meta/revisar', async (req, res) => { try { ok(res, await META.revisar({ manual: true })); } catch (e) { fail(res, e.message); } });
app.post('/api/meta/desconectar', soloAdmin, (req, res) => { META.desconectar(); ok(res); });
app.get('/api/meta/leads', (req, res) => { const l = db.leadsMeta({ form: req.query.form || '', estado: req.query.estado || '' }); const d0 = new Date(); d0.setHours(0, 0, 0, 0); res.json({ leads: l, hoy: db.leadsMetaDesde(d0.toISOString()), mes: db.leadsMetaDesde(new Date(Date.now() - 30 * 86400000).toISOString()), enHorario: enHorario() }); });
app.get('/api/metricas', puede('metricas'), (req, res) => { try { res.json(metricas(Math.max(1, Math.min(365, parseInt(req.query.dias) || 30)))); } catch (e) { fail(res, e.message, 500); } });
app.post('/api/cerrar-sesion', async (req, res) => { reconexion.pausada = true; try { await client.logout(); } catch {} wa.state = 'desconectado'; ok(res); setTimeout(() => { reconexion.pausada = false; reconexion.intentos = 0; startWhatsApp(); }, 1500); });
app.get('/api/registro', soloAdmin, (req, res) => fs.existsSync(LOG) ? res.sendFile(LOG) : res.send('Sin registros'));

// WhatsApp integrado: qué chat está abierto y abrir uno
// Contactos de WhatsApp para elegir en Envíos: tus chats recientes + los contactos guardados en tu celular
let waContactosCache = { t: 0, lista: [] };
app.get('/api/wa/contactos', async (req, res) => {
  const mapa = new Map();
  const add = (tel, nombre, fecha, chat) => {
    const t = normPhone(tel); if (!t) return;
    const p = mapa.get(t) || { telefono: t, nombre: '', fecha: null, chat: false };
    if (nombre && (!p.nombre || /^\+?[\d\s]+$/.test(p.nombre))) p.nombre = nombre;
    if (fecha && (!p.fecha || fecha > p.fecha)) p.fecha = fecha;
    if (chat) p.chat = true;
    mapa.set(t, p);
  };
  for (const c of db.chats({})) add(c.telefono, [c.nombre, c.apellido].filter(Boolean).join(' '), c.fecha, true);
  if (wa.state === 'listo' && client) {
    if (Date.now() - waContactosCache.t > 5 * 60000 || req.query.refrescar) {
      try {
        const cs = await Promise.race([client.getContacts(), sleep(20000).then(() => null)]);
        if (cs) waContactosCache = { t: Date.now(), lista: cs.filter((c) => c && c.id && c.id.server === 'c.us' && !c.isGroup && !c.isMe && (c.isMyContact || c.name)).map((c) => ({ tel: c.id.user, nombre: c.name || c.pushname || c.verifiedName || '' })) };
      } catch (e) { log('contactos de WhatsApp: ' + e.message); }
    }
    for (const c of waContactosCache.lista) add(c.tel, c.nombre, null, false);
  }
  const bajas = new Set(db.all('SELECT telefono FROM bajas').map((b) => b.telefono));
  const lista = [...mapa.values()].map((c) => {
    const ct = db.contacto(c.telefono);
    return { ...c, nombre: (ct && [ct.nombre, ct.apellido].filter(Boolean).join(' ')) || c.nombre, etapa: ct ? ct.etapa || 'Nuevo' : null, baja: bajas.has(c.telefono) };
  }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || a.nombre.localeCompare(b.nombre, 'es'));
  res.json({ contactos: lista, wa: wa.state, deCelular: waContactosCache.lista.length });
});
app.get('/api/wa/activo', async (req, res) => {
  if (wa.state !== 'listo' || !client || !client.pupPage) return res.json({ chat: null, wa: wa.state });
  try {
    const a = await client.pupPage.evaluate(() => {
      const C = window.require('WAWebCollections').Chat;
      const ch = (C.getActive && C.getActive()) || C.getModelsArray().find((c) => c.active);
      if (!ch) return null;
      const id = ch.id;
      return { id: id._serialized || id.$1 || (id.user + '@' + id.server), user: id.user, server: id.server, nombre: ch.formattedTitle || ch.name || '' };
    });
    if (!a) return res.json({ chat: null, wa: wa.state });
    if (a.server === 'g.us' || a.server === 'newsletter' || a.server === 'broadcast') return res.json({ chat: { grupo: true, nombre: a.nombre }, wa: wa.state });
    const tel = (await resolvePhone(a.id)) || (a.server === 'c.us' ? a.user : null);
    if (!tel) return res.json({ chat: { sinNumero: true, nombre: a.nombre }, wa: wa.state });
    if (a.nombre && !/^\+?[\d\s]+$/.test(a.nombre) && db.nombreWa(tel) !== a.nombre) db.guardarNombreWa(tel, a.nombre);
    if (db.get('SELECT COUNT(*) AS n FROM mensajes WHERE telefono = ? AND leido = 0', [tel]).n) db.marcarLeido(tel);
    const c = db.contacto(tel);
    res.json({ chat: { telefono: tel, nombreWa: a.nombre, contacto: c ? enriquecer([c])[0] : null, recordatorios: db.recordatoriosDe(tel), llamadas: db.llamadasDe(tel) }, wa: wa.state, etapas: ETAPAS });
  } catch (e) { res.json({ chat: null, wa: wa.state, error: e.message }); }
});
app.post('/api/wa/abrir/:tel', async (req, res) => {
  if (wa.state !== 'listo') return fail(res, 'WhatsApp aún no está conectado');
  try {
    const tel = req.params.tel;
    let chatId = esLid(tel) ? tel + '@lid' : null;
    if (!chatId) { const id = await client.getNumberId(tel).catch(() => null); if (!id) return fail(res, 'Ese número no tiene WhatsApp'); chatId = id._serialized; }
    await client.interface.openChatWindow(chatId);
    ok(res);
  } catch (e) { fail(res, 'No se pudo abrir el chat: ' + e.message, 500); }
});
// Recordatorios
app.get('/api/recordatorios', (req, res) => res.json({ recordatorios: db.recordatoriosPendientes() }));
app.post('/api/recordatorios', (req, res) => {
  const b = req.body || {}; const tel = normPhone(b.telefono) || (esLid(b.telefono) ? b.telefono : null);
  const f = new Date(b.fecha);
  if (!tel) return fail(res, 'Falta el contacto');
  if (isNaN(f)) return fail(res, 'La fecha no es válida');
  db.crearRecordatorio(tel, f.toISOString(), String(b.texto || '').trim().slice(0, 300));
  ok(res);
});
app.post('/api/recordatorios/:id/listo', (req, res) => {
  const r = db.get('SELECT * FROM recordatorios WHERE id = ?', [parseInt(req.params.id)]);
  db.recordatorioListo(parseInt(req.params.id));
  if (r && r.llamada_id) db.editarLlamada(r.llamada_id, { estado: 'hecha' });
  ok(res);
});
// Campanita: lo que tienes pendiente para hoy
app.get('/api/campana', (req, res) => res.json({ recordatorios: db.recordatoriosHasta(finDeHoy().toISOString()) }));
// Buscar contacto (Ctrl + K)
app.get('/api/buscar', (req, res) => {
  const q = String(req.query.q || '').trim(); if (!q) return res.json({ resultados: [] });
  const r = db.buscarContactos({ q, limite: 8 }).map((c) => ({ telefono: c.telefono, nombre: c.nombre, apellido: c.apellido, etapa: c.etapa || 'Nuevo', lead: true }));
  if (r.length < 8) {
    const dig = q.replace(/\D/g, '');
    for (const w of db.all("SELECT telefono, nombre FROM nombres_wa WHERE LOWER(nombre) LIKE ? " + (dig.length >= 3 ? 'OR telefono LIKE ? ' : '') + 'LIMIT 8', dig.length >= 3 ? ['%' + q.toLowerCase() + '%', '%' + dig + '%'] : ['%' + q.toLowerCase() + '%']))
      if (r.length < 8 && !r.some((x) => x.telefono === w.telefono)) r.push({ telefono: w.telefono, nombre: w.nombre, apellido: '', etapa: null, lead: false });
  }
  res.json({ resultados: r });
});
// Llamadas agendadas
const leerTel = (t) => normPhone(t) || (esLid(t) ? t : null);
app.post('/api/llamadas', (req, res) => {
  const b = req.body || {}; const tel = leerTel(b.telefono); const f = new Date(b.fecha);
  if (!tel) return fail(res, 'Falta el contacto');
  if (isNaN(f) || f.getTime() < Date.now() - 60000) return fail(res, 'Elige una fecha y hora futura');
  const id = db.crearLlamada(tel, f.toISOString()); programarLlamada(id);
  act(req, 'Agendó una llamada', `${nombreC(tel)} · ${f.toLocaleString('es-CL')}`);
  ok(res, { id });
});
app.post('/api/llamadas/:id/reagendar', (req, res) => {
  const l = db.llamada(parseInt(req.params.id)); const f = new Date((req.body || {}).fecha);
  if (!l || l.estado !== 'pendiente') return fail(res, 'Esa llamada ya no está pendiente');
  if (isNaN(f) || f.getTime() < Date.now() - 60000) return fail(res, 'Elige una fecha y hora futura');
  desprogramarLlamada(l); db.editarLlamada(l.id, { fecha: f.toISOString() }); programarLlamada(l.id);
  act(req, 'Reagendó una llamada', `${nombreC(l.telefono)} · ${f.toLocaleString('es-CL')}`);
  ok(res);
});
app.post('/api/llamadas/:id/cancelar', (req, res) => {
  const l = db.llamada(parseInt(req.params.id)); if (!l || l.estado !== 'pendiente') return fail(res, 'Esa llamada ya no está pendiente');
  desprogramarLlamada(l); db.editarLlamada(l.id, { estado: 'cancelada' }); act(req, 'Canceló una llamada', nombreC(l.telefono)); ok(res);
});
app.post('/api/llamadas/:id/hecha', (req, res) => {
  const l = db.llamada(parseInt(req.params.id)); if (!l) return fail(res, 'No existe', 404);
  if (l.recordatorio_id) db.recordatorioListo(l.recordatorio_id);
  db.editarLlamada(l.id, { estado: 'hecha' }); ok(res);
});
// Contactos repetidos
app.get('/api/duplicados', (req, res) => res.json({ grupos: duplicados() }));
app.post('/api/duplicados/unir', (req, res) => { try { const { queda, sale } = req.body || {}; const n = nombreC(queda); unirContactos(queda, sale); act(req, 'Unió contactos repetidos', n); ok(res); } catch (e) { fail(res, e.message); } });
app.post('/api/duplicados/ignorar', (req, res) => { const l = db.getConfig('dup_ignorados', []); const k = String((req.body || {}).clave || ''); if (k && !l.includes(k)) l.push(k); db.setConfig('dup_ignorados', l.slice(-500)); ok(res); });
app.delete('/api/recordatorios/:id', (req, res) => { db.borrarRecordatorio(parseInt(req.params.id)); ok(res); });
setInterval(() => {
  try {
    for (const r of db.recordatoriosVencidos(new Date().toISOString())) {
      db.recordatorioAvisado(r.id);
      notify('Recordatorio · ' + nombreC(r.telefono), r.texto || 'Tenías que retomar esta conversación', { chat: r.telefono });
    }
  } catch (e) { log('recordatorios: ' + e.message); }
}, 30000).unref?.();

app.get('/api/inicio', (req, res) => {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const env7 = db.enviadosDesde(d7), baj7 = db.bajasDesde(d7);
  const sinResp = db.chatsSinResponder();
  const porTipo = Object.fromEntries(db.pendientesPorTipo().map((x) => [x.tipo, x.n]));
  res.json({
    sinResponder: sinResp.length, sinResponderLista: sinResp.slice(0, 7),
    sin24: sinResp.filter((c) => Date.now() - new Date(c.fecha) > 86400000).slice(0, 30),
    recordatorios: db.recordatoriosPendientes().slice(0, 12),
    nuevosHoy: db.nuevosDesde(d0.toISOString()),
    ultimosContactos: db.all('SELECT telefono, nombre, apellido, edad, renta, cargas, isapre, etapa, creado FROM contactos ORDER BY creado DESC LIMIT 4'),
    enviadosHoy: db.enviadosHoy(), limite: db.getConfig('reglas').limiteDiario,
    enSecuencia: db.get("SELECT COUNT(*) AS n FROM contactos WHERE seq_estado = 'activa'").n,
    seguimientosEnCola: (porTipo.seguimiento1 || 0) + (porTipo.seguimiento2 || 0),
    programados: db.programados().slice(0, 3),
    salud: { enviados7: env7, bajas7: baj7, pct: env7 ? Math.round((baj7 / env7) * 1000) / 10 : 0 },
    leads: estadoLeads(),
    llamadasHoy: db.llamadasEntre(new Date(d0).toISOString(), finDeHoy().toISOString()),
    leadsMetaHoy: db.leadsMetaDesde(d0.toISOString()), agendadosHoy: db.agendadosHoy()
  });
});

// Contactos y pipeline
app.get('/api/contactos', (req, res) => res.json({ contactos: enriquecer(db.buscarContactos({ ...req.query, limite: req.query.limite || 3000 })), etapas: ETAPAS, isapres: db.isapres(), diasEstancado: Math.max(1, parseInt(db.getConfig('estancado').dias) || 5) }));
app.post('/api/contactos', (req, res) => {
  const tel = normPhone(req.body.telefono); if (!tel) return fail(res, 'Número de teléfono inválido');
  const nuevo = db.guardarContacto({ ...req.body, telefono: tel, origen: req.body.origen || 'manual' }, { sobrescribir: !!req.body.sobrescribir });
  ok(res, { nuevo, contacto: db.contacto(tel) });
});
app.patch('/api/contactos/:tel', (req, res) => {
  const antes = db.contacto(req.params.tel);
  const c = db.actualizarContacto(req.params.tel, { ...req.body, _manual: true });
  if (!c) return fail(res, 'No existe', 404);
  try {
    // Al salir de Ingresado se cancela la postventa que quedó agendada de versiones anteriores
    if (antes && antes.etapa === 'Ingresado' && c.etapa !== 'Ingresado') alSalirDeIngresado(c.telefono);
  } catch (e) { log('postventa: ' + e.message); }
  if (antes && req.body.etapa && req.body.etapa !== antes.etapa) act(req, 'Cambió de etapa', `${nombreC(c.telefono)}: ${antes.etapa} → ${c.etapa}${c.motivo_perdida && c.etapa === 'Perdido' ? ' (' + c.motivo_perdida + ')' : ''}`);
  else if (antes && 'calificacion' in req.body && req.body.calificacion !== antes.calificacion) act(req, 'Calificó un lead', `${nombreC(c.telefono)}: ${c.calificacion || 'sin calificar'}`);
  else act(req, 'Editó un contacto', nombreC(c.telefono));
  ok(res, { contacto: c });
});
app.delete('/api/contactos/:tel', puede('eliminar'), (req, res) => { const n = nombreC(req.params.tel); db.eliminarContacto(req.params.tel); act(req, 'Eliminó un contacto', n); ok(res); });
app.post('/api/contactos/importar', puede('masivos'), (req, res) => {
  let nuevos = 0, actualizados = 0, invalidos = 0;
  for (const f of req.body.filas || []) { const tel = normPhone(f.telefono); if (!tel) { invalidos++; continue; } db.guardarContacto({ ...f, telefono: tel, origen: 'excel' }) ? nuevos++ : actualizados++; }
  act(req, 'Importó contactos desde Excel', `${nuevos} nuevos, ${actualizados} actualizados`);
  ok(res, { nuevos, actualizados, invalidos });
});
app.post('/api/segmento', (req, res) => { const l = db.buscarContactos({ ...(req.body.filtros || {}), sinBajas: true }); ok(res, { n: l.length, muestra: l.slice(0, 3) }); });

// Envíos
const TANDAS = require('./tandas');
const sinPermisoMasivo = (req, b) => !req.esAdmin && !req.permisos.masivos && (b.segmento || (b.destinatarios || []).length > 5);
const MSJ_SIN_PERMISO = 'Tu usuario puede enviar a máximo 5 contactos a la vez y sin segmentos. Pídele permiso de envíos masivos al administrador.';
// Lista completa para revisar antes de enviar, con los avisos de cada persona (no guarda nada)
app.post('/api/envios/vista', (req, res) => {
  const b = req.body || {};
  if (sinPermisoMasivo(req, b)) return fail(res, MSJ_SIN_PERMISO, 403);
  const { lista, invalidos } = TANDAS.unirDestinatarios(b, { normPhone, buscarContactos: db.buscarContactos });
  const datos = db.datosParaAvisos(lista.map((c) => c.telefono)), ahora = new Date();
  ok(res, { invalidos, lista: lista.map((c) => {
    const d = datos.get(c.telefono), ct = d ? db.contacto(c.telefono) : null;
    return { telefono: c.telefono, nombre: (ct && ct.nombre) || c.nombre || '', apellido: (ct && ct.apellido) || c.apellido || '', etapa: d ? d.etapa : '', avisos: TANDAS.avisosDe(d, ahora) };
  }) });
});
app.post('/api/envios', (req, res) => {
  const b = req.body || {};
  const versiones = (Array.isArray(b.versiones) ? b.versiones : [b.texto]).map((v) => String(v || '').trim()).filter(Boolean).slice(0, 5);
  if (b.adjunto && !db.adjunto(b.adjunto)) return fail(res, 'No se encontró la foto o video adjunto');
  if (!versiones.length && !b.adjunto) return fail(res, 'Escribe el mensaje');
  b.texto = versiones[0] || '';
  const extra = { versiones: versiones.length > 1 ? versiones : null, adjunto: b.adjunto || null, segundo: String(b.segundo || '').trim(), noRepetir: !!b.noRepetir, modo: modoDe(b.modo) };
  if (sinPermisoMasivo(req, b)) return fail(res, MSJ_SIN_PERMISO, 403);
  const { lista, invalidos } = TANDAS.unirDestinatarios({ ...b, excluir: Array.isArray(b.excluir) ? b.excluir : [], incluir: Array.isArray(b.incluir) ? b.incluir : null }, { normPhone, buscarContactos: db.buscarContactos });
  if (!lista.length) return fail(res, 'No hay destinatarios válidos');
  // Los agregados a mano se guardan como contactos (solo los que quedaron en la lista)
  const aMano = new Set((b.destinatarios || []).map((c) => normPhone(c.telefono)).filter(Boolean));
  for (const c of lista) if (aMano.has(c.telefono)) db.guardarContacto({ ...c, origen: c.origen || 'manual' });
  if (b.cuando) {
    const fecha = new Date(b.cuando); if (isNaN(fecha)) return fail(res, 'Fecha inválida');
    const id = db.crearProgramado({ nombre: b.nombre || 'Envío programado', texto: b.texto, destinatarios: lista.map((c) => ({ ...c, _usuario: req.usuario.nombre })), fecha: fecha.toISOString(), secuencia: !!b.secuencia, extra });
    act(req, 'Programó un envío', `"${b.nombre || 'Envío programado'}" · ${lista.length} contactos · ${fecha.toLocaleString('es-CL')}`);
    evento({ estado: 'programado', detalle: `"${b.nombre || 'Envío programado'}" para ${fecha.toLocaleString('es-CL')} (${lista.length} contactos)` });
    return ok(res, { programado: id, total: lista.length, invalidos });
  }
  const tanda = db.crearTanda({ nombre: b.nombre || TANDAS.nombrePorDefecto(b.texto, new Date()), usuario: req.usuario.nombre, tipo: 'masivo', total: lista.length, modo: extra.modo });
  db.encolar(lista.map((c) => ({ telefono: c.telefono, texto: b.texto, tipo: 'masivo', datos: { contacto: c, secuencia: !!b.secuencia, noRepetir: !!b.noRepetir, usuario: req.usuario.nombre, versiones: extra.versiones, adjunto: extra.adjunto, segundo: extra.segundo } })), tanda);
  act(req, lista.length > 1 ? 'Envió un mensaje masivo' : 'Envió un mensaje', lista.length > 1 ? `${lista.length} contactos` : nombreC(lista[0].telefono));
  evento({ estado: 'cola', detalle: `${lista.length} mensajes agregados a la cola` });
  ok(res, { total: lista.length, invalidos, tanda });
});
app.get('/api/programados', (req, res) => res.json({ programados: db.programados() }));
app.get('/api/adjuntos/:id', (req, res) => { const a = db.adjunto(req.params.id); if (!a) return res.status(404).end(); res.type(a.mime); res.sendFile(path.join(ADJ, a.archivo)); });
// Mensajes agendados para avisar a clientes (sección Automáticos)
const leerAgendado = (b) => {
  const lista = []; const vistos = new Set();
  for (const c of b.destinatarios || []) { const tel = normPhone(c.telefono) || (esLid(c.telefono) ? c.telefono : null); if (tel && !vistos.has(tel)) { vistos.add(tel); lista.push({ telefono: tel, nombre: c.nombre || '', apellido: c.apellido || '' }); } }
  const fecha = new Date(b.fecha);
  if (!lista.length) throw new Error('Elige al menos un cliente');
  if (!String(b.texto || '').trim() && !b.adjunto) throw new Error('Escribe el mensaje');
  if (isNaN(fecha)) throw new Error('Elige la fecha y hora');
  if (b.adjunto && !db.adjunto(b.adjunto)) throw new Error('No se encontró el archivo adjunto');
  return { texto: String(b.texto || '').trim(), adjunto: b.adjunto || null, destinatarios: lista, fecha: fecha.toISOString() };
};
app.get('/api/agendados', (req, res) => res.json({ agendados: db.agendados().map((a) => ({ ...a, adjuntoInfo: a.adjunto ? db.adjunto(a.adjunto) : null, destinatarios: a.destinatarios.map((c) => ({ ...c, nombre: nombreC(c.telefono).replace(/^\+\d+$/, c.nombre || '') || c.nombre })) })) }));
app.post('/api/agendados', (req, res) => { try { const a = leerAgendado(req.body || {}); ok(res, { id: db.crearAgendado(a) }); } catch (e) { fail(res, e.message); } });
app.put('/api/agendados/:id', (req, res) => { try { db.editarAgendado(parseInt(req.params.id), leerAgendado(req.body || {})); ok(res); } catch (e) { fail(res, e.message); } });
app.delete('/api/agendados/:id', (req, res) => { if (!db.cancelarAgendado(parseInt(req.params.id))) return fail(res, 'Ese mensaje ya salió o ya estaba cancelado'); ok(res); });
app.patch('/api/programados/:id', (req, res) => { db.editarProgramado(parseInt(req.params.id), req.body || {}); act(req, 'Editó un envío programado', req.body.nombre || ''); ok(res); });
app.delete('/api/programados/:id', (req, res) => { db.estadoProgramado(parseInt(req.params.id), 'cancelado'); act(req, 'Canceló un envío programado'); ok(res); });
// Tandas: ver quién falta, sacar, pasar primero, pausar o cancelar una sola tanda
const quienSoy = (req) => ({ esAdmin: !!req.esAdmin, nombre: req.usuario && req.usuario.nombre, masivos: !!(req.permisos && req.permisos.masivos) });
const SIN_PERMISO_TANDA = 'Solo quien lanzó la tanda o el administrador puede cambiarla';
const tandaDeItem = (itemId) => { const q = db.get('SELECT telefono, tanda FROM cola WHERE id = ?', [itemId]); return q && q.tanda ? { q, t: db.tanda(q.tanda) } : null; };
const programadoConLista = (id) => { const p = db.get("SELECT id, nombre, destinatarios FROM programados WHERE id = ? AND estado = 'pendiente'", [id]); if (!p) return null; const d = JSON.parse(p.destinatarios || '[]'); return { ...p, destinatarios: d, usuario: (d[0] && d[0]._usuario) || null }; };
app.get('/api/tandas', (req, res) => {
  const yo = quienSoy(req);
  const tandas = db.tandas({ desde: new Date(Date.now() - 30 * 86400000).toISOString() });
  const pueden = new Set(db.tandasQuePuedenEnviar().map((t) => t.id)), bloqueo = bloqueoGlobal(), ahora = Date.now();
  for (const t of tandas) {
    const c = cola.carriles['t' + t.id], b = pueden.has(t.id) ? null : db.bloqueadaPor(t.id);
    Object.assign(t, { estadoTexto: TANDAS.estadoTanda({ ...t, puedeEnviar: pueden.has(t.id), bloqueoGlobal: bloqueo }), puedeManejar: TANDAS.puedeManejar(t, yo),
      nextAt: c && c.nextAt > ahora ? c.nextAt : null, despuesDe: b ? b.nombre : null });
  }
  const programados = db.programados().map((p) => { const c = programadoConLista(p.id); return { ...p, puedeManejar: TANDAS.puedeManejar({ usuario: c && c.usuario }, yo) }; });
  res.json({ tandas, programados });
});
app.get('/api/tandas/:id', (req, res) => {
  const t = db.tanda(parseInt(req.params.id)); if (!t) return fail(res, 'Esa tanda ya no existe', 404);
  const ahora = new Date();
  res.json({ tanda: { ...t, puedeManejar: TANDAS.puedeManejar(t, quienSoy(req)) }, items: db.itemsDeTanda(t.id).map((x) => ({ ...x, escribio: x.estado === 'pendiente' || x.estado === 'enviando' ? TANDAS.escribioHace(x.ultimo_entrante, t.creada, ahora) : null })) });
});
app.post('/api/tandas/:id/pausa', (req, res) => {
  const t = db.tanda(parseInt(req.params.id)); if (!t) return fail(res, 'Esa tanda ya no existe', 404);
  if (!TANDAS.puedeManejar(t, quienSoy(req))) return fail(res, SIN_PERMISO_TANDA, 403);
  db.pausarTanda(t.id, !!req.body.pausada); act(req, req.body.pausada ? 'Pausó una tanda' : 'Reanudó una tanda', `"${t.nombre}"`); ok(res);
});
app.post('/api/tandas/:id/cancelar', (req, res) => {
  const t = db.tanda(parseInt(req.params.id)); if (!t) return fail(res, 'Esa tanda ya no existe', 404);
  if (!TANDAS.puedeManejar(t, quienSoy(req))) return fail(res, SIN_PERMISO_TANDA, 403);
  const n = db.cancelarTanda(t.id); act(req, 'Canceló lo que faltaba de una tanda', `"${t.nombre}" · ${n} mensajes`);
  evento({ estado: 'cancelado', detalle: `"${t.nombre}": se cancelaron ${n} mensajes pendientes` }); ok(res, { cancelados: n });
});
app.post('/api/tandas/item/:itemId/sacar', (req, res) => {
  const x = tandaDeItem(parseInt(req.params.itemId)); if (!x) return fail(res, 'Ese mensaje ya no está en una tanda', 404);
  if (!TANDAS.puedeManejar(x.t, quienSoy(req))) return fail(res, SIN_PERMISO_TANDA, 403);
  const resultado = db.sacarDeTanda(parseInt(req.params.itemId), req.usuario.nombre);
  if (resultado === 'sacado') {
    act(req, 'Sacó a un contacto de una tanda', `"${x.t.nombre}" · ${nombreC(x.q.telefono)}`);
  }
  // «Sí, también» vale aunque el mensaje ya estuviera saliendo: se detienen y no se inician después
  if (req.body.seguimientos) { db.detenerSecuencia(x.q.telefono, 'Sacado de una tanda'); if (resultado !== 'sacado') db.marcarSinSeguimiento(parseInt(req.params.itemId)); }
  ok(res, { resultado });
});
// Nuevo orden de los pendientes de un grupo (arrastrando en la lista)
app.put('/api/tandas/:id/orden', (req, res) => {
  const t = db.tanda(parseInt(req.params.id)); if (!t || t.estado === 'cancelada') return fail(res, 'Esa tanda ya no existe', 404);
  if (!TANDAS.puedeManejar(t, quienSoy(req))) return fail(res, SIN_PERMISO_TANDA, 403);
  db.ordenarTanda(t.id, Array.isArray(req.body.ids) ? req.body.ids : []); act(req, 'Cambió el orden de una tanda', `"${t.nombre}"`); ok(res);
});
app.get('/api/programados/:id/lista', (req, res) => {
  const p = programadoConLista(parseInt(req.params.id)); if (!p) return fail(res, 'Ese envío programado ya salió o fue cancelado', 404);
  res.json({ nombre: p.nombre, puedeManejar: TANDAS.puedeManejar(p, quienSoy(req)), items: p.destinatarios.map((c) => ({ telefono: c.telefono, nombre: nombreC(c.telefono).replace(/^\+\d+$/, c.nombre || '') || c.nombre || '' })) });
});
app.post('/api/programados/:id/quitar', (req, res) => {
  const p = programadoConLista(parseInt(req.params.id)); if (!p) return fail(res, 'Ese envío programado ya salió o fue cancelado', 404);
  if (!TANDAS.puedeManejar(p, quienSoy(req))) return fail(res, SIN_PERMISO_TANDA, 403);
  const quedan = db.quitarDeProgramado(p.id, req.body.telefono); act(req, 'Sacó a un contacto de un envío programado', `"${p.nombre}" · ${nombreC(req.body.telefono)}`); ok(res, { quedan });
});
app.post('/api/cola/pausa', (req, res) => { db.setConfig('cola_pausada', !!req.body.pausada); act(req, req.body.pausada ? 'Pausó los envíos' : 'Reanudó los envíos'); ok(res); });
app.post('/api/cola/cancelar', soloAdmin, (req, res) => { db.cancelarCola(['masivo', 'programado']); evento({ estado: 'cancelado', detalle: 'Se cancelaron los envíos pendientes' }); ok(res); });

// Chats
app.get('/api/chats', (req, res) => res.json({ chats: db.chats({ q: req.query.q || '', sinLeer: req.query.sinLeer === '1' }) }));
app.get('/api/chats/:tel', async (req, res) => {
  const tel = req.params.tel;
  if (esLid(tel)) { const t2 = db.telDeLid(tel); if (t2) return res.redirect('/api/chats/' + t2 + (req.query.sinHistorial ? '?sinHistorial=1' : '')); }
  if (wa.state === 'listo' && db.contarMensajes(tel) < 3 && !req.query.sinHistorial) {
    try {   // trae el historial reciente desde WhatsApp la primera vez
      const chat = await chatDe(tel);
      if (chat) for (const m of await chat.fetchMessages({ limit: 40 }))
        guardarMsj(m, tel, { leido: true });
    } catch {}
  }
  db.marcarLeido(tel);
  const c = db.contacto(tel);
  const limite = Math.max(50, Math.min(5000, parseInt(req.query.limite) || 400));
  const total = db.contarMensajes(tel);
  res.json({ contacto: c ? { ...c, edadActual: edadActual(c) } : { telefono: tel, nombre: db.nombreWa(tel) }, mensajes: db.mensajes(tel, limite), total, etapas: ETAPAS, wa: wa.state });
});
// Cargar mensajes anteriores de un chat (de 50 en 50)
app.post('/api/chats/:tel/anteriores', async (req, res) => {
  const tel = req.params.tel;
  if (wa.state !== 'listo') return res.status(409).json({ error: 'WhatsApp no está conectado', sinConexion: true });
  try {
    const chat = await chatDe(tel);
    if (!chat) return fail(res, 'No se encontró este chat en WhatsApp');
    const antes = db.contarMensajes(tel);
    const guardar = (lista) => { for (const m of lista) guardarMsj(m, tel, { leido: true }); };
    const pedir = antes + 50;
    let lista = await chat.fetchMessages({ limit: pedir });
    guardar(lista);
    let nuevos = db.contarMensajes(tel) - antes;
    if (nuevos === 0) {   // pide al celular que comparta más historial y vuelve a intentar
      try { await chat.syncHistory(); } catch {}
      await sleep(5000);
      lista = await chat.fetchMessages({ limit: pedir });
      guardar(lista);
      nuevos = db.contarMensajes(tel) - antes;
    }
    ok(res, { nuevos, fin: nuevos === 0 });
  } catch (e) { fail(res, 'No se pudieron traer los mensajes: ' + e.message, 500); }
});
// Imágenes y archivos
app.get('/api/media/:id', async (req, res) => {
  const id = parseInt(req.params.id); const m = db.mensajeMedia(id);
  if (!m || !m.media_estado) return res.status(404).end();
  try {
    const archivo = await bajarMedia(id);
    res.type(m.media_mime || 'application/octet-stream');
    if (req.query.descargar) res.attachment(m.media_nombre || archivo);
    res.sendFile(path.join(MEDIA, archivo));
  } catch (e) { res.status(e.message.includes('conectado') ? 409 : 410).json({ error: e.message }); }
});
app.post('/api/chats/:tel/archivo', async (req, res) => {
  const tel = normPhone(req.params.tel) || (esLid(req.params.tel) ? req.params.tel : null);
  const b = req.body || {};
  const m = /^data:([^;,]+)?;base64,(.+)$/.exec(b.dataUrl || '');
  if (!tel) return fail(res, 'El número de este chat no es válido');
  if (!m) return fail(res, 'No se pudo leer el archivo');
  if (wa.state !== 'listo') return fail(res, 'WhatsApp no está conectado');
  const mime = m[1] || 'application/octet-stream', data = m[2];
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > 16 * 1024 * 1024) return fail(res, 'El archivo pesa más de 16 MB');
  try {
    const { MessageMedia } = require('whatsapp-web.js');
    const nombre = String(b.nombre || 'archivo').slice(0, 120);
    const media = new MessageMedia(mime, data, nombre, bytes.length);
    const esImagen = /^image\/(jpeg|png|webp)$/.test(mime);
    const ct = db.contacto(tel) || { nombre: db.nombreWa(tel) };
    const caption = fill(String(b.texto || '').trim(), ct);
    let enviado;
    try { enviado = await enviarA(tel, media, { caption: caption || undefined, sendMediaAsDocument: !esImagen }); }
    catch (e) { if (e.sinWa) return fail(res, 'Ese número no tiene WhatsApp'); throw e; }
    const id = db.guardarMensaje({ ...datosMsj({ ...enviado, hasMedia: true, body: caption, fromMe: true, timestamp: enviado.timestamp || Date.now() / 1000, id: enviado.id, _data: { mimetype: mime, filename: nombre, size: bytes.length }, type: esImagen ? 'image' : 'document' }, tel), leido: true });
    if (id) { const archivo = id + '.' + extDe(mime, nombre); fs.writeFileSync(path.join(MEDIA, archivo), bytes); db.marcarMedia(id, 'ok', archivo); db.run('UPDATE mensajes SET media_mime = ?, media_nombre = ? WHERE id = ?', [mime, nombre, id]); }
    db.registrarEnvio(tel, caption || '[' + nombre + ']', 'manual', 'enviado', null, req.usuario.nombre);
    ok(res);
  } catch (e) { fail(res, 'No se pudo enviar: ' + e.message, 500); }
});
app.post('/api/chats/:tel', async (req, res) => {
  const tel = normPhone(req.params.tel) || (esLid(req.params.tel) ? req.params.tel : null); const texto = String(req.body.texto || '').trim();
  if (!texto) return fail(res, 'Escribe un mensaje');
  if (!tel) return fail(res, 'El número de este chat no es válido');
  if (wa.state !== 'listo') return fail(res, 'WhatsApp no está conectado');
  try {
    const ct = db.contacto(tel) || { nombre: db.nombreWa(tel) };
    const final = fill(texto, ct);
    let m;
    try { m = await enviarA(tel, final); } catch (e) { if (e.sinWa) return fail(res, 'Ese número no tiene WhatsApp'); throw e; }
    db.guardarMensaje({ wa_id: m?.id?.id || m?.id?._serialized, wa_ser: m?.id?._serialized, telefono: tel, de_mi: true, texto: final, leido: true });
    db.registrarEnvio(tel, final, 'manual', 'enviado', null, req.usuario.nombre);
    act(req, 'Respondió un chat', nombreC(tel));
    ok(res);
  } catch (e) { fail(res, 'No se pudo enviar: ' + e.message, 500); }
});

// Configuración
const EDITABLES = ['reglas', 'secuencia', 'fueraHorario', 'respuestasRapidas', 'avisos', 'apariencia', 'ui', 'llamadas', 'estancado'];
app.get('/api/config', (req, res) => res.json(Object.fromEntries([...EDITABLES.map((k) => [k, db.getConfig(k)]), ['etapas', ETAPAS]])));
app.put('/api/config/:clave', (req, res) => {
  const k = req.params.clave;
  if (!EDITABLES.includes(k)) return fail(res, 'No editable');
  const libre = k === 'ui', auto = ['secuencia', 'fueraHorario', 'llamadas'].includes(k);
  if (!libre && !req.esAdmin && !(auto && req.permisos.automaticos)) return fail(res, 'Solo el administrador puede cambiar esto', 403);
  db.setConfig(k, req.body.valor);
  const NOM = { reglas: 'las reglas de envío', secuencia: 'los mensajes automáticos', fueraHorario: 'la respuesta fuera de horario', respuestasRapidas: 'las respuestas rápidas', avisos: 'los avisos', apariencia: 'la apariencia', llamadas: 'los mensajes de llamadas', resumen: 'el resumen diario', postventa: 'la postventa', referidos: 'el mensaje de referidos', estancado: 'los días para lead estancado' };
  if (!libre) act(req, 'Cambió ' + (NOM[k] || k));
  ok(res);
});
// Respaldo de la base de datos (solo administrador)
app.get('/api/respaldo', (req, res) => {
  db.flush();
  act(req, 'Descargó un respaldo de los datos');
  res.download(path.join(DATA, 'crm.db'), `respaldo-crm-hermes-${new Date().toISOString().slice(0, 10)}.db`);
});
app.post('/api/fondo', soloAdmin, (req, res) => {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(req.body.dataUrl || '');
  if (!m) return fail(res, 'Formato no válido (usa JPG, PNG o WEBP)');
  for (const f of fs.readdirSync(DATA)) if (/^fondo\./.test(f)) fs.rmSync(path.join(DATA, f), { force: true });
  fs.writeFileSync(path.join(DATA, 'fondo.' + (m[1] === 'jpeg' ? 'jpg' : m[1])), Buffer.from(m[2], 'base64'));
  const a = db.getConfig('apariencia'); a.fondo = 'propio'; a.v = Date.now(); db.setConfig('apariencia', a);
  ok(res, { apariencia: a });
});
app.get('/api/fondo', (req, res) => { const f = fs.readdirSync(DATA).find((x) => /^fondo\./.test(x)); f ? res.sendFile(path.join(DATA, f)) : res.status(404).end(); });

// Actualizaciones
app.post('/api/actualizacion/buscar', soloAdmin, (req, res) => { if (updater) updater.buscar(); ok(res); });
app.post('/api/actualizacion/instalar', soloAdmin, (req, res) => { ok(res); if (updater) setTimeout(() => updater.instalar(), 500); });

const busy = () => db.pendientesCola() > 0 && wa.state === 'listo';
const destroy = async () => { cerrandoPrograma = true; try { if (client) await client.destroy(); } catch {} if (!embebido) { try { await killOrphans(); } catch {} } db.flush(); };
startWhatsApp();
return new Promise((resolve) => {
  const srv = app.listen(port, '127.0.0.1', () => resolve({ port: (puertoServidor = srv.address().port), busy, destroy, avisos: () => db.getConfig('avisos') }));
});
};
