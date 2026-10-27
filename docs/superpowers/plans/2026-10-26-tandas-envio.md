# Tandas de envío · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver a quién se le envía cada tanda (antes de lanzarla y mientras sale), y poder sacar a una persona sin cancelar la tanda entera.

**Architecture:** Agregamos una tabla `tandas` y dos columnas a `cola` (`tanda`, `orden`) en `db.js`. Ponemos la lógica que no depende de WhatsApp (unir destinatarios, avisos, nombres, estado) en un módulo nuevo, `tandas.js`, que se puede probar. `server.js` solo agrega rutas delgadas y ajusta la cola. La interfaz (`public/`) cambia la ventana de confirmación y suma el panel de tandas.

**Tech Stack:** Electron 38, Express 4, sql.js 1.13, JavaScript sin compilar. Las pruebas usan `node:test` y `node:assert/strict`, que vienen con Node, así que no hay que instalar dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-26-tandas-envio-design.md`

## Global Constraints

- Todo texto visible en español, simple y directo.
- No cambiar `userData` (`%APPDATA%\Enviador WhatsApp`), `appId` (`cl.conectasalud.enviador`), el repo de actualizaciones (`Sestakova/crm-max`) ni `asar: false`.
- whatsapp-web.js se queda fijo en `1.34.7`.
- Los cambios de base se hacen con `CREATE TABLE IF NOT EXISTS` y `ensure(...)` dentro de `openDb`. Las bases existentes se migran solas.
- El orden de la cola no cambia: agendado > meta > seguimientos > masivos/programados. «Primero» solo reordena dentro de la tanda.
- Horario, pausas, límite diario y descansos (`reglas`) no cambian.
- Los usuarios sin permiso de masivos siguen limitados a 5 contactos y sin segmentos.
- Plazo de «Recibió un masivo»: **7 días**. Terminadas visibles en el panel: **30 días**. El panel muestra tandas de **2 contactos o más**.
- Avisos que **vienen desmarcados**: `cliente` («Ya es cliente», etapa `Ingresado`) y `escribio` («Escribió hoy»). Avisos que vienen marcados: `masivo` («Recibió un masivo hace N días»), `seguimiento` («En seguimiento automático») y `perdido` («Perdido»).
- Nombre de tanda por defecto: los primeros 40 caracteres del mensaje + « · » + fecha corta es-CL (por ejemplo, `Hola {nombre}, te escribo por… · 26 oct`).
- Antes de publicar: subir `version` a `4.1.0` y agregar la entrada en `NOVEDADES` (`public/app.js`).

## Requisito previo (antes de la Task 1)

`npm install` hoy falla en la red con Fortinet (`SELF_SIGNED_CERT_IN_CHAIN`). Hay que correrlo en otra red, o con el certificado de Fortinet configurado por el usuario. Se da por cumplido cuando existe `node_modules/sql.js/dist/sql-wasm.wasm` y `node -e "require('sql.js')"` termina sin error. Sin esto no corren ni las pruebas ni el programa.

## Review Focus

1. **Apretar «No enviar» justo cuando ese mensaje está saliendo:** no debe salir después de sacado. Si ya estaba saliendo, la fila debe decir «Enviado» y el botón debe responder «Ya se estaba enviando». (Pruebas en Task 1 y Task 2.)
2. **Cerrar el programa a mitad de un envío:** el mensaje que quedó a medias no se reenvía. Queda como error con un detalle que pide revisar el celular. (Prueba en Task 1.)
3. **Mensajes que ya estaban en la cola antes de actualizar** (sin `tanda`): siguen saliendo en el mismo orden y no aparecen en el panel. (Prueba en Task 1.)
4. **Un mismo teléfono escrito de dos formas** (`+56 9 8123 4567` a mano y `56981234567` en el segmento), también dentro de `excluir`: cuenta como una sola persona y se excluye igual. (Prueba en Task 3.)
5. **Pausar una tanda:** no frena a las demás tandas, ni a los agendados, ni a los mensajes antiguos sin tanda. (Prueba en Task 1.)

---

### Task 1: Tabla de tandas y cola que respeta tandas

**Files:**
- Modify: `db.js` (SCHEMA ~línea 8-60, `ensure` ~102-122, sección «cola de envío» ~326-339)
- Modify: `package.json` (`scripts.test`)
- Create: `test/ayuda.js`, `test/cola.test.js`

**Interfaces:**
- Produces (en el objeto `api` de `openDb`):
  - `crearTanda({ nombre, usuario, tipo, programado = null, total }) -> number` (id). `tipo` es `'masivo'` o `'programado'`.
  - `encolar(items, tandaId = null) -> void`. Si hay `tandaId`, cada fila guarda `tanda = tandaId` y `orden = id`.
  - `siguienteEnCola(sinSeguimientos = false) -> fila | undefined`. Igual que hoy, pero salta los mensajes de tandas con `pausada = 1` u `estado = 'cancelada'`, y dentro de cada prioridad ordena por `COALESCE(orden, id), id`.
  - `marcarEnviando(id) -> boolean`. Hace `UPDATE cola SET estado = 'enviando' WHERE id = ? AND estado = 'pendiente'` y devuelve `true` si cambió una fila (usar `db.getRowsModified()`).
- Tabla `tandas`: `id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, usuario TEXT, creada TEXT, tipo TEXT, programado INTEGER, pausada INTEGER DEFAULT 0, estado TEXT DEFAULT 'activa', total INTEGER`.
- Columnas nuevas en `cola`: `tanda INTEGER`, `orden INTEGER`. Índice nuevo: `idx_cola_tanda ON cola(tanda, estado)`.
- Al abrir la base: `UPDATE cola SET estado = 'error', detalle = 'El programa se cerró mientras se enviaba: revisa en tu celular si salió', procesado = <ahora> WHERE estado = 'enviando'`.

- [ ] **Step 1: Agregar el script de pruebas y la ayuda de pruebas**

`package.json` → `"test": "node --test test/"`. En `test/ayuda.js` va `async function baseNueva() -> api`, que crea una carpeta con `fs.mkdtempSync(path.join(os.tmpdir(), 'crm-test-'))` y devuelve `await openDb(carpeta)`.

- [ ] **Step 2: Escribir las pruebas que fallan, en `test/cola.test.js`**

```js
test('mensajes sin tanda siguen saliendo en orden', async () => {
  const db = await baseNueva();
  db.encolar([{ telefono: '56911111111', texto: 'a', tipo: 'masivo' }, { telefono: '56922222222', texto: 'b', tipo: 'masivo' }]);
  assert.equal(db.siguienteEnCola().telefono, '56911111111');
});
test('una tanda en pausa no frena a otras, ni agendados, ni mensajes sin tanda', async () => {
  const db = await baseNueva();
  const t1 = db.crearTanda({ nombre: 'A', usuario: 'Jesús', tipo: 'masivo', total: 1 });
  const t2 = db.crearTanda({ nombre: 'B', usuario: 'Jesús', tipo: 'masivo', total: 1 });
  db.encolar([{ telefono: '56911111111', texto: 'a', tipo: 'masivo' }], t1);
  db.encolar([{ telefono: '56922222222', texto: 'b', tipo: 'masivo' }], t2);
  db.run('UPDATE tandas SET pausada = 1 WHERE id = ?', [t1]);
  assert.equal(db.siguienteEnCola().telefono, '56922222222');
  db.encolar([{ telefono: '56933333333', texto: 'c', tipo: 'agendado' }]);
  assert.equal(db.siguienteEnCola().telefono, '56933333333');
});
test('una tanda cancelada no entrega más mensajes', async () => { /* estado = 'cancelada' → siguienteEnCola() === undefined */ });
test('marcarEnviando solo funciona una vez y solo sobre pendientes', async () => {
  // primera llamada true, segunda false; tras sacar (estado 'sacado') → false
});
test('un mensaje que quedó enviando pasa a error al reabrir la base', async () => {
  // encolar, marcarEnviando, esperar el guardado (await new Promise(r => setTimeout(r, 1700))), openDb(misma carpeta)
  // → estado 'error', detalle empieza con 'El programa se cerró'
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL. `db.crearTanda is not a function` / `db.marcarEnviando is not a function`.

- [ ] **Step 4: Implementar en `db.js`**

Tabla, columnas, índice y la recuperación de `'enviando'` al abrir (va justo después de los `ensure`). Luego `crearTanda`, el parámetro `tandaId` de `encolar` (después del INSERT: `UPDATE cola SET orden = id WHERE tanda = ? AND orden IS NULL`), el filtro y el orden nuevo de `siguienteEnCola`, y `marcarEnviando`.

- [ ] **Step 5: Correr y ver que pasan**

Run: `npm test`
Expected: PASS (5 pruebas).

- [ ] **Step 6: Commit**

```bash
git add db.js package.json test/
git commit -m "Tandas en la base de datos y cola que respeta pausas por tanda"
```

---

### Task 2: Manejar una tanda (lista, sacar, primero, pausar, cancelar)

**Files:**
- Modify: `db.js` (sección cola, después de `marcarEnviando`)
- Create: `test/tandas-db.test.js`

**Interfaces:**
- Consumes: `crearTanda`, `encolar`, `marcarEnviando` (Task 1).
- Produces (en `api`):
  - `tandas({ desde }) -> [{ id, nombre, usuario, creada, tipo, pausada, estado, total, enviados, pendientes, omitidos, errores }]`. Devuelve las tandas con `total >= 2` que tienen pendientes o fueron creadas después de `desde` (ISO), de más nueva a más vieja. `omitidos` cuenta `estado IN ('omitido', 'sacado', 'cancelado')`. `pendientes` incluye `'enviando'`.
  - `tanda(id) -> fila | undefined`.
  - `itemsDeTanda(id) -> [{ id, telefono, estado, detalle, procesado, orden, nombre, apellido, ultimo_entrante }]`, con LEFT JOIN a `contactos`, ordenado por `COALESCE(orden, id)`.
  - `sacarDeTanda(itemId, usuario) -> 'sacado' | 'ya_salio'`. Hace `UPDATE ... SET estado = 'sacado', detalle = 'Sacado por ' + usuario, procesado = ahora WHERE id = ? AND estado = 'pendiente'`. Si no cambió ninguna fila, devuelve `'ya_salio'`.
  - `primeroEnTanda(itemId) -> void`. Hace `orden = (MIN(orden) de los pendientes de su tanda) - 1`.
  - `pausarTanda(id, pausada: boolean) -> void`.
  - `cancelarTanda(id) -> number`. Pone `estado = 'cancelada'` en la tanda y `'cancelado'` en sus pendientes. Devuelve cuántos mensajes canceló.
  - `quitarDeProgramado(programadoId, telefono) -> number`. Saca ese teléfono de `destinatarios` y devuelve cuántos quedan.

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
test('sacar a un pendiente: no sale y queda contado como omitido', async () => {
  // tanda con 3; sacarDeTanda(item2, 'Jesús') === 'sacado'
  // siguienteEnCola recorre solo item1 e item3; tandas()[0].omitidos === 1
  // itemsDeTanda: detalle de item2 === 'Sacado por Jesús'
});
test('sacar a alguien que ya se está enviando responde ya_salio', async () => {
  // marcarEnviando(item1) y luego sacarDeTanda(item1, 'Jesús') === 'ya_salio'
});
test('primero mueve dentro de su tanda sin saltarse una tanda anterior', async () => {
  // tanda A [a1, a2], tanda B [b1, b2]; primeroEnTanda(b2)
  // orden de salida: a1, a2, b2, b1
});
test('cancelar lo que falta deja intactos los enviados', async () => { /* 1 enviado + 2 pendientes → cancelarTanda === 2, enviados sigue en 1 */ });
test('tandas() oculta las de una persona y las terminadas viejas', async () => { /* total 1 no aparece; creada hace 40 días sin pendientes con desde = hace 30 días no aparece */ });
test('quitarDeProgramado saca solo a esa persona', async () => { /* crearProgramado con 3 → quitarDeProgramado === 2 */ });
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL. `db.sacarDeTanda is not a function`.

- [ ] **Step 3: Implementar las funciones del bloque Interfaces en `db.js`**

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS (todas, incluidas las de la Task 1).

- [ ] **Step 5: Commit**

```bash
git add db.js test/tandas-db.test.js
git commit -m "Sacar, priorizar, pausar y cancelar dentro de una tanda"
```

---

### Task 3: Módulo `tandas.js` (unir destinatarios, avisos, nombre, estado)

**Files:**
- Create: `tandas.js`, `test/tandas.test.js`
- Modify: `db.js` (agregar `datosParaAvisos`)

**Interfaces:**
- Produces, en `db.js`: `datosParaAvisos(telefonos: string[]) -> Map<tel, { etapa, ultimo_entrante, seq_estado, ultimoMasivo }>`. `ultimoMasivo` es la `fecha` máxima de `envios` con `tipo IN ('masivo', 'programado')` y `estado = 'enviado'`. Se consulta en bloques de 500 teléfonos.
- Produces, en `tandas.js` (`module.exports = { unirDestinatarios, avisosDe, nombrePorDefecto, escribioHace, estadoTanda }`), todas puras:
  - `unirDestinatarios({ destinatarios, segmento, excluir = [] }, { normPhone, buscarContactos }) -> { lista: [{ telefono, nombre, ...resto }], invalidos: number }`. Normaliza con `normPhone`, quita repetidos (gana el manual), suma el segmento con `buscarContactos({ ...segmento, sinBajas: true })` y quita los de `excluir` (normalizados también). Es la misma unión que hoy hace `/api/envios` en las líneas 1053-1059, pero **sin** guardar contactos.
  - `avisosDe(datos | undefined, ahora: Date) -> [{ clave, texto, desmarcar: boolean }]`. Claves y textos según Global Constraints. «Escribió hoy» compara contra la medianoche local de `ahora`. `masivo` aplica si `ultimoMasivo` es de hace 7 días o menos, con texto `Recibió un masivo hace N días` (o `hoy` si N = 0).
  - `nombrePorDefecto(texto: string, fecha: Date) -> string`. Usa los primeros 40 caracteres; si cortó, agrega `…`. Después va ` · ` y la fecha con `toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })` sin el punto final.
  - `escribioHace(ultimoEntrante: string | null, creada: string, ahora: Date) -> string | null`. Devuelve `null` si no escribió después de `creada`. Si sí: `Escribió hace N min` (< 60 min) o `Escribió hace N h`.
  - `estadoTanda({ estado, pausada, pendientes }) -> 'Cancelada' | 'En pausa' | 'Enviando' | 'Terminada'`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
const normPhone = /* copiar la de server.js:22-28 en test/ayuda.js y exportarla */;
test('el mismo teléfono escrito distinto cuenta una vez y se excluye igual', () => {
  const r = unirDestinatarios(
    { destinatarios: [{ telefono: '+56 9 8123 4567', nombre: 'Camila' }], segmento: {}, excluir: ['981234567'] },
    { normPhone, buscarContactos: () => [{ telefono: '56981234567', nombre: 'Camila R' }, { telefono: '56922222222', nombre: 'Pedro' }] });
  assert.deepEqual(r.lista.map((c) => c.telefono), ['56922222222']);
});
test('números inválidos se cuentan aparte', () => { /* '123' → invalidos === 1 */ });
test('cliente y escribió hoy vienen desmarcados; masivo, seguimiento y perdido no', () => {
  const ahora = new Date('2026-10-26T15:00:00');
  assert.deepEqual(avisosDe({ etapa: 'Ingresado' }, ahora).map((a) => [a.clave, a.desmarcar]), [['cliente', true]]);
  assert.equal(avisosDe({ ultimo_entrante: new Date('2026-10-26T09:00:00').toISOString() }, ahora)[0].desmarcar, true);
  assert.equal(avisosDe({ ultimo_entrante: new Date('2026-10-25T23:00:00').toISOString() }, ahora).length, 0);
  assert.deepEqual(avisosDe({ ultimoMasivo: new Date('2026-10-23T10:00:00').toISOString() }, ahora)[0], { clave: 'masivo', texto: 'Recibió un masivo hace 3 días', desmarcar: false });
  assert.equal(avisosDe({ ultimoMasivo: new Date('2026-10-18T10:00:00').toISOString() }, ahora).length, 0);
  assert.equal(avisosDe(undefined, ahora).length, 0);
});
test('nombre por defecto corta a 40 y agrega la fecha', () => {
  assert.equal(nombrePorDefecto('Hola {nombre}, te escribo por tu plan de Isapre actual', new Date('2026-10-26T10:00:00')), 'Hola {nombre}, te escribo por tu plan de… · 26 oct');
});
test('escribioHace', () => { /* 5 min después → 'Escribió hace 5 min'; antes de creada → null; 2 h → 'Escribió hace 2 h' */ });
test('estadoTanda', () => { /* cancelada gana; pausada con pendientes → 'En pausa'; 0 pendientes → 'Terminada' */ });
test('datosParaAvisos trae etapa y último masivo', async () => { /* con baseNueva(): guardarContacto + registrarEnvio(tel, 'x', 'masivo') */ });
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL. `Cannot find module '../tandas'`.

- [ ] **Step 3: Implementar `tandas.js` y `datosParaAvisos`**

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tandas.js db.js test/
git commit -m "Unir destinatarios y calcular avisos de cada contacto"
```

---

### Task 4: El servidor crea tandas y la cola marca «enviando»

**Files:**
- Modify: `server.js:1041-1072` (`/api/segmento`, `/api/envios`), `server.js:577-585` (`revisarProgramados`), `server.js:498-558` (`tick`)

**Interfaces:**
- Consumes: `unirDestinatarios`, `avisosDe`, `nombrePorDefecto` (Task 3); `crearTanda`, `encolar(items, tandaId)`, `marcarEnviando` (Task 1); `datosParaAvisos` (Task 3).
- Produces:
  - `POST /api/envios/vista` con cuerpo `{ destinatarios, segmento }`. Responde `{ lista: [{ telefono, nombre, apellido, etapa, avisos }], invalidos }`. Aplica el mismo control de permiso de 5 contactos que `/api/envios` y no guarda contactos.
  - `POST /api/envios` acepta además `excluir: string[]`. Ahora usa `unirDestinatarios`. Al enviar ahora: `crearTanda({ nombre: b.nombre || nombrePorDefecto(b.texto, new Date()), usuario: req.usuario.nombre, tipo: 'masivo', total })` y `encolar(..., tandaId)`. Si es programado, guarda la lista ya sin los excluidos (como hoy). Responde además con `tanda` (el id).
  - `revisarProgramados` crea la tanda con `tipo: 'programado'`, `programado: p.id`, el nombre `p.nombre` y el `usuario` del primer `_usuario` de la lista.
  - En `tick`, justo antes de `enviarA`: `if (!db.marcarEnviando(it.id)) return;` (alguien lo sacó entre medio).

- [ ] **Step 1: Hacer los cambios del bloque Interfaces**

En `/api/envios`, el `db.guardarContacto` de los destinatarios manuales sigue ocurriendo, pero solo para los que quedan en la `lista` final.

- [ ] **Step 2: Correr las pruebas**

Run: `npm test`
Expected: PASS (nada se rompe).

- [ ] **Step 3: Probar a mano con el programa**

Run: `npm start`. Envía a 2 contactos tuyos con «Enviar ahora».
Expected: los dos mensajes salen igual que antes. En `datos/crm.db`, `SELECT tanda, estado FROM cola ORDER BY id DESC LIMIT 2` muestra el mismo número de tanda y `enviado`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "Cada envío a una lista crea su tanda"
```

---

### Task 5: Rutas para ver y manejar tandas, con permisos

**Files:**
- Modify: `server.js` (junto a `/api/programados`, ~1073-1093)
- Modify: `tandas.js`, `test/tandas.test.js`

**Interfaces:**
- Consumes: Task 2 completa; `escribioHace` y `estadoTanda` (Task 3).
- Produces, en `tandas.js`: `puedeManejar(tanda, { esAdmin, nombre, masivos }) -> boolean`. Devuelve `esAdmin || (masivos && tanda.usuario === nombre)`.
- Rutas (todas detrás del PIN como el resto). Si `puedeManejar` da falso, responden `403` con «Solo quien lanzó la tanda o el administrador puede cambiarla»:
  - `GET /api/tandas` → `{ tandas: [... + estadoTexto + puedeManejar], programados }`. Usa `desde` = hace 30 días.
  - `GET /api/tandas/:id` → `{ tanda, items: [... + escribio: escribioHace(...)] }`.
  - `POST /api/tandas/:id/pausa` `{ pausada }`
  - `POST /api/tandas/:id/cancelar`
  - `POST /api/tandas/item/:itemId/sacar` `{ seguimientos: boolean }`. Responde `{ resultado: 'sacado' | 'ya_salio' }`. Si es `'sacado'` y `seguimientos`: `db.detenerSecuencia(tel, 'Sacado de una tanda')`.
  - `POST /api/tandas/item/:itemId/primero`
  - `GET /api/programados/:id/lista` y `POST /api/programados/:id/quitar` `{ telefono }`.
  - Cada acción que cambia algo llama a `act(req, ...)` con el nombre de la tanda. Por ejemplo: `act(req, 'Sacó a un contacto de una tanda', '"Bajar el plan" · Camila Rojas')`.

- [ ] **Step 1: Escribir la prueba que falla de `puedeManejar`**

```js
test('puedeManejar', () => {
  const t = { usuario: 'Ana' };
  assert.equal(puedeManejar(t, { esAdmin: true, nombre: 'Jesús' }), true);
  assert.equal(puedeManejar(t, { esAdmin: false, nombre: 'Ana', masivos: true }), true);
  assert.equal(puedeManejar(t, { esAdmin: false, nombre: 'Luis', masivos: true }), false);
  assert.equal(puedeManejar(t, { esAdmin: false, nombre: 'Ana', masivos: false }), false);
});
```

- [ ] **Step 2: Correr y ver que falla, implementar `puedeManejar` y las rutas, correr y ver que pasa**

Run: `npm test`
Expected: primero FAIL (`puedeManejar is not a function`), después PASS.

- [ ] **Step 3: Commit**

```bash
git add server.js tandas.js test/tandas.test.js
git commit -m "Rutas para ver, pausar, cancelar y sacar contactos de una tanda"
```

---

### Task 6: Ventana de confirmación con la lista (boceto A)

**Files:**
- Modify: `public/app.js:782-801` (`enviar`), `public/app.css`

**Interfaces:**
- Consumes: `POST /api/envios/vista` y `excluir` en `POST /api/envios` (Task 4).

Comportamiento (sigue el boceto A, `.superpowers/brainstorm/.../confirmacion.html`):
- Al apretar Enviar o Programar, se pide `/api/envios/vista` antes de abrir la ventana. Mientras carga, el botón dice «Preparando lista…».
- La ventana incluye:
  - El texto actual («Se enviará a **N de M contactos**…»).
  - La línea «K desmarcados por aviso · Marcarlos de nuevo», solo si K > 0.
  - Buscador por nombre o teléfono, «Marcar todos» y «Desmarcar todos».
  - La lista con casilla, nombre, teléfono con `fmtTel`, etapa y avisos como pastillas. `cliente` y `escribio` en color terra (`p-warn`); el resto en neutro.
  - Botones «Cancelar» y «Enviar a N» / «Programar para N».
- Los avisos con `desmarcar: true` empiezan sin marcar.
- **Listas grandes:** se dibujan máximo 200 filas, más «… y X más: usa el buscador». El buscador filtra sobre la lista completa en memoria. «Marcar/Desmarcar todos» afecta a toda la lista filtrada, no solo a las 200 visibles.
- Si N = 0, el botón queda deshabilitado.
- Al confirmar, se manda `excluir` con los teléfonos desmarcados.

- [ ] **Step 1: Implementar**

- [ ] **Step 2: Probar a mano**

Run: `npm start`
Expected:
- (a) Un contacto en etapa «Ingresado» aparece desmarcado con «Ya es cliente».
- (b) Al desmarcar a alguien y enviar, a esa persona no le llega nada.
- (c) Un segmento de más de 1000 contactos abre la ventana sin trabarse, y el buscador encuentra a alguien que no está entre los 200 primeros.
- (d) Un usuario sin permiso de masivos con 6 contactos ve el mismo mensaje de límite que hoy.

- [ ] **Step 3: Commit**

```bash
git add public/app.js public/app.css
git commit -m "Ver y desmarcar destinatarios antes de enviar"
```

---

### Task 7: Panel de tandas con la pestañita

**Files:**
- Modify: `public/index.html:143-149` (tarjeta «Cola de envío» y «Programados»), `public/app.js` (`renderCola` ~817, `renderProgramados` ~807), `public/app.css`

**Interfaces:**
- Consumes: rutas de la Task 5.

Comportamiento (sigue el boceto del panel, `tandas.html`):
- Debajo de «Cola de envío» va la sección «Tandas». Cada tarjeta muestra nombre, estado (`estadoTexto`), «Lanzada <fecha> por <usuario>», barra de avance y conteos.
- Botones: «Pausar esta tanda» / «Reanudar» y «Cancelar lo que falta». Solo aparecen si `puedeManejar`.
- Las tandas programadas salen del bloque `programados` con la pastilla «Programada», «Ver lista» y «Editar». La sección «Programados» actual se integra aquí.
- «Ver lista» abre la pestañita: Pendientes / Enviados / Omitidos y sacados / Errores / Todos, cada una con su número. `enviando` cuenta en Pendientes con la pastilla «Sale ahora».
- Cada fila pendiente lleva «Primero» y «No enviar». El aviso `escribio` se muestra como pastilla terra.
- «No enviar» pregunta «¿Sacarlo también de los seguimientos automáticos?» con «Sí, también» y «Solo de esta tanda». Si la respuesta es `ya_salio`, se avisa con toast «Ya se estaba enviando» y la lista se recarga.
- La tarjeta abierta se refresca con el `poll()` existente, que pide `/api/tandas` solo si la pestaña Envíos está a la vista.
- «Cancelar pendientes» de la cola general queda igual (solo administrador).

- [ ] **Step 1: Implementar**

- [ ] **Step 2: Probar a mano**

Run: `npm start` con una tanda de 4 contactos tuyos y pausas cortas en reglas.
Expected:
- (a) El avance se mueve solo.
- (b) «No enviar» en el 3.º evita que le llegue.
- (c) «Primero» en el 4.º hace que salga antes que el 3.º.
- (d) Si el 4.º te escribe, aparece «Escribió hace N min».
- (e) Al pausar la tanda se detiene, pero un agendado igual sale.
- (f) Una tanda terminada sigue con «Ver lista».

- [ ] **Step 3: Commit**

```bash
git add public/
git commit -m "Panel de tandas con lista por estado"
```

---

### Task 8: Versión 4.1.0 y prueba del instalador

**Files:**
- Modify: `package.json` (`version`), `public/app.js` (`NOVEDADES`, entrada `'4.1.0'`)

- [ ] **Step 1: Subir la versión y agregar novedades**

Entrada `'4.1.0'`:
- `'Antes de enviar ves la lista completa y puedes desmarcar a quien no corresponda'`
- `'Avisos en la lista: ya es cliente, escribió hoy, recibió un masivo hace poco, en seguimiento o perdido'`
- `'Panel de tandas: avance de cada envío, quién falta, a quién se sacó y a quién le llegó'`
- `'Puedes sacar a una persona, pasarla primero o pausar solo una tanda'`

- [ ] **Step 2: Correr pruebas y armar el instalador**

Run: `npm test` y luego `npm run build`.
Expected: PASS, y en `dist/` quedan `Instalar-CRM-HERMES.exe`, `.blockmap` y `latest.yml` con `version: 4.1.0`. Así se cumple también el pendiente de probar la configuración de `package.json` armando un instalador.

- [ ] **Step 3: Instalar sobre una 4.0.1 y verificar**

Expected:
- (a) Los datos y la sesión de WhatsApp siguen ahí.
- (b) Los mensajes que había en cola antes de actualizar terminan de salir.
- (c) El ícono y el nombre del .exe son «CRM HERMES».

- [ ] **Step 4: Commit**

```bash
git add package.json public/app.js
git commit -m "Versión 4.1.0: tandas de envío"
```

Publicar la release en GitHub es un paso aparte: se hace solo con el visto bueno de Jesús, y antes hay que resolver si el repositorio pasa a privado.
