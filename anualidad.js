// Anualidad del cliente: empieza cuando el lead pasa a Ingresado y se renueva sola cada año (fechas AAAA-MM-DD locales)
const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d = new Date()) => { const x = d instanceof Date ? d : new Date(d); return `${x.getFullYear()}-${dos(x.getMonth() + 1)}-${dos(x.getDate())}`; };
const partes = (f) => String(f).slice(0, 10).split('-').map(Number);
const aDate = (f) => { const [y, m, d] = partes(f); return new Date(y, m - 1, d); };

// La misma fecha n años después (29-02 cae en 28-02 los años no bisiestos)
function masAnios(f, n) {
  const [y, m, d] = partes(f);
  const dias = new Date(y + n, m, 0).getDate();
  return `${y + n}-${dos(m)}-${dos(Math.min(d, dias))}`;
}
// El mismo día un mes antes (si ese mes es más corto, su último día)
function mesAntes(f) {
  const [y, m, d] = partes(f);
  const p = new Date(y, m - 2, 1), dias = new Date(p.getFullYear(), p.getMonth() + 1, 0).getDate();
  return `${p.getFullYear()}-${dos(p.getMonth() + 1)}-${dos(Math.min(d, dias))}`;
}

// Último aniversario que ya llegó (si la fecha de inicio es futura, se queda igual)
function vigente(desde, hoy = fechaLocal()) {
  let k = 0;
  while (masAnios(desde, k + 1) <= hoy) k++;
  return masAnios(desde, k);
}
function estado(desde, hoy = fechaLocal()) {
  const v = vigente(desde, hoy), aniversario = masAnios(v, 1), aviso = mesAntes(aniversario);
  const [ya, ma, da] = partes(aniversario), [yh, mh, dh] = partes(hoy);
  const mesesFaltan = Math.max(0, (ya * 12 + ma) - (yh * 12 + mh) - (da < dh ? 1 : 0));
  const total = aDate(aniversario) - aDate(v), pasado = aDate(hoy) - aDate(v);
  return { desde: v, aniversario, aviso, mesesFaltan, progreso: Math.max(0, Math.min(1, total ? pasado / total : 0)) };
}
// Al cambiar de etapa: la anualidad empieza solo la primera vez que entra a Ingresado (si ya tiene, no se reinicia ni se celebra)
function alCambiarEtapa(antes, despues) {
  const entra = despues && despues.etapa === 'Ingresado' && (!antes || antes.etapa !== 'Ingresado');
  return { iniciar: !!entra && !(antes && antes.anual_desde) };
}
const textoAviso = ({ nombre, isapre }) => `Aniversario de ${nombre}${isapre ? ` (${isapre})` : ''}: revisar su plan`;

module.exports = { fechaLocal, masAnios, vigente, estado, alCambiarEtapa, textoAviso };
