# Actualización 4.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Groups shown inside «Cola de envío», each with its own pace and drag reordering; a simpler Automáticos; call options in the lead's ficha; «Referido por» hidden; a green title bar.

**Architecture:**
- Lane selection and pacing live in a new pure module, `carriles.js`, tested on its own. `server.js` `tick()` calls it once per loop and still sends one message per turn.
- The call plan (confirmation, reminder, Windows alert) moves to a pure module, `llamadas.js`.
- Database changes use `ensure` and a one-time migration in `db.js`.
- The UI changes stay in `public/` with no new libraries.

**Tech Stack:** Electron 38, Express 4, sql.js, whatsapp-web.js 1.34.7 (fixed version, patched), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-27-actualizacion-4-1-design.md`

## Global Constraints

- Every user-facing text is in simple, direct Spanish, in the same tone as the existing app.
- Do not change `userData`, `appId`, the update repo, `asar: false`, or the whatsapp-web.js version.
- Every new .js file at the root must be added to `build.files` in `package.json`.
- Daily limit: one counter for all lanes (`db.enviadosHoy()` against `reglas.limiteDiario`).
- Agendados do not wait for a lane's pause and ignore working hours and the daily limit. After each agendado, wait 8–15 s.
- Default mode is `'despues'`. In the UI, «Después» is preselected and «Corriendo» is the other option.
- Version 4.1.0. Do not commit without the work being done task by task. Do not push or publish without asking Jesús.
- Tests: `npm test` (`node --test "test/*.test.js"`).

## Review Focus

- **Earlier group cancelled while a «Después» group waits:** the waiting group must start on the next turn. *Test in Task 1.*
- **Dragging a row that started sending meanwhile:** `ordenarTanda` ignores non-pending items and does not change the order of whatever is already going out. *Test in Task 1.*
- **Daily limit reached with two groups «Corriendo»:** neither sends, and agendados still go out. *Test in Task 1.*
- **Rescheduling a call created before 4.1.0 (no `opciones`):** it uses `config.llamadas` and does not fail. *Test in Task 5.*
- **User who had seguimientos paused before updating:** they become active once and are not touched again. *Test in Task 4.*

---

### Task 1: Lanes and groups in the database

**Files:**
- Create: `carriles.js`
- Modify: `db.js`:
  - `tandas` table: add the `modo` column with `ensure`;
  - `crearTanda` (~337);
  - replace `siguienteEnCola` (~347);
  - remove `primeroEnTanda` (~374);
  - add `siguienteAuto`, `siguienteDeTanda`, `tandasQuePuedenEnviar`, `ordenarTanda`.
- Modify: `package.json` `build.files`: add `"carriles.js"`.
- Modify: `test/tandas-db.test.js` (remove the 2 «Primero» tests), `test/cola.test.js` (move to `siguienteAuto`/`siguienteDeTanda`).
- Create: `test/carriles.test.js`

**Interfaces:**
- Produces in `db`:
  - `crearTanda({ nombre, usuario, tipo, programado = null, total, modo = 'despues' }) -> id`
  - `siguienteAuto() -> item|null`: pending items with no group. Order: `agendado` 0, `meta` 1, `seguimiento1/2` 2, others 3, then `id`. Parses `datos`.
  - `siguienteDeTanda(id) -> item|null`: the group's next pending item, `ORDER BY COALESCE(orden, id), id`. Parses `datos`.
  - `tandasQuePuedenEnviar() -> [{ id, nombre, modo }]`: groups that are not cancelled, not paused, have `pendiente` items, and either have `modo = 'corriendo'` or have no earlier group (`t2.id < t.id`) that is not cancelled and still has `pendiente`/`enviando` items. An earlier paused group does block.
  - `bloqueadaPor(id) -> { id, nombre }|null`: the earliest group that holds back a «Después» group (used for «después de …»).
  - `ordenarTanda(tandaId, ids) -> n`: assigns `orden` 1..k to the ids, in order, that are `pendiente` in that group. The group's remaining pending items go after, keeping their current order. Saves.
- Produces in `carriles.js`:
  - `elegir({ auto, tandas, carriles, ahora, puedeMasivo }) -> { clave, item }|null`
    - `auto`: an item or null.
    - `tandas`: `[{ id, item }]`.
    - `carriles`: an object `{ [clave]: { nextAt, enviadosSesion } }`, created empty if missing.
    - Keys are `'auto'` and `'t' + id`.
    - An agendado is ready at any time. Any other item is ready when `puedeMasivo` is true and `(carril.nextAt || 0) <= ahora`.
    - Among the ready ones, pick the smallest `nextAt` (missing = 0). On a tie, `auto` wins, then the lowest id.
  - `despuesDeEnviar(carril, { reglas, agendado, ahora, rand })`:
    - Agendado: `nextAt = max(nextAt || 0, ahora + rand(8, 15) * 1000)` and `enviadosSesion` does not change.
    - Otherwise: `enviadosSesion++`, then `nextAt = ahora + rand(esperaMin, max(esperaMin, esperaMax)) * 1000`, or `descansoMin * 60000` when `descansoCada > 0 && enviadosSesion % descansoCada === 0`.
  - `trasError(carril, ahora)`: `nextAt = ahora + 15000`.

- [ ] **Step 1: Write the failing tests** in `test/carriles.test.js` (pure) and in `test/cola.test.js` (db, using `baseNueva`):
  - `elegir: dos grupos corriendo se alternan por nextAt`: `t1.nextAt = 1000`, `t2.nextAt = 500`, `ahora = 2000` → `clave === 't2'`.
  - `elegir: un carril con nextAt futuro no sale`: `t1.nextAt = 5000`, `ahora = 2000`, no auto → `null`.
  - `elegir: con el máximo diario solo salen agendados`: `puedeMasivo: false`, auto `{tipo:'agendado'}` plus one group → `clave === 'auto'`. With auto `{tipo:'meta'}` → `null`.
  - `despuesDeEnviar: descanso cada N`: `reglas = {esperaMin:45, esperaMax:120, descansoCada:2, descansoMin:10}`, `rand = (a) => a`. First call → `nextAt === ahora + 45000`. Second → `ahora + 600000`.
  - `despuesDeEnviar: un agendado no acorta la pausa`: `nextAt = ahora + 90000`, agendado → stays at `ahora + 90000` and `enviadosSesion` does not change.
  - `un grupo Después espera al anterior, aunque esté en pausa`: groups A (corriendo) and B (despues) with pendientes → `tandasQuePuedenEnviar()` only has A. Pause A → empty. Cancel A → only B.
  - `un grupo Corriendo sale aunque haya otro antes`: A despues, B corriendo → both.
  - `bloqueadaPor devuelve el primer grupo que la frena`.
  - `ordenarTanda respeta el nuevo orden y deja al final los no mencionados`: group with items a, b, c, d; `ordenarTanda(t, [c, a])` → `siguienteDeTanda` returns c, then (after closing c) a, b, d.
  - `ordenarTanda ignora ids de otro grupo y los que ya están enviando`: `marcarEnviando(a)`, `ordenarTanda(t, [a, otroGrupo, b])` → `a` keeps `estado 'enviando'`, the other group is untouched, and `siguienteDeTanda(t).id === b`.
  - `siguienteAuto no entrega mensajes de grupos y respeta la prioridad`: masivo in a group + meta + agendado with no group → agendado, then meta, then null.
  - Rewrite the existing `cola.test.js` tests with `siguienteAuto`/`siguienteDeTanda`, keeping what they check (pause, cancellation, marcarEnviando, reopen).

- [ ] **Step 2: Run** `npm test` → the new tests FAIL (`carriles.js` does not exist / `db.siguienteAuto is not a function`).

- [ ] **Step 3: Implement** `carriles.js` and the db functions with the signatures above. `ensure('tandas', 'modo', "TEXT DEFAULT 'despues'")`. Delete `siguienteEnCola` and `primeroEnTanda`, and their tests. Add `carriles.js` to `build.files`.

- [ ] **Step 4: Run** `npm test` → all PASS.

- [ ] **Step 5: Commit** `git commit -m "Carriles: cada grupo con su ritmo, modo Después/Corriendo y orden por arrastre en la base"`

---

### Task 2: Server: tick by lane, group routes and mode

**Files:**
- Modify: `server.js`:
  - `cola` (~477) and `tick()` (~500–560);
  - `revisarProgramados` (~584);
  - `/api/envios` (~1081);
  - `/api/tandas` (~1111);
  - remove `/api/tandas/item/:itemId/primero` (~1144);
  - state `cola` (~841).
- Modify: `tandas.js` `estadoTanda`.
- Test: `test/tandas.test.js`

**Interfaces:**
- Consumes: Task 1 (`db.siguienteAuto`, `db.siguienteDeTanda`, `db.tandasQuePuedenEnviar`, `db.bloqueadaPor`, `db.ordenarTanda`, `CARRILES.elegir/despuesDeEnviar/trasError`).
- Produces:
  - `estadoTanda({ estado, pausada, pendientes, puedeEnviar, bloqueoGlobal }) -> 'Cancelada'|'Terminada'|'En pausa'|'Espera su turno'|'Esperando horario o límite'|'Enviando'` (in that order of priority).
  - `GET /api/tandas` → each group adds `modo`, `estadoTexto`, `nextAt` (that lane's, or null) and `despuesDe` (name or null). The `programados` list is unchanged.
  - `PUT /api/tandas/:id/orden` `{ ids: number[] }` → `ok`. Permission: `puedeManejar`, same message `SIN_PERMISO_TANDA`. A cancelled or missing group → `fail` 404.
  - `POST /api/envios` and creating a programado accept `modo: 'despues'|'corriendo'`. Any other value is saved as `'despues'`. The programado keeps it in `extra.modo` and uses it in `crearTanda` when it fires.
  - The state's `cola.nextAt` = the smallest future `nextAt` across lanes, for the overall «Próximo en …» text.

- [ ] **Step 1: Write the failing test** in `test/tandas.test.js`: `estadoTanda` with `{estado:'activa', pausada:0, pendientes:3, puedeEnviar:false}` → `'Espera su turno'`; with `puedeEnviar:true, bloqueoGlobal:true` → `'Esperando horario o límite'`; with `pausada:1` → `'En pausa'` (pause wins over waiting its turn).
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Rewrite `tick()`:**
  - Keep the checks for WhatsApp connected and «Pausar todo».
  - `puedeMasivo = enHorario() && db.enviadosHoy() < r.limiteDiario`.
  - Call `CARRILES.elegir` with `db.siguienteAuto()` and `db.tandasQuePuedenEnviar().map(t => ({ id: t.id, item: db.siguienteDeTanda(t.id) }))`.
  - Move the current send block, from `tel` to the second message, into `async function enviarItem(it)`, with no change in behavior. Remove the `secuencia.pausada` parameter.
  - Then `despuesDeEnviar` or `trasError` on the chosen lane.
  - `cola.espera` keeps its current texts (out of hours / daily limit).
  - Update `estadoTanda` and the routes above. Delete the `/primero` route.
- [ ] **Step 4: Run** `npm test` → PASS. Run `node -e "require('./server')"` → no syntax errors.
- [ ] **Step 5: Commit** `git commit -m "Cola: un mensaje por vuelta eligiendo entre carriles; rutas de orden y modo"`

---

### Task 3: Interface: groups in the Cola, drag, Corriendo/Después and Programados

**Files:**
- Modify: `public/index.html`:
  - inside `#qCard`, after the buttons, add `<div id="qGrupos"></div>` before `#qLog`;
  - replace the «Tandas» card with `<div class="glass"><div class="card" style="padding-bottom:6px"><h2>Programados</h2></div><div id="eProgList"></div></div>`, hidden while there are no programados;
  - the `#qPause` button text becomes «Pausar todo».
