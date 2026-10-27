# Tandas de envío: ver a quién se envía y sacar a alguien

Fecha: 2026-10-26 · Programa: CRM HERMES 4.0.1 · Pedido por: Jesús Bustamante

## Para qué

Hoy, al lanzar un envío a una base de datos, el programa solo dice «Se enviará a 80 contactos». No muestra quiénes son, y en la cola solo se ve cuántos faltan. Para no enviarle a alguien la única opción es cancelar todo (y eso solo lo puede hacer el administrador).

Jesús ha necesitado sacar a una persona **antes de lanzar** la tanda (alguien de la lista que no debería estar). También quiere ver cada tanda mientras sale y después de terminada, y poder sacar a alguien en cualquier momento.

**Se considera logrado cuando:** antes de apretar Enviar se ve la lista completa y se puede desmarcar a quien no va, y después cada tanda se puede abrir para ver quién está pendiente, quién recibió el mensaje y a quién se sacó.

## Metas

1. **Confirmación con lista (boceto A, elegido).** La ventana de «Enviar ahora» / «Programar» muestra a todos los destinatarios, incluidos los que vienen de un segmento. Trae buscador, «Marcar todos» / «Desmarcar todos» y una casilla por persona. El botón muestra el total real («Enviar a 78»).
2. **Avisos automáticos en la lista** (decisión de Jesús):
   - **Vienen desmarcados:** «Ya es cliente» (etapa «Ingresado») y «Escribió hoy».
   - **Vienen marcados, solo con el aviso:** «Recibió un masivo en los últimos 7 días», «Está en seguimiento automático» y «Perdido».
   - Arriba de la lista aparece una línea «N desmarcados por aviso · Marcarlos de nuevo», para que se vea quién se sacó solo y se pueda devolver con un clic.
3. **Panel de tandas** en la pestaña Envíos. Cada tanda es una tarjeta con nombre, quién la lanzó, cuándo, estado (Programada / Enviando / En pausa / Terminada / Cancelada), barra de avance y conteos (enviados, pendientes, omitidos, errores).
4. **La pestañita dentro de cada tanda:** Pendientes / Enviados / Omitidos y sacados / Errores / Todos. Se puede abrir en cualquier tanda, también en las terminadas («Ver lista») y en las programadas.
5. **Por persona pendiente:** «No enviar» y «Primero» (pasa al primer lugar dentro de su tanda).
6. **Por tanda:** «Pausar esta tanda» / «Reanudar» y «Cancelar lo que falta».
7. **Al sacar a alguien con «No enviar»:** el programa pregunta si también lo saca de los seguimientos automáticos («Sí, también» / «Solo de esta tanda»).
8. **Si alguien de una tanda escribe mientras la tanda sale:** se muestra el aviso «Escribió hace X min» junto a su nombre en la lista de pendientes. **No se saca solo:** Jesús decide (decisión de Jesús).

## Lo que no se hace

- No cambia el orden general de la cola: agendados > Meta > seguimientos > masivos. «Primero» solo reordena dentro de la tanda.
- No cambian las reglas de horario, pausas, límite diario ni descansos.
- No se agrupan en tandas los seguimientos, los leads de Meta ni los agendados. Siguen como hoy.
- No se toca cómo se envía cada mensaje (`enviarA`, confirmación de salida).

## Lo que no debe pasar (aunque técnicamente funcione)

- Que alguien sacado reciba igual el mensaje. Si ya estaba saliendo justo en ese momento, la lista debe mostrar la verdad: «Enviado».
- Que un mensaje que ya estaba en la cola antes de la actualización se pierda o se envíe dos veces.
- Que la ventana de confirmación se ponga lenta o se trabe con listas grandes (miles de contactos de un segmento).
- Que se pierdan datos del usuario: `userData`, `appId` y el repositorio de actualizaciones no se tocan (reglas del CLAUDE.md).

## Restricciones

- Electron + Express + sql.js. Los cambios de base de datos usan `ensure` y `CREATE TABLE IF NOT EXISTS`. Las bases que ya existen se migran solas al abrir el programa.
- Los usuarios sin permiso de masivos siguen limitados a 5 contactos y sin segmentos.
- Todo en español, textos simples y directos.
- Al publicar: subir versión y agregar entrada en `NOVEDADES` (public/app.js).

## Enfoques considerados

