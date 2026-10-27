// Agendar llamada: qué se envía al cliente y cuándo avisa Windows, según lo que se marcó en esa llamada
// opciones: { confirmacion, recordatorio, minutos (número o 'dia_antes'), aviso, avisoMin }

const minutosValidos = (m) => (m === 'dia_antes' ? m : Math.max(1, parseInt(m) || 60));

// Lo que llega de la pantalla, en limpio
function limpiar(op = {}) {
  return {
    confirmacion: !!op.confirmacion,
    recordatorio: !!op.recordatorio,
    minutos: op.minutos === 'dia_antes' || /^\d+$/.test(String(op.minutos ?? '')) ? minutosValidos(op.minutos) : 60,
    aviso: !!op.aviso,
    avisoMin: Math.max(0, parseInt(op.avisoMin) || 0)
  };
}

// Las llamadas agendadas antes de la 4.1.0 no guardaron opciones: se usa la configuración
function desdeConfig(cfg = {}) {
  return {
    confirmacion: cfg.confirmacion?.on !== false,
    recordatorio: cfg.recordatorio?.on !== false,
    minutos: minutosValidos(cfg.recordatorio?.minutos ?? 60),
    aviso: cfg.aviso?.on !== false,
    avisoMin: Math.max(0, parseInt(cfg.avisoMin ?? 10) || 0)
  };
}

function plan(fecha, op, ahora = new Date()) {
  let recordatorio = null;
  if (op.recordatorio) {
    if (op.minutos === 'dia_antes') { recordatorio = new Date(fecha); recordatorio.setDate(recordatorio.getDate() - 1); recordatorio.setHours(18, 0, 0, 0); }
    else recordatorio = new Date(fecha.getTime() - minutosValidos(op.minutos) * 60000);
    if (recordatorio.getTime() <= ahora.getTime() + 5 * 60000) recordatorio = null;   // muy encima o ya pasó
  }
  const aviso = op.aviso ? new Date(fecha.getTime() - Math.max(0, parseInt(op.avisoMin) || 0) * 60000) : null;
  return { confirmacion: !!op.confirmacion, recordatorio, aviso };
}

module.exports = { plan, desdeConfig, limpiar };