- Modify: `public/app.js`:
  - `renderTandas` (~864) → `renderGrupos` paints `#qGrupos`;
  - `verTanda` (~881): drag and drop, no «Primero»;
  - `confirmarLista` (~812): Corriendo/Después;
  - the calls to `/api/envios` and programar send `modo`;
  - Programados into its own card.
- Modify: `public/app.css`: `.grupo`, `.asa`, `.fila.arrastrando`, `.hueco`, `.opc`, in the style of the approved mockup (`cola-grupos.html`).

**Interfaces:**
- Consumes: `GET /api/tandas`, `PUT /api/tandas/:id/orden`, `modo` in `/api/envios` (Task 2).
- `confirmarLista(todos, { programar, cuando, detalle, hayGrupos })` returns `{ excluir, incluir, modo }`. `hayGrupos` = at least one group in `GET /api/tandas` with `pendientes > 0`.

- [ ] **Step 1: Groups in the Cola.**
  - Each group shows: name, status pill (Enviando = info, En pausa / Espera su turno = muted, Esperando = warn), progress bar, «enviados de total · usuario · hora · corriendo|después de X».
  - A click opens `verTanda(id)`.
  - Only groups with `pendientes > 0` are painted; finished ones leave the card.
  - Keep the `renderTandas.sig` repaint guard and the poll hook (~221).
