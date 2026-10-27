const { app, BrowserWindow, WebContentsView, ipcMain, session, dialog, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const PKG = require('./package.json');
const path = require('path');
const fs = require('fs');
// Los datos siguen en la misma carpeta de siempre aunque el programa ahora se llame CRM HERMES:
// así se conservan la sesión de WhatsApp, contactos, chats y la conexión con Meta.
app.setPath('userData', path.join(app.getPath('appData'), 'Enviador WhatsApp'));
const NOMBRE = 'CRM HERMES';
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

const UNICA = app.requestSingleInstanceLock();
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

// ---------- Actualizaciones automáticas (GitHub Releases) ----------
const up = { estado: 'inactivo', version: null, progreso: null };
let autoUpdater = null;
function initUpdater() {
  const repo = String(PKG.updateRepo || '').trim();      // "usuario/repositorio"
  if (!app.isPackaged || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return;
  ({ autoUpdater } = require('electron-updater'));
  const [owner, name] = repo.split('/');
  autoUpdater.setFeedURL({ provider: 'github', owner, repo: name });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => { up.estado = 'buscando'; });
  autoUpdater.on('update-available', (i) => { up.estado = 'descargando'; up.version = i.version; });
  autoUpdater.on('update-not-available', () => { up.estado = 'aldia'; });
  autoUpdater.on('download-progress', (p) => { up.progreso = Math.round(p.percent); });
  autoUpdater.on('update-downloaded', (i) => {
    up.estado = 'lista'; up.version = i.version; up.progreso = null;
    notify('Actualización lista', `CRM HERMES ${i.version} está lista. Ábrelo y toca "Actualizar ahora".`);
  });
  autoUpdater.on('error', () => { up.estado = 'error'; });
  up.estado = 'buscando';
  const buscar = () => autoUpdater.checkForUpdates().catch(() => { up.estado = 'error'; });
  setTimeout(buscar, 20000);
  setInterval(buscar, 4 * 3600000);
}
const updater = {
  estado: () => ({ ...up }),
  buscar: () => { if (autoUpdater) autoUpdater.checkForUpdates().catch(() => { up.estado = 'error'; }); },
  // Instalación silenciosa: sin ventanas del instalador, y el programa vuelve a abrir solo
  instalar: () => { if (autoUpdater && up.estado === 'lista') { quitting = true; setImmediate(() => autoUpdater.quitAndInstall(true, true)); } }
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

  srv = await require('./server').start({ dataDir, browserPaths, version: app.getVersion(), notify, updater, embebido });

  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 1000, minHeight: 640, show: !startHidden,
    title: NOMBRE, autoHideMenuBar: true, backgroundColor: '#FBF7F0',
    // Barra superior verde: la dibuja la página (public/index.html) y Windows pone sus botones encima
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#2F4A3C', symbolColor: '#F6ECDA', height: 36 },
    icon: ICONO, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  const titulo = `${NOMBRE} · versión ${app.getVersion()}`;
  win.setTitle(titulo);
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle(titulo); });
  win.loadURL(`http://127.0.0.1:${srv.port}`);
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
