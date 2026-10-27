// Base de datos interna (SQLite en un archivo: datos/crm.db) usando sql.js (WebAssembly, sin instalar nada)
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const ETAPAS = ['Nuevo', 'Contactado', 'Respondió', 'Cotización enviada', 'Firma/documentos', 'Ingresado', 'Perdido'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contactos (
  telefono TEXT PRIMARY KEY, nombre TEXT, apellido TEXT,
  edad INTEGER, edad_fecha TEXT, renta TEXT, cargas TEXT, isapre TEXT,
  etapa TEXT DEFAULT 'Nuevo', calificacion TEXT, motivo_perdida TEXT, origen TEXT,
  creado TEXT, actualizado TEXT
);
CREATE TABLE IF NOT EXISTS envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, telefono TEXT NOT NULL, texto TEXT,
  tipo TEXT DEFAULT 'masivo', estado TEXT, fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_envios_tel ON envios(telefono);
CREATE INDEX IF NOT EXISTS idx_envios_fecha ON envios(fecha);
CREATE TABLE IF NOT EXISTS bajas (telefono TEXT PRIMARY KEY, fecha TEXT);
CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, wa_id TEXT UNIQUE, telefono TEXT NOT NULL,
  de_mi INTEGER, texto TEXT, fecha TEXT, leido INTEGER DEFAULT 0, ack INTEGER DEFAULT 0, tipo TEXT
);
CREATE INDEX IF NOT EXISTS idx_msj_tel ON mensajes(telefono, fecha);
CREATE TABLE IF NOT EXISTS nombres_wa (telefono TEXT PRIMARY KEY, nombre TEXT);
CREATE TABLE IF NOT EXISTS lids (lid TEXT PRIMARY KEY, telefono TEXT);
CREATE TABLE IF NOT EXISTS leads_meta (id TEXT PRIMARY KEY, form_id TEXT, form_nombre TEXT, telefono TEXT, nombre TEXT, creado TEXT, recibido TEXT, campos TEXT);
CREATE TABLE IF NOT EXISTS recordatorios (id INTEGER PRIMARY KEY AUTOINCREMENT, telefono TEXT, fecha TEXT, texto TEXT, creado TEXT, avisado INTEGER DEFAULT 0, hecho INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_leads_creado ON leads_meta(creado);
CREATE TABLE IF NOT EXISTS cola (
  id INTEGER PRIMARY KEY AUTOINCREMENT, telefono TEXT, texto TEXT, tipo TEXT,
  datos TEXT, creado TEXT, estado TEXT DEFAULT 'pendiente', detalle TEXT, procesado TEXT
);
CREATE INDEX IF NOT EXISTS idx_cola_estado ON cola(estado, id);
CREATE TABLE IF NOT EXISTS tandas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, usuario TEXT, creada TEXT, tipo TEXT,
  programado INTEGER, pausada INTEGER DEFAULT 0, estado TEXT DEFAULT 'activa', total INTEGER
);
CREATE TABLE IF NOT EXISTS programados (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, texto TEXT, destinatarios TEXT,
  fecha TEXT, secuencia INTEGER DEFAULT 0, estado TEXT DEFAULT 'pendiente', creado TEXT
);
CREATE TABLE IF NOT EXISTS adjuntos (id TEXT PRIMARY KEY, nombre TEXT, mime TEXT, tam INTEGER, archivo TEXT, creado TEXT);
CREATE TABLE IF NOT EXISTS llamadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, telefono TEXT, fecha TEXT, estado TEXT DEFAULT 'pendiente',
  conf_id INTEGER, rec_id INTEGER, recordatorio_id INTEGER, creado TEXT
);
CREATE TABLE IF NOT EXISTS agendados (
  id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT, adjunto TEXT, destinatarios TEXT,
  fecha TEXT, estado TEXT DEFAULT 'pendiente', creado TEXT, procesado TEXT
);
`;

// Valores iniciales (todo editable desde el programa)
const DEFAULTS = {
  reglas: {
    horario: { lv: { on: true, desde: '09:30', hasta: '20:00' }, sab: { on: true, desde: '10:00', hasta: '14:00' }, dom: { on: false, desde: '10:00', hasta: '14:00' } },
    limiteDiario: 80, esperaMin: 45, esperaMax: 120, descansoCada: 20, descansoMin: 10
  },
  secuencia: {
    pausada: false,
    pasos: [
      { activo: true, horas: 0, texto: 'Hola {nombre}, ¿cómo estás? Soy Jesús de Conecta Salud 👋\nTe escribo porque dejaste tus datos para revisar tu plan de salud. Vi que estás en {isapre}, así que te puedo mostrar opciones para comparar.\n¿Te acomoda que te las mande por aquí?\n\nSi prefieres no recibir más mensajes, responde BAJA.' },
      { activo: true, horas: 24, texto: '{nombre}, te escribo de nuevo por si se te pasó mi mensaje de ayer 🙂\nCon tu renta y tus cargas ya tengo un par de planes que podrías comparar. ¿Te los envío?' },
      { activo: true, horas: 72, texto: 'Hola {nombre}, este es mi último mensaje para no molestarte.\nSi más adelante quieres revisar tu plan, me escribes por aquí y lo vemos sin compromiso. ¡Que estés muy bien!' }
    ]
  },
  fueraHorario: { activa: true, texto: '¡Hola {nombre}! Gracias por escribir a Conecta Salud. En este momento estamos fuera de horario, pero mañana a primera hora te respondo. 🙌' },
  respuestasRapidas: [
    { atajo: '/cotiza', texto: 'Te envío la cotización con las opciones que revisamos para ti. Cualquier duda me escribes por aquí.' },
    { atajo: '/cargas', texto: 'Para cotizar con tus cargas necesito la edad de cada una. ¿Me las puedes enviar?' },
    { atajo: '/docs', texto: 'Para avanzar con el ingreso necesito: carnet por ambos lados, tus últimas 3 liquidaciones de sueldo y el certificado de cotizaciones.' },
    { atajo: '/gracias', texto: '¡Gracias por tu tiempo! Cualquier duda me escribes por aquí.' }
  ],
  avisos: { chatNuevo: true, leadNuevo: true, baja: true, sonido: true },
  apariencia: { fondo: 'aurora', opacidad: 46 },
  ui: {},
  // 4.0.0 · CRM HERMES
  llamadas: {
    horas: ['10:00', '16:00'],
    confirmacion: { on: true, texto: 'Hola {nombre} 👋 Quedamos en conversar {dia} a las {hora}. ¡Te llamo!' },
    recordatorio: { on: true, minutos: 60, texto: 'Hola {nombre}, te recuerdo que hablamos {dia} a las {hora} 📞 ¿Sigue bien para ti?' },
    avisoMin: 10
  },
  resumen: { activo: true, hora: '08:30' },
  postventa: {
    bienvenida: { on: true, texto: '¡Felicitaciones por tu nuevo plan, {nombre}! 🎉 Gracias por confiar en Conecta Salud. Cualquier duda con tu Isapre, me escribes por aquí y te ayudo.' },
    control: { on: true, dias: 30, texto: 'Hola {nombre} 👋 Ya llevas un mes con tu nuevo plan. ¿Cómo te ha ido? ¿Te llegó todo bien? Si tienes cualquier duda, aquí estoy.' }
  },
  referidos: { on: true, dias: 45, texto: 'Hola {nombre} 😊 Me alegra haberte ayudado con tu plan. Si conoces a alguien que quiera revisar el suyo (familia, amigos o compañeros de trabajo), me puedes pasar su contacto y lo ayudo igual que a ti. ¡Gracias!' },
  estancado: { dias: 5 }
};

async function openDb(dataDir) {
  const file = path.join(dataDir, 'crm.db');
  const SQL = await initSqlJs({ locateFile: (f) => require.resolve('sql.js/dist/' + f) });
  let db;
  try { db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database(); }
  catch { try { fs.renameSync(file, file + '.danado-' + Date.now()); } catch {} db = new SQL.Database(); }
  db.exec(SCHEMA);
  // Columnas nuevas en tablas existentes
  const cols = (t) => { const r = db.exec(`PRAGMA table_info(${t})`); return r.length ? r[0].values.map((v) => v[1]) : []; };
  const ensure = (t, c, def) => { if (!cols(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
  ensure('contactos', 'seq_estado', 'TEXT');   // activa, detenida, terminada
  ensure('contactos', 'seq_paso', 'INTEGER DEFAULT 0');
  ensure('contactos', 'seq_inicio', 'TEXT');
  ensure('contactos', 'seq_motivo', 'TEXT');
  ensure('contactos', 'ultimo_entrante', 'TEXT');
  ensure('envios', 'plantilla', 'TEXT');
  ensure('envios', 'usuario', 'TEXT');
  ensure('mensajes', 'wa_ser', 'TEXT');        // id completo para volver a pedir el mensaje a WhatsApp
  ensure('mensajes', 'media_mime', 'TEXT');
  ensure('mensajes', 'media_nombre', 'TEXT');
  ensure('mensajes', 'media_tam', 'INTEGER');
  ensure('mensajes', 'media_archivo', 'TEXT');  // archivo guardado en datos/media
  ensure('mensajes', 'media_estado', 'TEXT');   // pendiente, ok, error
  ensure('programados', 'extra', 'TEXT');      // versiones, foto/video y segundo mensaje
  // 4.0.0 · CRM HERMES
  ensure('contactos', 'etapa_fecha', 'TEXT');    // desde cuándo está en su etapa actual (leads estancados)
  ensure('contactos', 'referido_por', 'TEXT');
  ensure('contactos', 'ingreso_fecha', 'TEXT');  // cuándo pasó a Ingresado
  ensure('contactos', 'postventa', 'INTEGER DEFAULT 0');
  ensure('agendados', 'etiqueta', 'TEXT');       // llamada, recordatorio de llamada, postventa, control, referidos
  ensure('agendados', 'telefono', 'TEXT');
  ensure('recordatorios', 'llamada_id', 'INTEGER');
  ensure('cola', 'tanda', 'INTEGER');            // a qué tanda de envío pertenece
  ensure('cola', 'orden', 'INTEGER');            // orden dentro de la tanda (se cambia arrastrando)
  ensure('cola', 'sin_seguimiento', 'INTEGER DEFAULT 0');   // pidieron no iniciar seguimientos tras este envío
  ensure('tandas', 'modo', "TEXT DEFAULT 'despues'");      // despues: espera a los grupos anteriores · corriendo: sale a la vez
  // Si el programa se cerró a mitad de un envío no se reintenta: no se sabe si salió
  db.run("UPDATE cola SET estado = 'error', detalle = 'El programa se cerró mientras se enviaba: revisa en tu celular si salió', procesado = ? WHERE estado = 'enviando'", [new Date().toISOString()]);
  db.run("UPDATE contactos SET etapa_fecha = COALESCE(actualizado, creado) WHERE etapa_fecha IS NULL");

  db.exec(`CREATE INDEX IF NOT EXISTS idx_msj_leido ON mensajes(leido, telefono);
    CREATE INDEX IF NOT EXISTS idx_msj_demi ON mensajes(de_mi, fecha);
    CREATE INDEX IF NOT EXISTS idx_cola_tel ON cola(telefono, tipo, estado);
    CREATE INDEX IF NOT EXISTS idx_cola_tanda ON cola(tanda, estado);
    CREATE INDEX IF NOT EXISTS idx_lids_tel ON lids(telefono);
    CREATE INDEX IF NOT EXISTS idx_rec_tel ON recordatorios(hecho, telefono);
    CREATE INDEX IF NOT EXISTS idx_llam_tel ON llamadas(estado, telefono);`);
  // Limpieza: la cola ya procesada de hace más de 60 días no se necesita
  try { db.run("DELETE FROM cola WHERE estado <> 'pendiente' AND procesado < ?", [new Date(Date.now() - 60 * 86400000).toISOString()]); } catch {}

  // Guardado al disco agrupado: se espera a que haya 1,5 s de calma (máximo 8 s) para no escribir el archivo a cada rato
  let timer = null, primero = 0;
  const flush = () => { clearTimeout(timer); timer = null; primero = 0; const tmp = file + '.tmp'; fs.writeFileSync(tmp, Buffer.from(db.export())); fs.renameSync(tmp, file); };
  const save = () => {
    const ahora = Date.now(); if (!primero) primero = ahora;
    clearTimeout(timer);
    timer = setTimeout(flush, ahora - primero > 8000 ? 0 : 1500);
  };
  const all = (sql, p = []) => { const st = db.prepare(sql); st.bind(p); const r = []; while (st.step()) r.push(st.getAsObject()); st.free(); return r; };
  const get = (sql, p = []) => all(sql, p)[0];
  const run = (sql, p = []) => { db.run(sql, p); save(); };
  const lastId = () => db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  const now = () => new Date().toISOString();
  const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
  const txt = (v) => (v == null ? '' : String(v).trim());
  const rentaNum = (v) => {
    if (typeof v === 'number') return String(Math.round(v));
    const s = txt(v); if (!s) return '';
    const m = s.match(/\d[\d.,]*/); if (!m) return '';       // si es un rango, se toma el primer valor
    let n = m[0];
    if (/^\d{1,2}[.,]\d{1,2}$/.test(n) || /millon|mm\b/i.test(s)) return String(Math.round(parseFloat(n.replace(',', '.')) * 1000000));
    n = n.replace(/[.,]/g, '');
    if (/mil\b/i.test(s) && n.length <= 4) n = String(parseInt(n) * 1000);
    return n;
  };

  const api = {
    ETAPAS, all, get, run,
    // ---------- config
    getConfig: (k, def) => { const r = get('SELECT valor FROM config WHERE clave = ?', [k]); if (r) return JSON.parse(r.valor); return def !== undefined ? def : JSON.parse(JSON.stringify(DEFAULTS[k] ?? null)); },
    setConfig: (k, v) => run('INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)', [k, JSON.stringify(v)]),
    // ---------- bajas
    esBaja: (tel) => !!get('SELECT 1 AS x FROM bajas WHERE telefono = ?', [tel]),
    agregarBaja: (tel) => { run('INSERT OR IGNORE INTO bajas (telefono, fecha) VALUES (?, ?)', [tel, now()]); api.detenerSecuencia(tel, 'pidió BAJA'); },
    totalBajas: () => get('SELECT COUNT(*) AS n FROM bajas').n,
    bajasDesde: (iso) => get('SELECT COUNT(*) AS n FROM bajas WHERE fecha >= ?', [iso]).n,
    // ---------- envíos
    yaEnviado: (tel) => !!get("SELECT 1 AS x FROM envios WHERE telefono = ? AND estado = 'enviado' LIMIT 1", [tel]),
    registrarEnvio: (tel, texto, tipo, estado = 'enviado', plantilla = null, usuario = null) => run('INSERT INTO envios (telefono, texto, tipo, estado, fecha, plantilla, usuario) VALUES (?, ?, ?, ?, ?, ?, ?)', [tel, texto, tipo, estado, now(), plantilla, usuario]),
    // cuenta para el límite diario: todo lo automático o masivo (no las respuestas manuales)
    enviadosHoy: () => get("SELECT COUNT(*) AS n FROM envios WHERE estado = 'enviado' AND tipo NOT IN ('manual', 'fuera_horario', 'agendado', 'resumen') AND fecha >= ?", [hoy0()]).n,
    enviadosDesde: (iso) => get("SELECT COUNT(*) AS n FROM envios WHERE estado = 'enviado' AND tipo NOT IN ('manual', 'fuera_horario', 'resumen') AND fecha >= ?", [iso]).n,
    fueraHorarioHoy: (tel) => !!get("SELECT 1 AS x FROM envios WHERE telefono = ? AND tipo = 'fuera_horario' AND fecha >= ?", [tel, hoy0()]),
    // ---------- contactos
    contacto: (tel) => get('SELECT * FROM contactos WHERE telefono = ?', [tel]),
    guardarContacto: (c, { sobrescribir = false } = {}) => {
      const t = now();
      const edad = c.edad === '' || c.edad == null || isNaN(parseInt(c.edad)) ? null : parseInt(c.edad);
      const f = { nombre: txt(c.nombre), apellido: txt(c.apellido), renta: rentaNum(c.renta), cargas: txt(c.cargas), isapre: txt(c.isapre) };
      const prev = api.contacto(c.telefono);
      if (!prev) {
        run(`INSERT INTO contactos (telefono, nombre, apellido, edad, edad_fecha, renta, cargas, isapre, etapa, calificacion, origen, creado, actualizado, etapa_fecha, referido_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.telefono, f.nombre, f.apellido, edad, edad != null ? t : null, f.renta, f.cargas, f.isapre, c.etapa || 'Nuevo', c.calificacion || null, c.origen || 'manual', t, t, t, txt(c.referido_por) || null]);
        return true;
      }
      const pick = (k) => (sobrescribir ? f[k] : f[k] || prev[k] || '');
      run(`UPDATE contactos SET nombre = ?, apellido = ?, renta = ?, cargas = ?, isapre = ?, edad = ?, edad_fecha = ?, actualizado = ? WHERE telefono = ?`,
        [pick('nombre'), pick('apellido'), pick('renta'), pick('cargas'), pick('isapre'),
          edad != null ? edad : prev.edad, edad != null && edad !== prev.edad ? t : prev.edad_fecha, t, c.telefono]);
      return false;
    },
    actualizarContacto: (tel, campos) => {
      const permitidos = ['nombre', 'apellido', 'renta', 'cargas', 'isapre', 'etapa', 'calificacion', 'motivo_perdida', 'edad', 'referido_por'];
      const prev = api.contacto(tel); if (!prev) return null;
      const sets = [], vals = [];
      for (const k of permitidos) if (k in campos) {
        let v = campos[k];
        if (k === 'renta') v = rentaNum(v);
        if (k === 'edad') { v = v === '' || v == null ? null : parseInt(v); sets.push('edad_fecha = ?'); vals.push(now()); }
        sets.push(`${k} = ?`); vals.push(v === '' ? null : v);
      }
      if (!sets.length) return prev;
      if ('etapa' in campos && (campos.etapa || 'Nuevo') !== (prev.etapa || 'Nuevo')) { sets.push('etapa_fecha = ?'); vals.push(now()); }
      sets.push('actualizado = ?'); vals.push(now()); vals.push(tel);
      run(`UPDATE contactos SET ${sets.join(', ')} WHERE telefono = ?`, vals);
      if ('etapa' in campos && campos.etapa !== prev.etapa && campos._manual) api.detenerSecuencia(tel, 'cambió de etapa');
      return api.contacto(tel);
    },
    moverEtapaSi: (tel, desde, hacia) => run('UPDATE contactos SET etapa = ?, actualizado = ?, etapa_fecha = ? WHERE telefono = ? AND etapa IN (' + desde.map(() => '?').join(',') + ')', [hacia, now(), now(), tel, ...desde]),
    eliminarContacto: (tel) => run('DELETE FROM contactos WHERE telefono = ?', [tel]),
    buscarContactos: (f = {}) => {
      const w = [], p = [];
      if (f.etapa) { const e = [].concat(f.etapa); w.push(`etapa IN (${e.map(() => '?').join(',')})`); p.push(...e); }
      if (f.calificacion) { if (f.calificacion === 'Sin calificar') w.push('(calificacion IS NULL OR calificacion = \'\')'); else { w.push('calificacion = ?'); p.push(f.calificacion); } }
      if (f.isapre) { w.push('LOWER(isapre) = LOWER(?)'); p.push(f.isapre); }
      if (f.cargas === 'con') w.push("(cargas <> '' AND cargas IS NOT NULL AND cargas NOT IN ('0', 'Sin cargas', 'sin cargas'))");
      if (f.cargas === 'sin') w.push("(cargas IS NULL OR cargas = '' OR cargas IN ('0', 'Sin cargas', 'sin cargas'))");
      if (f.rentaMin) { w.push("CAST(renta AS INTEGER) >= ?"); p.push(parseInt(f.rentaMin)); }
      if (f.edadMin) { w.push('edad >= ?'); p.push(parseInt(f.edadMin)); }
      if (f.edadMax) { w.push('edad <= ?'); p.push(parseInt(f.edadMax)); }
      if (f.q) { const dig = f.q.replace(/\D/g, ''); if (dig.length >= 3) { w.push("(LOWER(IFNULL(nombre,'') || ' ' || IFNULL(apellido,'')) LIKE ? OR telefono LIKE ?)"); p.push('%' + f.q.toLowerCase() + '%', '%' + dig + '%'); } else { w.push("LOWER(IFNULL(nombre,'') || ' ' || IFNULL(apellido,'')) LIKE ?"); p.push('%' + f.q.toLowerCase().trim() + '%'); } }
      if (f.sinBajas) w.push('telefono NOT IN (SELECT telefono FROM bajas)');
      return all(`SELECT * FROM contactos ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY actualizado DESC LIMIT ${parseInt(f.limite) || 5000}`, p);
    },
    isapres: () => all("SELECT DISTINCT isapre FROM contactos WHERE isapre IS NOT NULL AND isapre <> '' ORDER BY isapre").map((r) => r.isapre),
    nuevosDesde: (iso) => get('SELECT COUNT(*) AS n FROM contactos WHERE creado >= ?', [iso]).n,
    // ---------- secuencia
    iniciarSecuencia: (tel) => run("UPDATE contactos SET seq_estado = 'activa', seq_paso = 1, seq_inicio = ?, seq_motivo = NULL WHERE telefono = ?", [now(), tel]),
    detenerSecuencia: (tel, motivo) => run("UPDATE contactos SET seq_estado = 'detenida', seq_motivo = ? WHERE telefono = ? AND seq_estado = 'activa'", [motivo, tel]),
    secuenciasActivas: () => all("SELECT telefono, seq_paso, seq_inicio FROM contactos WHERE seq_estado = 'activa'"),
    avanzarSecuencia: (tel, paso, terminada) => run('UPDATE contactos SET seq_paso = ?, seq_estado = ? WHERE telefono = ?', [paso, terminada ? 'terminada' : 'activa', tel]),
    // ---------- mensajes (chats)
    guardarMensaje: (m) => {
      db.run('INSERT OR IGNORE INTO mensajes (wa_id, telefono, de_mi, texto, fecha, leido, ack, tipo, wa_ser, media_mime, media_nombre, media_tam, media_archivo, media_estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [m.wa_id || null, m.telefono, m.de_mi ? 1 : 0, m.texto, m.fecha || now(), m.leido != null ? (m.leido ? 1 : 0) : m.de_mi ? 1 : 0, m.ack || 0, m.tipo || null, m.wa_ser || null, m.media_mime || null, m.media_nombre || null, m.media_tam || null, m.media_archivo || null, m.media_estado || null]);
      if (m.wa_ser && m.wa_id) db.run('UPDATE mensajes SET wa_ser = ? WHERE wa_id = ? AND wa_ser IS NULL', [m.wa_ser, m.wa_id]);
      if (m.media_mime && m.wa_id) db.run('UPDATE mensajes SET media_mime = COALESCE(media_mime, ?), media_nombre = COALESCE(media_nombre, ?), media_tam = COALESCE(media_tam, ?), media_estado = COALESCE(media_estado, ?), texto = CASE WHEN media_mime IS NULL THEN ? ELSE texto END WHERE wa_id = ?', [m.media_mime, m.media_nombre || null, m.media_tam || null, m.media_estado || 'pendiente', m.texto, m.wa_id]);
      save();
      return m.wa_id ? get('SELECT id FROM mensajes WHERE wa_id = ?', [m.wa_id])?.id : null;
    },
    mensajeMedia: (id) => get('SELECT * FROM mensajes WHERE id = ?', [id]),
    marcarMedia: (id, estado, archivo) => run('UPDATE mensajes SET media_estado = ?, media_archivo = COALESCE(?, media_archivo) WHERE id = ?', [estado, archivo || null, id]),
    mediaAntigua: (iso) => all("SELECT id, media_archivo FROM mensajes WHERE media_archivo IS NOT NULL AND fecha < ?", [iso]),
    masAntiguo: (tel) => get('SELECT MIN(fecha) AS f FROM mensajes WHERE telefono = ?', [tel]).f,
    guardarNombreWa: (tel, nombre) => { if (nombre) run('INSERT OR REPLACE INTO nombres_wa (telefono, nombre) VALUES (?, ?)', [tel, nombre]); },
    actualizarAck: (wa_id, ack) => run('UPDATE mensajes SET ack = ? WHERE wa_id = ?', [ack, wa_id]),
    chats: ({ q = '', sinLeer = false } = {}) => all(`
      SELECT m.telefono, CASE WHEN IFNULL(m.texto, '') <> '' THEN m.texto WHEN m.tipo IN ('image') THEN '📷 Imagen' WHEN m.tipo = 'sticker' THEN 'Sticker' WHEN m.tipo IN ('ptt', 'audio') THEN '🎤 Audio' WHEN m.tipo = 'video' THEN '🎥 Video' WHEN m.tipo = 'document' THEN '📄 ' || IFNULL(m.media_nombre, 'Documento') ELSE '' END AS ultimo, m.fecha, m.de_mi,
        (SELECT COUNT(*) FROM mensajes u WHERE u.telefono = m.telefono AND u.leido = 0) AS noLeidos,
        COALESCE(NULLIF(c.nombre, ''), w.nombre) AS nombre, c.apellido, c.etapa
      FROM mensajes m LEFT JOIN contactos c ON c.telefono = m.telefono LEFT JOIN nombres_wa w ON w.telefono = m.telefono
      WHERE m.id = (SELECT id FROM mensajes x WHERE x.telefono = m.telefono ORDER BY x.fecha DESC, x.id DESC LIMIT 1)
      ${q ? "AND (LOWER(IFNULL(c.nombre, IFNULL(w.nombre,'')) || ' ' || IFNULL(c.apellido,'')) LIKE ? OR m.telefono LIKE ?)" : ''}
      ${sinLeer ? 'AND (SELECT COUNT(*) FROM mensajes u WHERE u.telefono = m.telefono AND u.leido = 0) > 0' : ''}
      ORDER BY m.fecha DESC LIMIT 300`, q ? ['%' + q.toLowerCase() + '%', '%' + q.replace(/\D/g, '') + '%'] : []),
    lidDeTel: (tel) => (get('SELECT lid FROM lids WHERE telefono = ? LIMIT 1', [tel]) || {}).lid || null,
    telDeLid: (lid) => (get('SELECT telefono FROM lids WHERE lid = ?', [lid]) || {}).telefono || null,
    // Aprende que un código interno de WhatsApp corresponde a un número y junta lo que estaba guardado con el código
    fusionarLid: (lid, tel) => {
      db.run('INSERT OR REPLACE INTO lids (lid, telefono) VALUES (?, ?)', [lid, tel]);
      db.run('UPDATE mensajes SET telefono = ? WHERE telefono = ?', [tel, lid]);
      const n = get('SELECT nombre FROM nombres_wa WHERE telefono = ?', [lid]);
      if (n) { db.run('INSERT OR IGNORE INTO nombres_wa (telefono, nombre) VALUES (?, ?)', [tel, n.nombre]); db.run('DELETE FROM nombres_wa WHERE telefono = ?', [lid]); }
      if (get('SELECT 1 AS x FROM contactos WHERE telefono = ?', [lid])) {
        if (get('SELECT 1 AS x FROM contactos WHERE telefono = ?', [tel])) db.run('DELETE FROM contactos WHERE telefono = ?', [lid]);
        else db.run('UPDATE contactos SET telefono = ? WHERE telefono = ?', [tel, lid]);
      }
      db.run('UPDATE envios SET telefono = ? WHERE telefono = ?', [tel, lid]);
      save();
    },
    // Limpia contactos creados por error con el código interno en vez del número
    // Quita mensajes propios repetidos (mismo chat, mismo texto, con segundos de diferencia)
    // Solo revisa los últimos 2 días y mensajes con texto (dos fotos seguidas o un "ok" repetido no son duplicados si tienen distinto id de WhatsApp)
    limpiarDuplicados: () => { const d = new Date(Date.now() - 2 * 86400000).toISOString(); run(`DELETE FROM mensajes WHERE de_mi = 1 AND fecha >= ? AND id IN (
      SELECT b.id FROM mensajes a JOIN mensajes b ON a.telefono = b.telefono AND a.de_mi = 1 AND b.de_mi = 1 AND a.texto = b.texto AND a.id < b.id
      AND a.texto <> '' AND (a.wa_id IS NULL OR b.wa_id IS NULL OR a.wa_id = b.wa_id) AND a.fecha >= ? AND b.fecha >= ?
      AND ABS(strftime('%s', a.fecha) - strftime('%s', b.fecha)) <= 20)`, [d, d, d]); },
    limpiarContactosLid: () => run("DELETE FROM contactos WHERE LENGTH(telefono) >= 14 AND telefono NOT IN (SELECT telefono FROM envios)"),
    // ---------- leads de Meta
    leadMetaExiste: (id) => !!get('SELECT 1 AS x FROM leads_meta WHERE id = ?', [id]),
    guardarLeadMeta: (l) => run('INSERT OR IGNORE INTO leads_meta (id, form_id, form_nombre, telefono, nombre, creado, recibido, campos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [l.id, l.form_id, l.form_nombre, l.telefono, l.nombre, l.creado, now(), JSON.stringify(l.campos || {})]),
    leadsMeta: ({ form = '', estado = '', limite = 300 } = {}) => {
      const w = [], p = [];
      if (form) { w.push('l.form_id = ?'); p.push(form); }
      if (estado === 'hoy') { w.push('l.creado >= ?'); p.push(hoy0()); }
      const rows = all(`SELECT l.*, c.edad, c.renta, c.cargas, c.isapre, c.etapa,
          (SELECT fecha FROM envios e WHERE e.telefono = l.telefono AND e.estado = 'enviado' AND e.tipo <> 'fuera_horario' AND e.fecha >= l.recibido ORDER BY fecha LIMIT 1) AS enviado,
          (SELECT fecha FROM envios e WHERE e.telefono = l.telefono AND e.estado = 'enviado' AND e.tipo <> 'fuera_horario' AND e.fecha < l.recibido LIMIT 1) AS previo,
          (SELECT 1 FROM cola q WHERE q.telefono = l.telefono AND q.estado = 'pendiente' LIMIT 1) AS enCola,
          (SELECT detalle FROM cola q WHERE q.telefono = l.telefono AND q.tipo = 'meta' AND q.estado IN ('omitido','error') ORDER BY id DESC LIMIT 1) AS fallo
        FROM leads_meta l LEFT JOIN contactos c ON c.telefono = l.telefono ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.creado DESC LIMIT ${parseInt(limite) || 300}`, p);
      const r = rows.map((x) => ({ ...x, campos: JSON.parse(x.campos || '{}') }));
      if (estado === 'enviado') return r.filter((x) => x.enviado);
      if (estado === 'pendiente') return r.filter((x) => !x.enviado && x.enCola);
      if (estado === 'invalido') return r.filter((x) => !/^\d{8,13}$/.test(x.telefono || ''));
      return r;
    },
    leadsMetaDesde: (iso) => get('SELECT COUNT(*) AS n FROM leads_meta WHERE creado >= ?', [iso]).n,
    nombreWa: (tel) => (get('SELECT nombre FROM nombres_wa WHERE telefono = ?', [tel]) || {}).nombre || '',
    mensajes: (tel, limite = 400) => all('SELECT * FROM (SELECT * FROM mensajes WHERE telefono = ? ORDER BY fecha DESC, id DESC LIMIT ?) ORDER BY fecha ASC, id ASC', [tel, limite]),
    // ---------- recordatorios
    crearRecordatorio: (tel, fecha, texto, llamadaId = null) => { run('INSERT INTO recordatorios (telefono, fecha, texto, creado, llamada_id) VALUES (?, ?, ?, ?, ?)', [tel, fecha, texto, now(), llamadaId]); return lastId(); },
    // Próxima acción de cada lead: el recordatorio pendiente más cercano (las llamadas también crean uno)
    proximasAcciones: () => { const m = {}; for (const r of all('SELECT telefono, fecha, texto, llamada_id FROM recordatorios WHERE hecho = 0 ORDER BY fecha ASC')) if (!m[r.telefono]) m[r.telefono] = r; return m; },
    recordatoriosHasta: (iso) => all(`SELECT r.*, COALESCE(NULLIF(c.nombre, ''), w.nombre) AS nombre, c.apellido FROM recordatorios r LEFT JOIN contactos c ON c.telefono = r.telefono LEFT JOIN nombres_wa w ON w.telefono = r.telefono WHERE r.hecho = 0 AND r.fecha <= ? ORDER BY r.fecha ASC LIMIT 50`, [iso]),
    contarRecordatoriosHasta: (iso) => get('SELECT COUNT(*) AS n FROM recordatorios WHERE hecho = 0 AND fecha <= ?', [iso]).n,
    recordatoriosPendientes: () => all(`SELECT r.*, COALESCE(NULLIF(c.nombre, ''), w.nombre) AS nombre, c.apellido, c.etapa FROM recordatorios r LEFT JOIN contactos c ON c.telefono = r.telefono LEFT JOIN nombres_wa w ON w.telefono = r.telefono WHERE r.hecho = 0 ORDER BY r.fecha ASC LIMIT 200`),
    recordatoriosDe: (tel) => all('SELECT * FROM recordatorios WHERE telefono = ? AND hecho = 0 ORDER BY fecha ASC', [tel]),
    recordatoriosVencidos: (iso) => all('SELECT * FROM recordatorios WHERE hecho = 0 AND avisado = 0 AND fecha <= ?', [iso]),
    recordatorioAvisado: (id) => run('UPDATE recordatorios SET avisado = 1 WHERE id = ?', [id]),
    recordatorioListo: (id) => run('UPDATE recordatorios SET hecho = 1 WHERE id = ?', [id]),
    borrarRecordatorio: (id) => run('DELETE FROM recordatorios WHERE id = ?', [id]),
    contarMensajes: (tel) => get('SELECT COUNT(*) AS n FROM mensajes WHERE telefono = ?', [tel]).n,
    marcarLeido: (tel) => run('UPDATE mensajes SET leido = 1 WHERE telefono = ? AND leido = 0', [tel]),
    chatsSinResponder: () => all(`
      SELECT m.telefono, m.texto, m.fecha, COALESCE(NULLIF(c.nombre, ''), w.nombre) AS nombre, c.apellido FROM mensajes m LEFT JOIN contactos c ON c.telefono = m.telefono LEFT JOIN nombres_wa w ON w.telefono = m.telefono
      JOIN (SELECT telefono, MAX(fecha) AS f FROM mensajes WHERE fecha >= ? GROUP BY telefono) u ON u.telefono = m.telefono AND u.f = m.fecha
      WHERE m.de_mi = 0 AND m.fecha >= ? AND m.telefono NOT IN (SELECT telefono FROM bajas)
      GROUP BY m.telefono ORDER BY m.fecha ASC`, [new Date(Date.now() - 30 * 86400000).toISOString(), new Date(Date.now() - 30 * 86400000).toISOString()]),
    // ---------- cola de envío
    crearTanda: ({ nombre, usuario, tipo, programado = null, total, modo = 'despues' }) => { run('INSERT INTO tandas (nombre, usuario, creada, tipo, programado, total, modo) VALUES (?, ?, ?, ?, ?, ?, ?)', [nombre, usuario, now(), tipo, programado, total, modo === 'corriendo' ? 'corriendo' : 'despues']); return lastId(); },
    encolar: (items, tandaId = null) => {
      db.exec('BEGIN');
      const t = now();
      for (const it of items) db.run('INSERT INTO cola (telefono, texto, tipo, datos, creado, tanda) VALUES (?, ?, ?, ?, ?, ?)', [it.telefono, it.texto, it.tipo, JSON.stringify(it.datos || {}), t, tandaId]);
      if (tandaId) db.run('UPDATE cola SET orden = id WHERE tanda = ? AND orden IS NULL', [tandaId]);
      db.exec('COMMIT'); save();
    },
    // Mensajes sin grupo (agendados, leads de Meta, seguimientos y sueltos), en orden de prioridad
    siguienteAuto: () => { const r = get(`SELECT * FROM cola WHERE estado = 'pendiente' AND tanda IS NULL ORDER BY CASE tipo WHEN 'agendado' THEN 0 WHEN 'meta' THEN 1 WHEN 'seguimiento1' THEN 2 WHEN 'seguimiento2' THEN 2 ELSE 3 END, id LIMIT 1`); if (r) r.datos = JSON.parse(r.datos || '{}'); return r; },
    // El próximo de un grupo, en el orden que se le dio (arrastrando en la lista)
    siguienteDeTanda: (id) => { const r = get("SELECT * FROM cola WHERE estado = 'pendiente' AND tanda = ? ORDER BY COALESCE(orden, id), id LIMIT 1", [id]); if (r) r.datos = JSON.parse(r.datos || '{}'); return r; },
    // Grupos que pueden enviar ahora: sin pausa ni cancelar, con pendientes, y «Corriendo» o sin un grupo anterior que siga en la cola
    tandasQuePuedenEnviar: () => all(`SELECT t.id, t.nombre, t.modo FROM tandas t WHERE t.estado != 'cancelada' AND t.pausada = 0
      AND EXISTS (SELECT 1 FROM cola c WHERE c.tanda = t.id AND c.estado = 'pendiente')
      AND (t.modo = 'corriendo' OR NOT EXISTS (SELECT 1 FROM tandas t2 WHERE t2.id < t.id AND t2.estado != 'cancelada' AND EXISTS (SELECT 1 FROM cola c2 WHERE c2.tanda = t2.id AND c2.estado IN ('pendiente', 'enviando'))))
      ORDER BY t.id`),
    // El primer grupo anterior que hace esperar a un grupo «Después»
    bloqueadaPor: (id) => {
      const t = get('SELECT modo FROM tandas WHERE id = ?', [id]); if (!t || t.modo === 'corriendo') return null;
      return get("SELECT t2.id, t2.nombre FROM tandas t2 WHERE t2.id < ? AND t2.estado != 'cancelada' AND EXISTS (SELECT 1 FROM cola c2 WHERE c2.tanda = t2.id AND c2.estado IN ('pendiente', 'enviando')) ORDER BY t2.id LIMIT 1", [id]) || null;
    },
    // Nuevo orden de los pendientes de un grupo: primero los ids recibidos, después los demás como estaban
    ordenarTanda: (tandaId, ids) => {
      const pend = all("SELECT id FROM cola WHERE tanda = ? AND estado = 'pendiente' ORDER BY COALESCE(orden, id), id", [tandaId]).map((r) => r.id);
      const enGrupo = new Set(pend), vistos = new Set();
      const primero = (ids || []).map(Number).filter((x) => enGrupo.has(x) && !vistos.has(x) && vistos.add(x));
      const final = primero.concat(pend.filter((x) => !vistos.has(x)));
      db.exec('BEGIN');
      final.forEach((x, i) => db.run('UPDATE cola SET orden = ? WHERE id = ?', [i + 1, x]));
      db.exec('COMMIT'); save();
      return primero.length;
    },
    // Reserva el mensaje justo antes de enviarlo: si alguien lo sacó entre medio, devuelve false.
    // Se guarda al disco al tiro: si se corta la luz durante el envío, al reabrir no se reenvía.
    marcarEnviando: (id) => { db.run("UPDATE cola SET estado = 'enviando' WHERE id = ? AND estado = 'pendiente'", [id]); const n = db.getRowsModified(); if (n) { clearTimeout(timer); flush(); } return n > 0; },
    // «Sí, también» cuando el mensaje ya estaba saliendo: después de enviarlo no se inician los seguimientos
    marcarSinSeguimiento: (id) => run('UPDATE cola SET sin_seguimiento = 1 WHERE id = ?', [id]),
    sinSeguimiento: (id) => !!(get('SELECT sin_seguimiento FROM cola WHERE id = ?', [id]) || {}).sin_seguimiento,
    // ---------- tandas
    // Las de 2 contactos o más, con pendientes o creadas desde `desde`, de la más nueva a la más vieja
    tandas: ({ desde }) => all(`SELECT t.*, COALESCE(SUM(c.estado = 'enviado'), 0) AS enviados, COALESCE(SUM(c.estado IN ('pendiente', 'enviando')), 0) AS pendientes,
        COALESCE(SUM(c.estado IN ('omitido', 'sacado', 'cancelado')), 0) AS omitidos, COALESCE(SUM(c.estado = 'error'), 0) AS errores
      FROM tandas t LEFT JOIN cola c ON c.tanda = t.id WHERE t.total >= 2 GROUP BY t.id HAVING pendientes > 0 OR t.creada >= ? ORDER BY t.id DESC`, [desde]),
    tanda: (id) => get('SELECT * FROM tandas WHERE id = ?', [id]),
    // Lo necesario para los avisos de la confirmación (de a 500 teléfonos para no armar consultas enormes)
    datosParaAvisos: (tels) => {
      const m = new Map();
      for (let i = 0; i < tels.length; i += 500) {
        const parte = tels.slice(i, i + 500);
        for (const r of all(`SELECT c.telefono, c.etapa, c.ultimo_entrante, c.seq_estado,
            (SELECT MAX(e.fecha) FROM envios e WHERE e.telefono = c.telefono AND e.tipo IN ('masivo', 'programado') AND e.estado = 'enviado') AS ultimoMasivo
          FROM contactos c WHERE c.telefono IN (${parte.map(() => '?').join(',')})`, parte)) m.set(r.telefono, r);
      }
      return m;
    },
    itemsDeTanda: (id) => all(`SELECT q.id, q.telefono, q.estado, q.detalle, q.procesado, q.orden, c.nombre, c.apellido, c.ultimo_entrante
      FROM cola q LEFT JOIN contactos c ON c.telefono = q.telefono WHERE q.tanda = ? ORDER BY COALESCE(q.orden, q.id)`, [id]),
    sacarDeTanda: (itemId, usuario) => { db.run("UPDATE cola SET estado = 'sacado', detalle = ?, procesado = ? WHERE id = ? AND estado = 'pendiente'", ['Sacado por ' + usuario, now(), itemId]); const n = db.getRowsModified(); if (n) save(); return n ? 'sacado' : 'ya_salio'; },
    pausarTanda: (id, pausada) => run('UPDATE tandas SET pausada = ? WHERE id = ?', [pausada ? 1 : 0, id]),
    cancelarTanda: (id) => { db.run("UPDATE cola SET estado = 'cancelado', procesado = ? WHERE tanda = ? AND estado = 'pendiente'", [now(), id]); const n = db.getRowsModified(); run("UPDATE tandas SET estado = 'cancelada' WHERE id = ?", [id]); return n; },
    quitarDeProgramado: (programadoId, telefono) => {
      const p = get('SELECT destinatarios FROM programados WHERE id = ?', [programadoId]); if (!p) return 0;
      const quedan = JSON.parse(p.destinatarios || '[]').filter((c) => c.telefono !== telefono);
      run('UPDATE programados SET destinatarios = ? WHERE id = ?', [JSON.stringify(quedan), programadoId]);
      return quedan.length;
    },
    cerrarItem: (id, estado, detalle) => run('UPDATE cola SET estado = ?, detalle = ?, procesado = ? WHERE id = ?', [estado, detalle || null, now(), id]),
    pendientesCola: () => get("SELECT COUNT(*) AS n FROM cola WHERE estado = 'pendiente'").n,
    pendientesPorTipo: () => all("SELECT tipo, COUNT(*) AS n FROM cola WHERE estado = 'pendiente' GROUP BY tipo"),
    cancelarCola: (soloTipos) => run(`UPDATE cola SET estado = 'cancelado', procesado = ? WHERE estado = 'pendiente' ${soloTipos ? `AND tipo IN (${soloTipos.map((t) => `'${t}'`).join(',')})` : ''}`, [now()]),
    yaEnCola: (tel, tipo) => !!get("SELECT 1 AS x FROM cola WHERE telefono = ? AND tipo = ? AND estado = 'pendiente'", [tel, tipo]),
    // ---------- programados
    crearProgramado: (p) => { run('INSERT INTO programados (nombre, texto, destinatarios, fecha, secuencia, creado, extra) VALUES (?, ?, ?, ?, ?, ?, ?)', [p.nombre, p.texto, JSON.stringify(p.destinatarios), p.fecha, p.secuencia ? 1 : 0, now(), JSON.stringify(p.extra || {})]); return lastId(); },
    programados: () => all("SELECT id, nombre, texto, fecha, secuencia, estado, destinatarios, extra FROM programados WHERE estado = 'pendiente' ORDER BY fecha").map((r) => ({ ...r, destinatarios: undefined, extra: JSON.parse(r.extra || '{}'), total: JSON.parse(r.destinatarios || '[]').length })),
    programadosVencidos: () => all("SELECT * FROM programados WHERE estado = 'pendiente' AND fecha <= ?", [now()]).map((r) => ({ ...r, destinatarios: JSON.parse(r.destinatarios || '[]'), extra: JSON.parse(r.extra || '{}') })),
    // ---------- adjuntos (fotos y videos para envíos)
    guardarAdjunto: (a) => run('INSERT INTO adjuntos (id, nombre, mime, tam, archivo, creado) VALUES (?, ?, ?, ?, ?, ?)', [a.id, a.nombre, a.mime, a.tam, a.archivo, now()]),
    adjunto: (id) => get('SELECT * FROM adjuntos WHERE id = ?', [id]),
    // ---------- mensajes agendados (Automáticos)
    crearAgendado: (a) => { run('INSERT INTO agendados (texto, adjunto, destinatarios, fecha, creado, etiqueta, telefono) VALUES (?, ?, ?, ?, ?, ?, ?)', [a.texto, a.adjunto || null, JSON.stringify(a.destinatarios), a.fecha, now(), a.etiqueta || null, a.telefono || null]); return lastId(); },
    cancelarAgendadosDe: (tel, etiquetas) => run(`UPDATE agendados SET estado = 'cancelado', procesado = ? WHERE estado = 'pendiente' AND telefono = ? AND etiqueta IN (${etiquetas.map(() => '?').join(',')})`, [now(), tel, ...etiquetas]),
    agendadosHoy: () => { const f = new Date(); f.setHours(23, 59, 59, 999); return get("SELECT COUNT(*) AS n FROM agendados WHERE estado = 'pendiente' AND fecha <= ?", [f.toISOString()]).n; },
    // ---------- llamadas agendadas
    crearLlamada: (tel, fecha) => { run('INSERT INTO llamadas (telefono, fecha, creado) VALUES (?, ?, ?)', [tel, fecha, now()]); return lastId(); },
    llamada: (id) => get('SELECT * FROM llamadas WHERE id = ?', [id]),
    editarLlamada: (id, c) => { const k = Object.keys(c); run(`UPDATE llamadas SET ${k.map((x) => x + ' = ?').join(', ')} WHERE id = ?`, [...k.map((x) => c[x]), id]); },
    llamadasDe: (tel) => all("SELECT * FROM llamadas WHERE telefono = ? AND estado = 'pendiente' ORDER BY fecha", [tel]),
    llamadasEntre: (a, b) => all(`SELECT l.*, COALESCE(NULLIF(c.nombre, ''), w.nombre) AS nombre, c.apellido FROM llamadas l LEFT JOIN contactos c ON c.telefono = l.telefono LEFT JOIN nombres_wa w ON w.telefono = l.telefono WHERE l.estado = 'pendiente' AND l.fecha >= ? AND l.fecha < ? ORDER BY l.fecha`, [a, b]),
    editarAgendado: (id, a) => run('UPDATE agendados SET texto = ?, adjunto = ?, destinatarios = ?, fecha = ? WHERE id = ? AND estado = \'pendiente\'', [a.texto, a.adjunto || null, JSON.stringify(a.destinatarios), a.fecha, id]),
    agendados: () => all("SELECT * FROM agendados WHERE estado = 'pendiente' OR procesado >= ? ORDER BY CASE estado WHEN 'pendiente' THEN 0 ELSE 1 END, CASE estado WHEN 'pendiente' THEN fecha END ASC, procesado DESC LIMIT 200", [new Date(Date.now() - 14 * 86400000).toISOString()]).map((r) => ({ ...r, destinatarios: JSON.parse(r.destinatarios || '[]') })),
    agendadosVencidos: () => all("SELECT * FROM agendados WHERE estado = 'pendiente' AND fecha <= ?", [now()]).map((r) => ({ ...r, destinatarios: JSON.parse(r.destinatarios || '[]') })),
    estadoAgendado: (id, estado) => run('UPDATE agendados SET estado = ?, procesado = ? WHERE id = ?', [estado, now(), id]),
    cancelarAgendado: (id) => { const p = get("SELECT 1 AS x FROM agendados WHERE id = ? AND estado = 'pendiente'", [id]); if (p) run("UPDATE agendados SET estado = 'cancelado', procesado = ? WHERE id = ?", [now(), id]); return !!p; },
    editarProgramado: (id, c) => { if (c.texto != null) run('UPDATE programados SET texto = ? WHERE id = ?', [c.texto, id]); if (c.fecha) run('UPDATE programados SET fecha = ? WHERE id = ?', [c.fecha, id]); if (c.nombre != null) run('UPDATE programados SET nombre = ? WHERE id = ?', [c.nombre, id]); },
    estadoProgramado: (id, estado) => run('UPDATE programados SET estado = ? WHERE id = ?', [estado, id]),
    flush: () => { if (timer) { clearTimeout(timer); flush(); } }
  };

  // Migración desde la versión con archivos .json
  if (!api.getConfig('migrado_json', false)) {
    const load = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); } catch { return d; } };
    db.exec('BEGIN');
    for (const tel of load('bajas.json', [])) db.run('INSERT OR IGNORE INTO bajas (telefono, fecha) VALUES (?, ?)', [tel, now()]);
    for (const [tel, fecha] of Object.entries(load('enviados.json', {}))) db.run("INSERT INTO envios (telefono, texto, tipo, estado, fecha) VALUES (?, '', 'masivo', 'enviado', ?)", [tel, fecha]);
    db.exec('COMMIT');
    api.setConfig('migrado_json', true);
    for (const f of ['bajas.json', 'enviados.json']) { const p = path.join(dataDir, f); if (fs.existsSync(p)) try { fs.renameSync(p, p + '.migrado'); } catch {} }
    flush();
  }
  return api;
}

module.exports = { openDb, ETAPAS, DEFAULTS };