- [ ] **Step 2: Drag in `verTanda`.**
  - On the «Pendientes» tab, each row with `estado === 'pendiente'` has `<span class="asa" draggable="true">≡</span>`, using HTML5 `dragstart`/`dragover`/`drop`.
  - On drop, reorder in the DOM, `PUT /orden` with the visible pending ids, and re-render. If it fails, toast the message and reload the list.
  - With text in the search box, the handles are not shown.
  - Remove the «Primero» button and its handler.
- [ ] **Step 3: Corriendo/Después.**
  - With `hayGrupos`, `confirmarLista` shows two `.opc` blocks: **Después** (on by default, «Empieza cuando terminen los grupos que ya están en la cola») and **Corriendo** («Sale al mismo tiempo que los otros, con su propio ritmo»).
  - Without `hayGrupos`, `modo = 'despues'`.
  - For a programado, always show the choice.
- [ ] **Step 4: Check in the browser.**
  - Use the test server with fake WhatsApp (`server.start({ dataDir: tmp, embebido: { puerto: async () => { throw new Error('sin wa') } } })`, PIN 1234).
  - Launch two sends; the second one as «Corriendo». Both are visible in the Cola. The list opens, a row can be dragged, and after reloading the order stays.
  - The Programados card shows «Ver lista». No console errors.
