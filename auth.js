// Acceso con un solo PIN de 4 números para todo el equipo
const crypto = require('crypto');

module.exports = function auth({ db, log }) {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'asesor',
    pin TEXT NOT NULL, activo INTEGER DEFAULT 1, creado TEXT, ultimo_acceso TEXT)`);

  const now = () => new Date().toISOString();
  const hash = (pin, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
  const verificar = (pin, guardado) => {
    const [salt, h] = String(guardado || '').split(':'); if (!salt || !h) return false;
    const x = crypto.scryptSync(String(pin), salt, 32);
    return crypto.timingSafeEqual(x, Buffer.from(h, 'hex'));
  };
  const pinValido = (p) => /^\d{4}$/.test(String(p || ''));
  const codigoRecuperacion = () => {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = '';
    for (const b of crypto.randomBytes(12)) s += a[b % a.length];
    return s.match(/.{4}/g).join('-');
  };

  // Un único acceso: si venía de la versión con varios usuarios, queda solo el primer administrador
  const principal = () => db.get("SELECT * FROM usuarios WHERE rol = 'admin' AND activo = 1 ORDER BY id LIMIT 1");
  try { const p = principal(); if (p) db.run('UPDATE usuarios SET activo = 0 WHERE id <> ? AND activo = 1', [p.id]); } catch (e) { log('auth: ' + e.message); }
  const configurado = () => !!principal();
  const registrar = () => {};   // sin registro de actividad

  // Sesiones en memoria: al cerrar el programa se vuelve a pedir el PIN
  const sesiones = new Map();
  const intentos = new Map();
  const COOKIE = 'crm_s';
  const leerCookie = (req) => { const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})').exec(req.headers.cookie || ''); return m ? m[1] : null; };
  function sesionDe(req) {
    const t = leerCookie(req); if (!t) return null;
    const s = sesiones.get(t); if (!s) return null;
    if (Date.now() - s.creada > 12 * 3600000) { sesiones.delete(t); return null; }
    const u = principal(); if (!u) { sesiones.delete(t); return null; }
    return { token: t, usuario: u };
  }
  function abrirSesion(res, u) {
    const t = crypto.randomBytes(32).toString('hex');
    sesiones.set(t, { creada: Date.now() });
    res.setHeader('Set-Cookie', `${COOKIE}=${t}; HttpOnly; SameSite=Strict; Path=/`);
    db.run('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?', [now(), u.id]);
  }
  const esperar = (k) => { const it = intentos.get(k); return it && it.hasta > Date.now() ? Math.ceil((it.hasta - Date.now()) / 1000) : 0; };
  function fallo(k, base = 30) {
    const it = intentos.get(k) || { n: 0, hasta: 0 }; it.n++;
    if (it.n >= 5) it.hasta = Date.now() + Math.min(300, base * 2 ** (it.n - 5)) * 1000;
    intentos.set(k, it);
  }

  function requerir(req, res, next) {
    const ruta = req.path.toLowerCase();
    if (!ruta.startsWith('/api/') || ruta.startsWith('/api/auth/')) return next();
    if (req.method === 'GET' && ruta === '/api/fondo') return next();
    const s = sesionDe(req);
    if (!s) return res.status(401).json({ error: 'Bloqueado', bloqueado: true });
    req.usuario = s.usuario; req.esAdmin = true;
    next();
  }
  const soloAdmin = (req, res, next) => next();
  const puede = () => (req, res, next) => next();

  function rutas(app) {
    const ok = (res, v = {}) => res.json({ ok: true, ...v });
    const fail = (res, msg, code = 400) => res.status(code).json({ error: msg });

    app.get('/api/auth/estado', (req, res) => {
      const s = sesionDe(req);
      res.json({ configurado: configurado(), sesion: s ? { nombre: s.usuario.nombre } : null, apariencia: db.getConfig('apariencia') });
    });

    app.post('/api/auth/configurar', (req, res) => {
      if (configurado()) return fail(res, 'El PIN ya está creado');
      if (!pinValido(req.body.pin)) return fail(res, 'El PIN debe tener 4 números');
      db.run('INSERT INTO usuarios (nombre, rol, pin, creado) VALUES (?, ?, ?, ?)', ['CRM MAX', 'admin', hash(req.body.pin), now()]);
      const codigo = codigoRecuperacion(); db.setConfig('recuperacion', hash(codigo));
      abrirSesion(res, principal());
      ok(res, { codigo });
    });

    app.post('/api/auth/ingresar', (req, res) => {
      const u = principal(); if (!u) return fail(res, 'Primero crea tu PIN');
      const w = esperar('pin'); if (w) return fail(res, `Demasiados intentos. Espera ${w} segundos.`, 429);
      if (!pinValido(req.body.pin) || !verificar(req.body.pin, u.pin)) { fallo('pin'); return fail(res, 'PIN incorrecto', 401); }
      intentos.delete('pin');
      abrirSesion(res, u);
      ok(res);
    });

    app.post('/api/auth/bloquear', (req, res) => {
      const s = sesionDe(req); if (s) sesiones.delete(s.token);
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      ok(res);
    });

    // PIN olvidado: con el código de recuperación
    app.post('/api/auth/recuperar', (req, res) => {
      const codigo = String(req.body.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-');
      const w = esperar('rec'); if (w) return fail(res, `Demasiados intentos. Espera ${w} segundos.`, 429);
      if (!verificar(codigo, db.getConfig('recuperacion', ''))) { fallo('rec', 120); return fail(res, 'Código de recuperación incorrecto', 401); }
      const u = principal(); if (!u) return fail(res, 'Primero crea tu PIN');
      if (!pinValido(req.body.pin)) return fail(res, 'El PIN debe tener 4 números');
      db.run('UPDATE usuarios SET pin = ? WHERE id = ?', [hash(req.body.pin), u.id]);
      const nuevo = codigoRecuperacion(); db.setConfig('recuperacion', hash(nuevo));
      intentos.delete('rec'); intentos.delete('pin');
      abrirSesion(res, u);
      ok(res, { codigo: nuevo });
    });

    // Configuración → Seguridad
    app.post('/api/seguridad/pin', (req, res) => {
      const w = esperar('pin'); if (w) return fail(res, `Demasiados intentos. Espera ${w} segundos.`, 429);
      if (!verificar(req.body.actual, req.usuario.pin)) { fallo('pin'); return fail(res, 'El PIN actual no es correcto'); }
      if (!pinValido(req.body.nuevo)) return fail(res, 'El PIN nuevo debe tener 4 números');
      db.run('UPDATE usuarios SET pin = ? WHERE id = ?', [hash(req.body.nuevo), req.usuario.id]);
      ok(res);
    });
    app.post('/api/seguridad/recuperacion', (req, res) => {
      const w = esperar('pin'); if (w) return fail(res, `Demasiados intentos. Espera ${w} segundos.`, 429);
      if (!verificar(req.body.pin, req.usuario.pin)) { fallo('pin'); return fail(res, 'El PIN no es correcto'); }
      const c = codigoRecuperacion(); db.setConfig('recuperacion', hash(c)); ok(res, { codigo: c });
    });
  }

  return { requerir, soloAdmin, puede, rutas, registrar };
};
