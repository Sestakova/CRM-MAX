// UF fija del día 5 de cada mes (rige hasta el 5 del mes siguiente) y el 7% de salud con tope imponible
const dos = (n) => String(n).padStart(2, '0');

// Fecha (AAAA-MM-DD) de la UF que rige ahora: el 5 de este mes, o el del mes anterior si aún no llega el 5
function fechaUFVigente(ahora = new Date()) {
  const d = new Date(ahora.getFullYear(), ahora.getMonth() - (ahora.getDate() < 5 ? 1 : 0), 5);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-05`;
}
const urlUF = (fecha) => { const [a, m, d] = fecha.split('-'); return `https://mindicador.cl/api/uf/${d}-${m}-${a}`; };
const necesitaUF = (guardada, ahora = new Date()) => !guardada || String(guardada.fecha || '').slice(0, 10) !== fechaUFVigente(ahora);

// Renta en pesos (acepta «1.500.000» o «$1500000»), sin decimales
function rentaNum(v) {
  if (typeof v === 'number') return v;
  const n = parseInt(String(v || '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
// 7% de la renta imponible; si la renta pasa el tope (en UF), se calcula sobre el tope
function siete(renta, ufValor, topeUF = 90) {
  const r = rentaNum(renta);
  if (!(r > 0) || !(ufValor > 0)) return null;
  const tope = (topeUF > 0 ? topeUF : 90) * ufValor;
  const base = Math.min(r, tope);
  const pesos = Math.round(base * 0.07);
  return { pesos, uf: Math.round((pesos / ufValor) * 100) / 100, conTope: r > tope };
}

// Tope imponible permitido en Configuración: entre 1 y 500 UF (si viene algo raro, 90)
const topeValido = (x) => { const n = parseFloat(String(x).replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.min(500, Math.max(1, Math.round(n * 10) / 10)) : 90; };

module.exports = { topeValido, fechaUFVigente, urlUF, necesitaUF, siete };
