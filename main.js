const { app, BrowserWindow, WebContentsView, ipcMain, session, dialog, shell, Tray, Menu, nativeImage, Notification, nativeTheme } = require('electron');
const TEMAS = require('./temas');
const DOCS = require('./documentos');
const PKG = require('./package.json');
const path = require('path');
const fs = require('fs');
// Los datos siguen en la misma carpeta de siempre aunque el programa ahora se llame CRM HERMES:
// así se conservan la sesión de WhatsApp, contactos, chats y la conexión con Meta.
app.setPath('userData', path.join(app.getPath('appData'), 'Enviador WhatsApp'));
const NOMBRE = 'CRM HERMES';
// Versión que corre: la liviana si arranque.js abrió una, si no la instalada
const VERSION = global.CRM_VERSION || app.getVersion();
// Versión liviana: si algo falla antes de que la pantalla confirme que abrió, arranque.js vuelve a la instalada.
// Se deja anotado el motivo en el registro técnico, y un rechazo suelto (p. ej. de WhatsApp mientras carga) ya no basta para volver atrás
if (global.CRM_VERSION) {
  const anotar = (tipo) => (e) => { try { fs.mkdirSync(path.join(app.getPath('userData'), 'datos'), { recursive: true }); fs.appendFileSync(path.join(app.getPath('userData'), 'datos', 'registro.txt'), `[${new Date().toISOString()}] ${tipo} en la versión ${global.CRM_VERSION}: ${e && (e.stack || e)}\n`); } catch {} };
  process.prependListener('uncaughtException', anotar('Error al arrancar'));
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', anotar('Aviso'));
}
// WhatsApp Web vive dentro del programa. La parte automática se conecta a esa misma vista (solo desde este PC).
app.commandLine.appendSwitch('remote-debugging-port', '0');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const ICONO = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Busca Edge o Chrome instalados (Edge viene en todo Windows 10/11)
function findBrowser() {
  const env = process.env;
  const c = [
    path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ];
  return [...new Set(c.filter((p) => { try { return fs.existsSync(p); } catch { return false; } }))];
}

const UNICA = typeof global.CRM_UNICA === 'boolean' ? global.CRM_UNICA : app.requestSingleInstanceLock();   // arranque.js ya lo pidió
if (!UNICA) { app.exit(0); }
// El puerto cambia cada vez que se abre: se borra el archivo viejo (solo la primera ventana, nunca una segunda apertura)
else { try { fs.unlinkSync(path.join(app.getPath('userData'), 'DevToolsActivePort')); } catch {} }
app.setAppUserModelId('cl.conectasalud.enviador');

// Preferencias simples del programa (fuera de la base de datos para leerlas antes de arrancar)
const PREF = path.join(app.getPath('userData'), 'preferencias.json');
const prefs = (() => { try { return JSON.parse(fs.readFileSync(PREF, 'utf8')); } catch { return {}; } })();
const savePrefs = () => { try { fs.writeFileSync(PREF, JSON.stringify(prefs, null, 2)); } catch {} };

function setAutoStart(on) {
  prefs.inicioConWindows = on; savePrefs();
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: ['--oculto'] });
}
// La primera vez queda activado el inicio con Windows
if (prefs.inicioConWindows === undefined) setAutoStart(true);
else if (app.isPackaged && !prefs.renombradoHermes) {
  // Cambió el nombre del programa: se quita el inicio automático con los nombres antiguos y se vuelve a poner con el nuevo
  for (const viejo of ['Enviador WhatsApp', 'CRM MAX']) { try { app.setLoginItemSettings({ openAtLogin: false, name: viejo }); } catch {} }
  setAutoStart(!!prefs.inicioConWindows);
  prefs.renombradoCrmMax = true; prefs.renombradoHermes = true; savePrefs();
}

const startHidden = process.argv.includes('--oculto');
let win, srv, tray, quitting = false, avisoBandeja = !!prefs.avisoBandeja;

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
app.on('second-instance', showWindow);

