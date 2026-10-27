// Carriles de envío: los automáticos (agendados, Meta, seguimientos) van en el carril «auto»
// y cada grupo que puede enviar va en su propio carril «t<id>», con su pausa y sus descansos.
// La cola manda un mensaje por vuelta: el del carril listo que lleva más rato esperando.

const carril = (carriles, clave) => (carriles[clave] = carriles[clave] || { nextAt: 0, enviadosSesion: 0 });

function elegir({ auto, tandas, carriles, ahora, puedeMasivo }) {
  const listos = [];
  if (auto) {
    const c = carril(carriles, 'auto');
    // Los agendados salen a su hora: no esperan la pausa ni el horario ni el máximo diario
    if (auto.tipo === 'agendado') listos.push({ clave: 'auto', item: auto, nextAt: -1, id: 0 });
    else if (puedeMasivo && (c.nextAt || 0) <= ahora) listos.push({ clave: 'auto', item: auto, nextAt: c.nextAt || 0, id: 0 });
  }
  if (puedeMasivo) {
    for (const t of tandas) {
      if (!t.item) continue;
      const c = carril(carriles, 't' + t.id);
      if ((c.nextAt || 0) <= ahora) listos.push({ clave: 't' + t.id, item: t.item, nextAt: c.nextAt || 0, id: t.id });
    }
  }
  if (!listos.length) return null;
  listos.sort((a, b) => a.nextAt - b.nextAt || a.id - b.id);
  return { clave: listos[0].clave, item: listos[0].item };
}

function despuesDeEnviar(c, { reglas: r, agendado, ahora, rand }) {
  if (agendado) { c.nextAt = Math.max(c.nextAt || 0, ahora + rand(8, 15) * 1000); return; }
  c.enviadosSesion = (c.enviadosSesion || 0) + 1;
  let wait = rand(r.esperaMin, Math.max(r.esperaMin, r.esperaMax)) * 1000;
  if (r.descansoCada > 0 && c.enviadosSesion % r.descansoCada === 0) wait = r.descansoMin * 60000;
  c.nextAt = ahora + wait;
}

const trasError = (c, ahora) => { c.nextAt = ahora + 15000; };

module.exports = { elegir, despuesDeEnviar, trasError };
