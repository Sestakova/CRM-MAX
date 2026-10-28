// Carpeta «Clientes CRM HERMES» en el escritorio: lo que se descarga desde un chat va a la subcarpeta de ese cliente
const path = require('path');

const RAIZ_NOMBRE = 'Clientes CRM HERMES';
const SIN_ASIGNAR = 'Sin asignar';
const PROHIBIDOS = /[<>:"/\\|?*\u0000-\u001f]/g;

const telBonito = (tel) => { const t = String(tel || ''); return /^569\d{8}$/.test(t) ? `+56 9 ${t.slice(3, 7)} ${t.slice(7)}` : '+' + t; };
const limpio = (s) => String(s || '').replace(PROHIBIDOS, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');

// «María Pérez (+56 9 1234 5678)»; sin contacto del CRM, «Sin asignar»
function nombreCarpeta(contacto, tel) {
  if (!contacto || !tel) return SIN_ASIGNAR;
  const nom = limpio([contacto.nombre, contacto.apellido].filter(Boolean).join(' ')).slice(0, 60);
  return nom ? `${nom} (${telBonito(tel)})` : telBonito(tel);
}
// Si ya existe una carpeta de ese teléfono (aunque el nombre cambió), se usa esa
function carpetaDe(tel, contacto, existentes = []) {
  if (!contacto || !tel) return SIN_ASIGNAR;
  const fin = `(${telBonito(tel)})`;
  return existentes.find((n) => n.endsWith(fin) || n === telBonito(tel)) || nombreCarpeta(contacto, tel);
}
// Ruta libre dentro de dir: «liq.pdf», «liq (2).pdf», «liq (3).pdf»…
function rutaLibre(dir, archivo, existe) {
  const base = limpio(path.basename(String(archivo || '').replace(/\\/g, '/'))) || 'documento';
  const ext = path.extname(base), raiz = base.slice(0, base.length - ext.length);
  let p = path.join(dir, base);
  for (let i = 2; existe(p); i++) p = path.join(dir, `${raiz} (${i})${ext}`);
  return p;
}
const desktopIni = () => '[.ShellClassInfo]\r\nIconResource=carpeta.ico,0\r\nInfoTip=Documentos de tus clientes guardados por CRM HERMES\r\n';
const dentroDe = (raiz, ruta) => { const r = path.relative(path.resolve(raiz), path.resolve(ruta)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

module.exports = { RAIZ_NOMBRE, SIN_ASIGNAR, telBonito, nombreCarpeta, carpetaDe, rutaLibre, desktopIni, dentroDe };