1. **Tabla nueva `tandas` + columna `tanda` en la cola (elegido).** Cada envío a una lista crea una tanda y cada mensaje de la cola sabe a qué tanda pertenece. Panel, conteos, pausa por tanda e historial salen directo de ahí. Es lo más ordenado y los mensajes viejos sin tanda siguen funcionando.
2. **Etiqueta de tanda dentro del JSON `datos` de cada mensaje.** Toca menos la base, pero la pausa, el nombre y el estado de la tanda quedan repartidos y contar se pone lento con listas grandes.
3. **Convertir cada masivo en un «programado para ahora».** Reutiliza la pantalla existente, pero `programados` guarda la lista como un bloque sin estado por persona. Para ver quién falta o sacar a alguien habría que rehacerlo casi entero.

Jesús eligió el 1.

## Cómo se construye (decidido)

### Base de datos (`db.js`)

- Tabla nueva `tandas`: `id`, `nombre`, `usuario`, `creada`, `tipo` ('masivo' | 'programado'), `programado` (id en `programados`, si viene de ahí), `pausada` (0/1), `estado` ('activa' | 'terminada' | 'cancelada'), `total`.
- `ensure('cola', 'tanda', 'INTEGER')` y `ensure('cola', 'orden', 'INTEGER')`.
- `siguienteEnCola` salta los mensajes de tandas en pausa. Dentro de la misma prioridad ordena por `orden` y después por `id`.
- Los mensajes de la cola sin `tanda` (los anteriores a la actualización) siguen saliendo como hoy y no aparecen en el panel.

### Servidor (`server.js`)

- **Vista previa de la lista:** endpoint nuevo que recibe destinatarios manuales + filtros de segmento y devuelve la lista completa ya unida, sin repetidos y sin bajas, con los avisos de cada persona. Usa la misma lógica de unión que `/api/envios`, en una función compartida.
- **`/api/envios`:** recibe, además, la lista de teléfonos desmarcados (`excluir`) y los quita. Crea la tanda y encola con `tanda`. Si es programado, guarda la lista final ya sin los desmarcados.
- **`revisarProgramados`:** al pasar a la cola crea la tanda (o usa la ya creada) y encola con `tanda`.
- **Endpoints de tandas:** listar tandas con conteos, ver los mensajes de una tanda por estado, «No enviar» (marca el mensaje como `sacado` con detalle «Sacado por <usuario>»), «Primero», pausar/reanudar, cancelar lo que falta. «No enviar» con «Sí, también» además detiene la secuencia del contacto.
- **Tandas programadas:** «Ver lista» y «No enviar» quitan a la persona de `destinatarios` en `programados` antes de que salga.
- **Aviso «Escribió hace X min»:** se calcula al pedir la lista, comparando el último mensaje entrante del contacto (`ultimo_entrante`) con la hora en que se lanzó la tanda.
- Una tanda pasa a «terminada» cuando no le quedan pendientes.
- Cada acción queda en el registro de actividad (`act`).

### Interfaz (`public/app.js`, `index.html`, `app.css`)

- La ventana de confirmación según el boceto A, con los avisos como pastillas de color.
- El panel de tandas según el boceto del panel: tarjeta por tanda, la pestañita y botones por fila.
- Se mantiene el registro de eventos que ya existe.

## Lo que queda a criterio de quien lo construye

- Nombres exactos de endpoints y funciones, siguiendo el estilo del archivo.
- Cómo paginar o virtualizar listas grandes en la ventana y en la pestañita (la ventana no debe trabarse con miles).
- Si los conteos se calculan al vuelo o se guardan.

## Decisiones tomadas por Claude (revisar)

- **Nombre de la tanda:** si no se escribe uno, se usa el comienzo del mensaje + fecha (por ejemplo, «Hola {nombre}, te escribo por… · 26 oct»). Hoy solo los programados tienen nombre.
- **«Recibió un masivo hace poco»:** se usa 7 días como plazo.
- **Quién puede gestionar una tanda:** cada usuario con permiso de masivos puede pausar, sacar o cancelar en sus propias tandas, y el administrador en todas. Hoy «Cancelar todo» es solo del administrador y se mantiene así.
- **Cuántas tandas se ven:** las activas y programadas, más las terminadas de los últimos 30 días.
- **Un envío a una sola persona** (por ejemplo, desde la ficha) también crea tanda, pero el panel muestra solo las de 2 contactos o más, para no llenarlo.
- **«No enviar» cuando el mensaje ya está saliendo:** si el envío ya empezó, el botón no tiene efecto y la fila pasa a «Enviado».