- [ ] **Step 5: Commit** `git commit -m "Cola de envío con grupos, arrastre para ordenar y elección Corriendo/Después"`

---

### Task 4: Simpler Automáticos

**Files:**
- Modify: `public/index.html` (~157–175):
  - remove the `grid g3` with `kLlam`/`kPost`/`kRes`;
  - remove the «Estado de la secuencia» card (`aEstado`, `aPausa`);
  - move its help text («El Mensaje 1 se usa en Envíos…») under the sequence title.
- Modify: `public/app.js`: remove the render of `kLlam`/`kPost`/`kRes` (~974–1030), the `aPausa` handler (~1031) and whatever paints `aEstado`.
- Modify: `server.js`:
  - remove the call `alIngresar(c.telefono)` (~1029) and the `alIngresar` function;
  - remove `resumenDiario`, `textoResumen` and their `setInterval` (~684–717);
  - remove `'postventa', 'referidos', 'resumen'` from `EDITABLES`/`auto` (~1257–1262) only if nothing in the UI uses them anymore.
  - Keep `alSalirDeIngresado`.
- Modify: `db.js`: one-time migration after the `ensure` calls: `if (!api.getConfig('mig_410_seq', false)) { const s = api.getConfig('secuencia'); if (s.pausada) { s.pausada = false; api.setConfig('secuencia', s); } api.setConfig('mig_410_seq', true); }`.
- Test: `test/tandas-db.test.js` or a new `test/migracion.test.js`.

