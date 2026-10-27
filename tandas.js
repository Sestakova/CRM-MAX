// Tandas de envío: lo que no depende de WhatsApp (unir destinatarios, avisos, nombres y estado)

// Destinatarios a mano + segmento, sin repetidos (gana el escrito a mano) y sin los excluidos. No guarda nada.
function unirDestinatarios({ destinatarios = [], segmento = null, excluir = [] }, { normPhone, buscarContactos }) {
  const fuera = new Set(excluir.map(normPhone).filter(Boolean));
  const mapa = new Map(); let invalidos = 0;
  for (const c of destinatarios) {
    const tel = normPhone(c.telefono); if (!tel) { invalidos++; continue; }
    if (!mapa.has(tel)) mapa.set(tel, { ...c, telefono: tel });
  }
  if (segmento) for (const c of buscarContactos({ ...segmento, sinBajas: true })) if (!mapa.has(c.telefono)) mapa.set(c.telefono, { telefono: c.telefono, nombre: c.nombre });
  return { lista: [...mapa.values()].filter((c) => !fuera.has(c.telefono)), invalidos };
}

const medianoche = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const DIAS_MASIVO = 7;

// Avisos para revisar a alguien antes de enviarle. Los que tienen desmarcar: true vienen sin marcar.
function avisosDe(d, ahora = new Date()) {
  if (!d) return [];
  const a = [];
  if (d.etapa === 'Ingresado') a.push({ clave: 'cliente', texto: 'Ya es cliente', desmarcar: true });
  if (d.ultimo_entrante && new Date(d.ultimo_entrante) >= medianoche(ahora)) a.push({ clave: 'escribio', texto: 'Escribió hoy', desmarcar: true });
  if (d.ultimoMasivo) {
    const dias = Math.round((medianoche(ahora) - medianoche(d.ultimoMasivo)) / 86400000);
    if (dias <= DIAS_MASIVO) a.push({ clave: 'masivo', texto: dias === 0 ? 'Recibió un masivo hoy' : `Recibió un masivo hace ${dias} día${dias === 1 ? '' : 's'}`, desmarcar: false });
  }
  if (d.seq_estado === 'activa') a.push({ clave: 'seguimiento', texto: 'En seguimiento automático', desmarcar: false });
  if (d.etapa === 'Perdido') a.push({ clave: 'perdido', texto: 'Perdido', desmarcar: false });
  return a;
}

function nombrePorDefecto(texto, fecha = new Date()) {
  const t = String(texto || '').trim();
  const corto = t.length > 40 ? t.slice(0, 40).trimEnd() + '…' : t;
  const dia = fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
  return (corto || 'Envío') + ' · ' + dia;
}

// «Escribió hace 5 min» si la persona escribió después de lanzada la tanda
function escribioHace(ultimoEntrante, creada, ahora = new Date()) {
  if (!ultimoEntrante || new Date(ultimoEntrante) < new Date(creada)) return null;
  const min = Math.max(0, Math.floor((ahora - new Date(ultimoEntrante)) / 60000));
  return min < 60 ? `Escribió hace ${min} min` : `Escribió hace ${Math.floor(min / 60)} h`;
}

function estadoTanda({ estado, pausada, pendientes }) {
  if (estado === 'cancelada') return 'Cancelada';
  if (!pendientes) return 'Terminada';
  return pausada ? 'En pausa' : 'Enviando';
}

module.exports = { unirDestinatarios, avisosDe, nombrePorDefecto, escribioHace, estadoTanda };
