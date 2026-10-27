// Conexión con los formularios de Meta (Facebook e Instagram Lead Ads)
// El programa revisa cada pocos minutos si hay leads nuevos y los agrega como contactos.
const GRAPH = 'https://graph.facebook.com/v25.0';

const CAMPOS = ['nombre', 'apellido', 'nombre_completo', 'telefono', 'edad', 'renta', 'cargas', 'isapre'];
function adivinar(key, label) {
  const t = (String(key) + ' ' + String(label || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/phone|telefono|celular|whatsapp|fono/.test(t)) return 'telefono';
  if (/carga/.test(t)) return 'cargas';
  if (/isapre|prevision|fonasa/.test(t)) return 'isapre';
  if (/sueldo|renta|ingreso|salario/.test(t)) return 'renta';
  if (/edad|age/.test(t)) return 'edad';
  if (/full_name|nombre_completo|nombre y apellido/.test(t)) return 'nombre_completo';
  if (/last_name|apellido/.test(t)) return 'apellido';
  if (/first_name|nombre|name/.test(t)) return 'nombre';
  return '';
}

module.exports = function meta({ db, log, notify, normPhone, encolar, evento, sleep }) {
  const cfg = () => db.getConfig('meta', { conectado: false, forms: [], intervaloMin: 5, autoMensaje: true });
  const guardar = (c) => db.setConfig('meta', c);
  const estado = { revisando: false, ultimoError: null };

  async function graph(path, params = {}, token) {
    const u = new URL(path.startsWith('http') ? path : GRAPH + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    if (token) u.searchParams.set('access_token', token);
    const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const e = j.error || {};
      const msg = e.code === 190 ? 'El código de acceso venció o no es válido. Vuelve a conectar Meta.'
        : e.code === 200 || e.code === 10 ? 'Falta un permiso en la app de Meta (leads_retrieval, pages_manage_ads, pages_show_list o pages_read_engagement).'
        : e.message || 'Error ' + r.status;
      const err = new Error(msg); err.code = e.code; throw err;
    }
    return j;
  }

  // Paso 1: con App ID, App Secret y el código temporal del Explorador, se obtiene uno permanente de la página
  async function conectar({ appId, appSecret, userToken }) {
    if (!appId || !appSecret || !userToken) throw new Error('Completa los tres datos');
    const largo = await graph('/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: String(appId).trim(), client_secret: String(appSecret).trim(), fb_exchange_token: String(userToken).trim() });
    const paginas = await graph('/me/accounts', { fields: 'id,name,access_token', limit: '100' }, largo.access_token);
    const lista = (paginas.data || []).map((p) => ({ id: p.id, nombre: p.name, token: p.access_token }));
    if (!lista.length) throw new Error('Tu usuario no administra ninguna página, o faltó marcar el permiso pages_show_list.');
    const c = cfg(); c.paginasTmp = lista; guardar(c);
    return lista.map(({ id, nombre }) => ({ id, nombre }));
  }
  // Paso 2: elegir la página y traer sus formularios
  async function elegirPagina(pageId) {
    const c = cfg(); const p = (c.paginasTmp || []).find((x) => x.id === pageId);
    if (!p) throw new Error('Vuelve a conectar Meta');
    Object.assign(c, { conectado: true, pageId: p.id, pageNombre: p.nombre, token: p.token, paginasTmp: undefined, forms: [], ultimaRevision: new Date(Date.now() - 24 * 3600000).toISOString() });
    guardar(c);
    await actualizarFormularios();
    return cfg();
  }
  async function actualizarFormularios() {
    const c = cfg(); if (!c.conectado) return [];
    const r = await graph(`/${c.pageId}/leadgen_forms`, { fields: 'id,name,status,questions', limit: '100' }, c.token);
    const prev = Object.fromEntries((c.forms || []).map((f) => [f.id, f]));
    c.forms = (r.data || []).map((f) => {
      const qs = (f.questions || []).map((q) => ({ key: q.key, label: q.label || q.key }));
      const antes = prev[f.id];
      const mapeo = antes?.mapeo || Object.fromEntries(qs.map((q) => [q.key, adivinar(q.key, q.label)]));
      return { id: f.id, nombre: f.name, estado: f.status, preguntas: qs, mapeo, activo: antes ? antes.activo : f.status === 'ACTIVE' };
    });
    guardar(c);
    return c.forms;
  }

  function leerLead(lead, form) {
    const c = { nombre: '', apellido: '', telefono: '', edad: '', renta: '', cargas: '', isapre: '' };
    const extra = {};
    for (const f of lead.field_data || []) {
      const v = (f.values || []).join(', ').trim();
      const campo = (form.mapeo || {})[f.name] || adivinar(f.name, '');
      if (campo === 'nombre_completo') { const [n, ...a] = v.split(/\s+/); c.nombre = c.nombre || n || ''; c.apellido = c.apellido || a.join(' '); }
      else if (campo && campo in c) c[campo] = c[campo] || v;
      else extra[f.name] = v;
    }
    return { c, extra };
  }

  async function revisar({ manual = false } = {}) {
    const c = cfg();
    if (!c.conectado || estado.revisando) return { nuevos: 0 };
    estado.revisando = true; estado.ultimoError = null;
    const desde = Math.floor((new Date(c.ultimaRevision || Date.now() - 86400000) - 10 * 60000) / 1000); // 10 min de traslape
    const inicio = new Date().toISOString();
    let nuevos = 0;
    try {
      for (const form of (c.forms || []).filter((f) => f.activo)) {
        let url = `/${form.id}/leads`;
        let params = { fields: 'id,created_time,field_data,platform,is_organic', limit: '100', filtering: [{ field: 'time_created', operator: 'GREATER_THAN', value: desde }] };
        for (let pag = 0; pag < 20 && url; pag++) {
          const r = await graph(url, params, url.startsWith('http') ? null : c.token);
          for (const lead of r.data || []) {
            if (db.leadMetaExiste(lead.id)) continue;
            const { c: datos, extra } = leerLead(lead, form);
            const tel = normPhone(datos.telefono);
            db.guardarLeadMeta({ id: lead.id, form_id: form.id, form_nombre: form.nombre, telefono: tel || datos.telefono, nombre: `${datos.nombre} ${datos.apellido}`.trim(), creado: lead.created_time ? new Date(lead.created_time).toISOString() : inicio, campos: { ...datos, extra, plataforma: lead.platform } });
            nuevos++;
            if (!tel) { evento({ estado: 'omitido', quien: datos.nombre, detalle: 'Lead de Meta con teléfono inválido' }); continue; }
            db.guardarContacto({ ...datos, telefono: tel, origen: 'meta:' + form.nombre });
            const quien = `${datos.nombre} ${datos.apellido}`.trim() || tel;
            if (db.getConfig('avisos').leadNuevo) notify('Nuevo lead de Meta', `${quien} · ${form.nombre}`, { chat: tel });
            evento({ estado: 'lead', quien, tel, detalle: 'Nuevo lead · ' + form.nombre });
            if (c.autoMensaje && !db.esBaja(tel) && !db.yaEnviado(tel) && !db.yaEnCola(tel, 'meta')) encolar(tel, datos);
          }
          const next = r.paging && r.paging.next;
          url = next || null; params = {};
        }
      }
      const c2 = cfg(); c2.ultimaRevision = inicio; c2.ultimoOk = inicio; guardar(c2);
    } catch (e) {
      estado.ultimoError = e.message; log('Meta: ' + e.message);
      if (manual) throw e;
    } finally { estado.revisando = false; }
    return { nuevos };
  }

  // Revisión periódica
  (async () => { await sleep(15000); for (;;) { try { await revisar(); } catch {} const m = Math.max(2, Math.min(60, cfg().intervaloMin || 5)); await sleep(m * 60000); } })();

  const publico = () => { const c = cfg(); return { conectado: !!c.conectado, pageNombre: c.pageNombre, forms: c.forms || [], intervaloMin: c.intervaloMin || 5, autoMensaje: c.autoMensaje !== false, ultimaRevision: c.ultimoOk || null, revisando: estado.revisando, error: estado.ultimoError }; };
  return {
    publico, conectar, elegirPagina, actualizarFormularios, revisar, CAMPOS,
    opciones: (o) => { const c = cfg(); if ('autoMensaje' in o) c.autoMensaje = !!o.autoMensaje; if (o.intervaloMin) c.intervaloMin = Math.max(2, Math.min(60, parseInt(o.intervaloMin))); guardar(c); },
    formulario: (id, cambios) => { const c = cfg(); const f = (c.forms || []).find((x) => x.id === id); if (!f) return; if ('activo' in cambios) f.activo = !!cambios.activo; if (cambios.mapeo) f.mapeo = cambios.mapeo; guardar(c); },
    desconectar: () => guardar({ conectado: false, forms: [], intervaloMin: cfg().intervaloMin || 5, autoMensaje: cfg().autoMensaje !== false })
  };
};