- [ ] **Step 1: Failing test.** `seguimientos en pausa se reactivan una sola vez al actualizar`:
  - open a base, `setConfig('secuencia', {...pausada:true})` and delete `mig_410_seq`;
  - `esperarGuardado`, reopen → `pausada === false`;
  - set `pausada:true` again, reopen → it stays `true` (the migration does not run again).
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** the migration and the removals. `grep -n "alIngresar\|resumenDiario\|kLlam\|kPost\|kRes\|aPausa\|aEstado" server.js public/*` → only `alSalirDeIngresado` is left.
- [ ] **Step 4: Run** `npm test` → PASS.
  - In the browser: Automáticos shows Mensajes agendados, the sequence and Respuesta fuera de horario, with no errors.
  - Moving a lead to Ingresado does not create new agendados (look at the Mensajes agendados list).
- [ ] **Step 5: Commit** `git commit -m "Automáticos: se quitan llamadas, postventa, resumen diario y estado de la secuencia"`

---

### Task 5: Call options in the ficha

**Files:**
- Create: `llamadas.js`; add it to `build.files`.
- Modify: `db.js`: `ensure('llamadas', 'opciones', 'TEXT')`; `crearLlamada(tel, fecha, opciones)` saves `JSON.stringify(opciones || null)`.
- Modify: `db.js` `DEFAULTS.llamadas`: add `aviso: { on: true }`.
- Modify: `server.js`:
  - `programarLlamada(id)` (~629) uses `LLAMADAS.plan`;
  - `POST /api/llamadas` (~955) and `/reagendar` (~963) receive the options.
- Modify: `public/app.js` `llamadaModal` (~466–502).
- Test: `test/llamadas.test.js`

**Interfaces:**
- `opciones`: `{ confirmacion: boolean, recordatorio: boolean, minutos: number|'dia_antes', aviso: boolean, avisoMin: number }`.
- `LLAMADAS.desdeConfig(cfg) -> opciones` maps `cfg.confirmacion.on`, `cfg.recordatorio.on`, `cfg.recordatorio.minutos`, `cfg.aviso?.on !== false` and `cfg.avisoMin`.
- `LLAMADAS.plan(fecha: Date, op, ahora: Date) -> { confirmacion: boolean, recordatorio: Date|null, aviso: Date|null }`:
  - The reminder is at `fecha - minutos`, or, with `'dia_antes'`, the day before `fecha` at 18:00 local time. It is `null` if it is off or falls before `ahora + 5 min`.
  - The alert is at `fecha - avisoMin`, or `null` if it is off.
- `programarLlamada(id)`: `op = l.opciones ? JSON.parse(l.opciones) : LLAMADAS.desdeConfig(cfg)`. The texts always come from `config.llamadas`.
- `POST /api/llamadas` `{ telefono, fecha, opciones?, textos?: { confirmacion?, recordatorio? } }`:
  - If `opciones` comes in, it is saved on the call and also in `config.llamadas` (remembering the last choice).
  - If `textos` comes in, the text is updated in `config.llamadas`.
  - `/reagendar` accepts the same. Without `opciones`, it keeps the ones the call already had.