function buildTray() {
  const img = nativeImage.createFromPath(ICONO);
  tray = new Tray(img);
  tray.setToolTip(NOMBRE);
  const menu = () => Menu.buildFromTemplate([
    { label: 'Abrir ' + NOMBRE, click: showWindow },
    { type: 'separator' },
    { label: 'Iniciar con Windows', type: 'checkbox', checked: !!prefs.inicioConWindows,
      click: (item) => { setAutoStart(item.checked); tray.setContextMenu(menu()); } },
    { type: 'separator' },
    { label: 'Salir', click: () => requestQuit() }
  ]);
  tray.setContextMenu(menu());
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

function requestQuit() {
  if (srv && srv.busy()) {
    showWindow();
    const r = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['Seguir enviando', 'Salir igual'], defaultId: 0, cancelId: 0,
      title: 'Envío en curso', message: 'Hay un envío en curso. Si sales del programa, los mensajes que faltan no se enviarán.' });
    if (r === 0) return;
  }
  quitting = true;
  app.quit();
}

// ---------- Actualizaciones (GitHub Releases) ----------
// Casi siempre llega una «liviana» (solo pantallas y .js, pocos MB, se aplica al reiniciar en segundos).
// Si cambió Electron, una dependencia o un parche, se baja el instalador completo como antes.
const LIV = require('./liviana');
const up = { estado: 'inactivo', version: null, progreso: null, bajado: null, total: null, tipo: null };
let autoUpdater = null, baseLiviana = null;
const miHuella = (() => { try { return require('./huella.json').huella; } catch { return null; } })();
function initUpdater() {
  const repo = String(PKG.updateRepo || '').trim();      // "usuario/repositorio"
  // En desarrollo se puede probar con un servidor local: CRM_LIVIANA_URL=http://127.0.0.1:puerto/
  if (!app.isPackaged) baseLiviana = process.env.CRM_LIVIANA_URL || null;
  else if (/^[\w.-]+\/[\w.-]+$/.test(repo)) baseLiviana = `https://github.com/${repo}/releases/latest/download/`;
  if (!baseLiviana) return;
  if (app.isPackaged) {
    ({ autoUpdater } = require('electron-updater'));
    const [owner, name] = repo.split('/');
    autoUpdater.setFeedURL({ provider: 'github', owner, repo: name });
    autoUpdater.autoDownload = false;          // se decide aquí si conviene la liviana o el instalador completo
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('download-progress', (p) => { up.progreso = Math.round(p.percent); up.bajado = p.transferred; up.total = p.total; });
    autoUpdater.on('update-downloaded', (i) => {
      Object.assign(up, { estado: 'lista', version: i.version, progreso: 100, tipo: 'completa' });
      notify('Actualización lista', `CRM HERMES ${i.version} está lista. Toca «Reiniciar y actualizar».`);
    });
    autoUpdater.on('error', () => { if (up.tipo === 'completa' && up.estado === 'descargando') up.estado = 'error'; });
  }
  setTimeout(buscarActualizacion, 20000);
  setInterval(buscarActualizacion, 30 * 60000);
}
async function buscarActualizacion() {
  if (!baseLiviana || ['buscando', 'descargando', 'lista'].includes(up.estado)) return;
  up.estado = 'buscando';
  try {
    const liviana = await fetch(baseLiviana + 'liviana.json', { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let completa = null;
    if (autoUpdater) { const r = await autoUpdater.checkForUpdates().catch(() => null); if (r && r.updateInfo) completa = { version: r.updateInfo.version }; }
    const fallida = (() => { try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'liviana.json'), 'utf8')).fallida || null; } catch { return null; } })();
    const cual = LIV.elegirDescarga({ efectiva: VERSION, huella: miHuella, liviana, completa, fallida });
    if (cual === 'liviana') await bajarLiviana(liviana);
    else if (cual === 'completa') { Object.assign(up, { estado: 'descargando', version: completa.version, progreso: 0, bajado: 0, total: null, tipo: 'completa' }); autoUpdater.downloadUpdate().catch(() => { up.estado = 'error'; }); }
    else up.estado = 'aldia';
  } catch (e) { console.error('actualización:', e); up.estado = 'error'; }
}
// Baja el paquete mostrando el avance, revisa que llegó entero y lo deja listo para el próximo arranque
async function bajarLiviana(d) {
  Object.assign(up, { estado: 'descargando', version: d.version, progreso: 0, bajado: 0, total: d.tam || null, tipo: 'liviana' });
  const r = await fetch(baseLiviana + d.archivo, { signal: AbortSignal.timeout(10 * 60000) });
  if (!r.ok) throw new Error('No se pudo bajar la versión ' + d.version);
  up.total = Number(r.headers.get('content-length')) || d.tam || null;
  const partes = [], lector = r.body.getReader();
  for (;;) {
    const { done, value } = await lector.read(); if (done) break;
    partes.push(Buffer.from(value)); up.bajado += value.length;
    if (up.total) up.progreso = Math.min(99, Math.round((up.bajado / up.total) * 100));
  }
  const buf = Buffer.concat(partes);
  if (!LIV.verificar(buf, d.sha512)) throw new Error('El paquete de la versión ' + d.version + ' llegó dañado');
  LIV.aplicar(app.getPath('userData'), { version: d.version, huella: d.huella }, LIV.desempaquetar(buf), { conservar: global.CRM_VERSION || null });
  Object.assign(up, { estado: 'lista', progreso: 100 });
  notify('Actualización lista', `CRM HERMES ${d.version} está lista. Toca «Reiniciar y actualizar».`);
}
const updater = {
  estado: () => ({ ...up }),
  buscar: () => { if (up.estado === 'error' || up.estado === 'aldia') up.estado = 'inactivo'; buscarActualizacion(); },
  // Se cierra todo el programa (también la bandeja y WhatsApp) y vuelve a abrir solo con la versión nueva
  instalar: () => {
    if (up.estado !== 'lista') return;
    quitting = true;
    if (up.tipo === 'completa' && autoUpdater) setImmediate(() => autoUpdater.quitAndInstall(true, true));
    else { app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--oculto') }); app.quit(); }   // vuelve a abrir con la ventana a la vista
  }
};

// ---------- Avisos de Windows ----------
function notify(title, body, extra = {}) {
  if (!Notification.isSupported()) return;
  let sonido = true;
  try { sonido = srv && srv.avisos ? srv.avisos().sonido : true; } catch {}
  const n = new Notification({ title, body, silent: !sonido, icon: path.join(__dirname, 'build', 'icon.png') });
  n.on('click', () => {
    showWindow();
    if (extra.chat && win) win.webContents.executeJavaScript(`window.abrirChat && window.abrirChat(${JSON.stringify(String(extra.chat))})`).catch(() => {});
  });
  n.show();
}

app.whenReady().then(async () => {
  initUpdater();
  const browserPaths = findBrowser();   // si no hay ninguno, el programa descarga el suyo
  const dataDir = path.join(app.getPath('userData'), 'datos');

  // Vista de WhatsApp Web (sesión guardada aparte, dentro del programa)
  const waSes = session.fromPartition('persist:whatsapp');
  waSes.setUserAgent(UA_CHROME);
  waSes.setPermissionRequestHandler((wc, permiso, cb) => cb(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(permiso)));   // sin avisos duplicados de WhatsApp
  waSes.setPermissionCheckHandler((wc, permiso) => permiso !== 'notifications');
  const waView = new WebContentsView({ webPreferences: { partition: 'persist:whatsapp', backgroundThrottling: false, spellcheck: true } });
  waView.webContents.setUserAgent(UA_CHROME);
  waView.setVisible(false);
  waView.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  waView.webContents.on('will-navigate', (e, url) => { if (!/^https:\/\/web\.whatsapp\.com/.test(url) && !url.startsWith('about:')) { e.preventDefault(); shell.openExternal(url); } });
  waView.webContents.loadURL('https://web.whatsapp.com/');
  // Ctrl + K busca un contacto aunque estés escribiendo dentro de WhatsApp
  waView.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && (i.control || i.meta) && String(i.key).toLowerCase() === 'k' && win) { e.preventDefault(); win.webContents.focus(); win.webContents.executeJavaScript('window.abrirBuscar && window.abrirBuscar()').catch(() => {}); }
  });   // empieza a cargar al tiro, en paralelo con el resto
  let puertoDbg = null;
  const leerPuerto = async () => {
    const f = path.join(app.getPath('userData'), 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(f); i++) { if (puertoDbg) return puertoDbg; await new Promise((r) => setTimeout(r, 100)); }
    try { puertoDbg = fs.readFileSync(f, 'utf8').split(/\r?\n/)[0].trim() || puertoDbg; } catch {}
    return puertoDbg;
  };
  leerPuerto().catch(() => {});
  const embebido = { puerto: leerPuerto, recargar: () => waView.webContents.loadURL('about:blank#crmwa') };

  // Carpeta «Clientes CRM HERMES» del escritorio, con su ícono propio (se vuelve a crear si la borran)
  const raizDocs = () => path.join(app.getPath('desktop'), DOCS.RAIZ_NOMBRE);
  function prepararRaizDocs() {
    const raiz = raizDocs();
    if (fs.existsSync(path.join(raiz, 'desktop.ini'))) return raiz;
    fs.mkdirSync(raiz, { recursive: true });
    try {
      fs.copyFileSync(path.join(__dirname, 'build', 'carpeta.ico'), path.join(raiz, 'carpeta.ico'));
      fs.writeFileSync(path.join(raiz, 'desktop.ini'), DOCS.desktopIni());
      if (process.platform === 'win32') {
        const { execFile } = require('child_process');
        execFile('attrib', ['+h', '+s', path.join(raiz, 'desktop.ini')], () => {});
        execFile('attrib', ['+h', '+s', path.join(raiz, 'carpeta.ico')], () => {});
        execFile('attrib', ['+r', raiz], () => {});
      }
    } catch {}
    return raiz;
  }
  const docs = { raiz: raizDocs, descargas: () => app.getPath('downloads'), abrir: (p) => shell.openPath(p) };

  srv = await require('./server').start({ dataDir, browserPaths, version: VERSION, notify, updater, embebido, docs });

  // Lo que se descarga desde un chat de WhatsApp va a la carpeta de ese cliente (sin cliente del CRM: «Sin asignar»).
  // Se guarda primero aparte y al terminar se mueve, porque saber qué chat está abierto toma un momento
  const tmpDocs = path.join(app.getPath('userData'), 'descargas-en-curso');
  waSes.on('will-download', (e, item) => {
    try {
      fs.mkdirSync(tmpDocs, { recursive: true });
      const nombre = item.getFilename() || 'documento';
      const tmp = path.join(tmpDocs, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + path.extname(nombre));   // nombre único: dos descargas iguales no chocan
      item.setSavePath(tmp);
      const chat = srv.chatActivo();
      item.once('done', async (ev, estado) => {
        if (estado !== 'completed') { try { fs.unlinkSync(tmp); } catch {} return; }
        try {
          const a = await chat, raiz = prepararRaizDocs();
          const sub = DOCS.carpetaDe(a && a.telefono, a && a.contacto, fs.readdirSync(raiz));
          const dir = path.join(raiz, sub); fs.mkdirSync(dir, { recursive: true });
          const final = DOCS.rutaLibre(dir, nombre, fs.existsSync);
          try { fs.renameSync(tmp, final); } catch { fs.copyFileSync(tmp, final); fs.unlinkSync(tmp); }
          const c = a && a.contacto;
          srv.documentoGuardado({ ruta: final, archivo: path.basename(final), telefono: c ? a.telefono : null, cliente: c ? ([c.nombre, c.apellido].filter(Boolean).join(' ') || DOCS.telBonito(a.telefono)) : DOCS.SIN_ASIGNAR });
        } catch (err) { console.error('documento:', err); }
      });
    } catch (err) { console.error('descarga:', err); }
  });

  // Tema de color con que se abre: el último que usó la pantalla (así no hay destello claro de noche)
  const temaIni = TEMAS.BARRA[prefs.tema] ? prefs.tema : 'claro';
  nativeTheme.themeSource = temaIni === 'oscuro' ? 'dark' : 'light';
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 1000, minHeight: 640, show: !startHidden,
    title: NOMBRE, autoHideMenuBar: true, backgroundColor: TEMAS.FONDO[temaIni],
    // Barra superior del color del tema: la dibuja la página (public/index.html) y Windows pone sus botones encima
    titleBarStyle: 'hidden', titleBarOverlay: { ...TEMAS.BARRA[temaIni], height: 36 },
    icon: ICONO, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  const titulo = `${NOMBRE} · versión ${VERSION}`;
  win.setTitle(titulo);
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle(titulo); });
  win.loadURL(`http://127.0.0.1:${srv.port}`);
  // La pantalla avisa que abrió bien: si esta versión vino como actualización liviana, ya no hace falta volver a la instalada
  ipcMain.on('crm-sano', (e) => { if (e.sender !== win.webContents || global.CRM_SANO) return; global.CRM_SANO = true; require('./liviana').marcarOk(app.getPath('userData')); });
  win.contentView.addChildView(waView);
  // La pantalla del CRM dice dónde y cuándo mostrar WhatsApp (se oculta con el PIN, modales y otras secciones)
  ipcMain.on('wa-vista', (e, r) => {
    if (e.sender !== win.webContents) return;
    if (!r || !(r.width > 20 && r.height > 20)) { waView.setVisible(false); return; }
    const z = win.webContents.getZoomFactor() || 1;   // si se usa Ctrl + / Ctrl -, la vista sigue calzando
    waView.setBounds({ x: Math.round(r.x * z), y: Math.round(r.y * z), width: Math.round(r.width * z), height: Math.round(r.height * z) });
    waView.setVisible(true);
  });
  // Cotizador: miscotizadores en su propia vista y con su sesión guardada (incrustada en la página no podía iniciar sesión)
  const COTIZADOR = 'https://panel.miscotizadores.cl/dashboard';
  // El panel (miscotizadores.cl) y los cotizadores que publica (cotizaen.cl, p. ej. «Ver mi sitio») se abren ahí mismo
  const esCotizador = (u) => /^https:\/\/([a-z0-9-]+\.)*(miscotizadores|cotizaen)\.cl(\/|$)/i.test(u);
  session.fromPartition('persist:cotizador').setPermissionRequestHandler((wc, permiso, cb) => cb(['clipboard-read', 'clipboard-sanitized-write'].includes(permiso)));
  const cotView = new WebContentsView({ webPreferences: { partition: 'persist:cotizador', spellcheck: true } });
  cotView.setVisible(false);
  let cotCargado = false;
  cotView.webContents.setWindowOpenHandler(({ url }) => { if (esCotizador(url)) cotView.webContents.loadURL(url); else if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  cotView.webContents.on('will-navigate', (e, url) => { if (!esCotizador(url)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.contentView.addChildView(cotView);
  ipcMain.on('cot-vista', (e, r) => {
    if (e.sender !== win.webContents) return;
    if (!r || !(r.width > 20 && r.height > 20)) { cotView.setVisible(false); return; }
    if (!cotCargado) { cotCargado = true; cotView.webContents.loadURL(COTIZADOR); }   // se carga la primera vez que se abre la sección
    const z = win.webContents.getZoomFactor() || 1;
    cotView.setBounds({ x: Math.round(r.x * z), y: Math.round(r.y * z), width: Math.round(r.width * z), height: Math.round(r.height * z) });
    cotView.setVisible(true);
  });
  // La pantalla avisa el tema que se ve: barra de Windows, fondo y WhatsApp (modo oscuro si WhatsApp está en «predeterminado del sistema»)
  ipcMain.on('tema', (e, t) => {
    if (e.sender !== win.webContents || !TEMAS.BARRA[t]) return;
    try { win.setTitleBarOverlay({ ...TEMAS.BARRA[t], height: 36 }); } catch {}
    win.setBackgroundColor(TEMAS.FONDO[t]);
    nativeTheme.themeSource = t === 'oscuro' ? 'dark' : 'light';
    if (prefs.tema !== t) { prefs.tema = t; savePrefs(); }
  });
  ipcMain.on('cot-recargar', (e) => { if (e.sender === win.webContents) { cotCargado = true; cotView.webContents.loadURL(COTIZADOR); } });
  win.webContents.on('did-start-navigation', (e) => { if (e.isMainFrame) { waView.setVisible(false); cotView.setVisible(false); } });
  win.webContents.on('render-process-gone', () => { waView.setVisible(false); cotView.setVisible(false); });
  // Los enlaces externos se abren en el navegador normal (solo http/https: el Cotizador muestra una página de afuera)
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // La ventana del CRM nunca deja su página: si la página del Cotizador intenta reemplazarla, se abre en el navegador
  const propia = `http://127.0.0.1:${srv.port}`;
  win.webContents.on('will-navigate', (e, url) => {
    if (url === propia || url.startsWith(propia + '/')) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  // Cerrar la ventana no cierra el programa: queda junto al reloj
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!avisoBandeja && Notification.isSupported()) {
      new Notification({ title: NOMBRE + ' sigue funcionando', body: 'Quedó junto al reloj de Windows. Para cerrarlo del todo: clic derecho en su ícono → Salir.' }).show();
      avisoBandeja = true; prefs.avisoBandeja = true; savePrefs();
    }
  });
  buildTray();
});

let cleaned = false;
app.on('before-quit', async (e) => {
  quitting = true;
  if (cleaned || !srv) return;
  e.preventDefault();
  cleaned = true;
  try { await srv.destroy(); } catch {}
  app.quit();
});
app.on('window-all-closed', () => { /* se mantiene en la bandeja */ });