- [ ] **Step 1: Failing tests** in `test/llamadas.test.js`:
  - `plan con todo activo`: call tomorrow at 16:00, `minutos: 60`, `avisoMin: 10` → reminder 15:00, alert 15:50, `confirmacion: true`.
  - `el día anterior es a las 18:00`: call Thursday at 10:00 → reminder Wednesday at 18:00.
  - `día anterior que ya pasó no se envía`: call tomorrow at 10:00, `ahora` = today at 19:00 → `recordatorio === null`.
  - `todo apagado`: → `{ confirmacion: false, recordatorio: null, aviso: null }`.
  - `una llamada antigua sin opciones usa la configuración`: `desdeConfig(DEFAULTS.llamadas)` → `{ confirmacion: true, recordatorio: true, minutos: 60, aviso: true, avisoMin: 10 }`.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `llamadas.js`, the db, server and modal.
  - In the modal, replace the «Esto pasa solo» box with three checkboxes, started from `CFG.llamadas`:
    - confirmation, with an «Editar texto» link that shows a textarea;
    - reminder, with a select (15 min = 15, 1 h = 60, 2 h = 120, El día anterior = `'dia_antes'`) and «Editar texto»;
    - Windows alert, with a minutes input.
  - Below the textareas: `{nombre}`, `{dia}` and `{hora}` are replaced automatically.
  - After saving, update `CFG.llamadas` locally.
- [ ] **Step 4: Run** `npm test` → PASS. In the browser:
  - schedule a call with only the alert → the Mensajes agendados list gets no confirmation;
  - reopen the modal → the checkboxes are as they were left.
- [ ] **Step 5: Commit** `git commit -m "Agendar llamada: elegir confirmación, recordatorio y aviso en cada llamada"`

---

### Task 6: «Referido por» hidden

**Files:**
- Modify: `public/app.js`:
  - remove the `mRef` label (~323) and `referido_por` from `campos` and from the `PATCH` (~339, ~344);
  - remove the `['Referido por', …]` pair from the data view (~438);
  - remove the «Referidos» card from Métricas (~1263).

- [ ] **Step 1: Make the changes.**
- [ ] **Step 2: Check in the browser.** Edit a contact that has `referido_por`, save, and check that the value is still in the base (`GET /api/contactos/:tel`). Métricas without errors.
- [ ] **Step 3: Commit** `git commit -m "Ficha: se oculta Referido por"`

---

### Task 7: Green title bar, Novedades and final check

**Files:**
- Modify: `main.js` (~170): `titleBarStyle: 'hidden'`, `titleBarOverlay: { color: '#2F4A3C', symbolColor: '#F6ECDA', height: 36 }`.
- Modify: `public/index.html`: `<header id="barraVentana">` as the first element of `body`, with the logo (`logo` already in `public/`) and `<span id="barraTitulo">CRM HERMES</span>`.
- Modify: `public/app.css`:
  - `#barraVentana`: `position:fixed; top:0; left:0; height:36px; width:env(titlebar-area-width, 100%); background:#2F4A3C; color:#F6ECDA; font-family:Cinzel; -webkit-app-region:drag; z-index` above everything, including the PIN screen;
  - `body { padding-top:36px }`, or the equivalent in the main container and the PIN screen.
- Modify: `public/app.js`:
  - fill `#barraTitulo` with «CRM HERMES · versión X» from the version the server already sends;
  - double-click maximizes. That is native with drag, so nothing needs to be done.
  - rewrite `NOVEDADES['4.1.0']` with the items in the spec («Novedades y versión»).

- [ ] **Step 1: Make the changes.**
- [ ] **Step 2: `npm start`.**
  - The bar is green, the buttons are cream and close turns red.
  - The bar shows on the PIN screen.
  - The window can be dragged from the bar.
  - The WhatsApp view is not covered by the bar or shifted (check Chats).
- [ ] **Step 3: `npm test` → all PASS.**
- [ ] **Step 4: Full check in the browser** against the test server:
  - two groups, Corriendo/Después, drag;
  - Automáticos;
  - Agendar llamada;
  - ficha.
  - No console errors.
- [ ] **Step 5: Commit** `git commit -m "Barra superior verde y novedades de la 4.1.0"`
