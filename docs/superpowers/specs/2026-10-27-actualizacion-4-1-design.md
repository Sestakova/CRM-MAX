# Actualización 4.1.0 · Cola por grupos, Automáticos más simple y barra verde

Fecha: 2026-10-27 · Aprobado por Jesús en la conversación.

Reemplaza la parte de interfaz y de orden de envío de `2026-10-26-tandas-envio-design.md`. Lo que ya está en la rama `tandas-envio` sigue sirviendo: la tabla `tandas`, «No enviar» (sacar), pausar y cancelar un grupo, la ventana de confirmación con la lista (propuesta A) y `incluir`/`excluir`. Esa versión nunca se publicó, así que todo sale junto como **4.1.0**.

Quedan fuera de esta versión:
- La estética del Inicio. Jesús rechazó las tres propuestas y todavía no hay una referencia.
- Las licencias. Es un proyecto aparte, con las reglas ya decididas.

## 1. Cola de envío con grupos

### Lo que se ve

- Desaparece la tarjeta «Tandas». Dentro de la tarjeta «Cola de envío», bajo la barra general y los botones «Pausar todo» y «Cancelar pendientes», aparece un bloque por cada grupo que todavía tiene pendientes. Cada bloque muestra:
  - nombre del grupo, con su estado: **Enviando**, **En pausa**, **Espera su turno** o **Esperando horario/límite**;
  - barra de avance y «30 de 78 · Jesús · hoy 10:12»;
  - el modo, «corriendo» o «después de …».
- Al presionar un grupo se abre la ventana que ya existe (`verTanda`), con las pestañas Pendientes, Enviados, Sacados, Errores y Todos, y los botones «Pausar este grupo» / «Reanudar» y «Cancelar grupo».
  - Cada fila pendiente tiene una manija **≡** a la izquierda para arrastrarla y cambiar el orden dentro del grupo. Se usa arrastrar y soltar nativo (HTML5 drag and drop), sin librerías. Al soltar, el nuevo orden se guarda al tiro.
  - El que «Sale ahora» (estado `enviando`) no se puede mover.
  - Se elimina el botón «Primero»: la ruta `/item/:itemId/primero` y `db.primeroEnTanda` se borran. «No enviar» se mantiene, con la pregunta sobre los seguimientos.
  - Con la lista filtrada por la búsqueda, la manija no aparece, para no reordenar con filas ocultas.
- Los grupos terminados (sin pendientes) salen de la tarjeta. El registro de envíos sigue igual.
- **Programados** vuelve a su propia tarjeta «Programados», como estaba antes de las tandas. Cada uno tiene «Ver lista» (`verProgramado`, ya hecho) y «Cancelar».

### Al lanzar un envío masivo

- En la ventana de confirmación, si hay otro grupo con pendientes (activo o en pausa), aparece la pregunta:
  - **Después** (marcada de entrada): «Empieza cuando terminen los grupos que ya están en la cola».
  - **Corriendo**: «Sale al mismo tiempo que los otros, con su propio ritmo».
- Si no hay otro grupo, no se pregunta y el grupo parte de inmediato.
- Al programar un envío también aparece la pregunta, con «Después» marcado. Se aplica cuando llega la hora del programado.

### Cómo salen los mensajes (servidor)

- La tabla `tandas` recibe una columna nueva con `ensure`: `modo TEXT DEFAULT 'despues'` (`'despues'` | `'corriendo'`).
- Un grupo en modo `despues` puede enviar solo cuando no queda ningún grupo creado antes que él con pendientes y sin cancelar. Un grupo anterior en pausa también lo hace esperar: «después» significa después de ese grupo. Si se cancela el grupo anterior, el siguiente parte.
- Un grupo en modo `corriendo` envía desde el primer momento.
- **Carriles con ritmo propio.** En lugar del único `cola.nextAt`, hay un mapa `cola.carriles`:
  - El carril `auto` lleva los agendados, el primer mensaje a leads de Meta y los seguimientos, en el mismo orden de prioridad de hoy: agendado > meta > seguimientos. Los mensajes sueltos sin grupo también van aquí.
  - Hay un carril `t<id>` por cada grupo que puede enviar.
  - Cada carril guarda su `nextAt` y su `enviadosSesion`, y aplica su propia pausa al azar entre `esperaMin` y `esperaMax`, y su propio descanso cada `descansoCada` mensajes.
- El ciclo sigue siendo uno solo, cada 1,5 s, y manda **un mensaje por vuelta**: entre los carriles listos (`nextAt` vencido) elige el que lleva más rato esperando. Así no hay dos envíos a WhatsApp al mismo tiempo, y los grupos «Corriendo» avanzan en paralelo, cada uno a su ritmo.
- Los agendados no esperan la pausa del carril (8 a 15 s entre ellos, como hoy) y no respetan horario ni límite diario.
- El **máximo diario es uno solo** para todos los carriles (`enviadosHoy`). Al llegar al máximo, todos los grupos quedan en «Esperando horario/límite».
- «Pausar todo» (`cola_pausada`) detiene todos los carriles. Pausar un grupo detiene solo el suyo.
- `db.siguienteEnCola` se divide en dos funciones:
  - `siguienteAuto()`: elementos sin grupo, con la prioridad de hoy;
  - `siguienteDeTanda(id)`: el próximo pendiente del grupo, ordenado por `COALESCE(orden, id), id`.
  - `db.tandasQuePuedenEnviar()` devuelve los grupos activos, no pausados, con pendientes, y que cumplen la regla de `modo`.
- El resto del envío (`marcarEnviando`, revisión de baja, versiones, adjunto, segundo mensaje, inicio de secuencia) no cambia y se mueve a una función `enviarItem(it)`.
- La vista `/api/envios/vista` agrega, por grupo: `modo`, `estado` (enviando / en pausa / espera su turno / esperando horario o límite), `nextAt` y `despuesDe` (el nombre del grupo que espera).

### Ruta nueva

- `PUT /api/tandas/:id/orden` con `{ ids: [itemId, …] }`, los pendientes en el nuevo orden.
  - Asigna `orden` 1, 2, 3… solo a los ids que son pendientes de ese grupo. Ignora los demás y los que ya salieron.
  - Los pendientes del grupo que no venían en la lista quedan al final, en su orden actual.
  - Tiene los mismos permisos que pausar un grupo (`puedeManejar`).
- `POST /api/envios` y la creación del programado aceptan `modo` (`'despues'` por defecto).

## 2. Automáticos más simple

En la sección Automáticos se eliminan las tarjetas **Llamadas**, **Postventa y referidos**, **Resumen diario** y **Estado de la secuencia**. Se quitan de `index.html` y de `app.js` (los `kLlam`, `kPost`, `kRes` y el bloque de estado de la secuencia).

También se apaga lo que hacían por detrás:
- `alIngresar` deja de llamarse al pasar a Ingresado: ya no se agenda bienvenida, control ni referidos. `alSalirDeIngresado` se mantiene para cancelar lo que quedó agendado si alguien sale de Ingresado.
- El resumen diario (`resumenDiario`) deja de correr.
- Se quita el botón «Pausar todos los seguimientos». Como ya no hay cómo reanudarlos, una migración única pone `secuencia.pausada = false`. Los seguimientos siguen funcionando igual.
- Los mensajes ya agendados (postventa, control, referidos, llamadas) no se tocan y salen a su hora.
- Las claves `postventa`, `referidos` y `resumen` siguen en `DEFAULTS` y en la base, sin uso, para no romper nada al volver a una versión anterior.

## 3. Llamadas desde la ficha del lead

En la ventana «Agendar llamada» de la ficha:
- Las horas rápidas 10:00 y 16:00 quedan igual.
- Debajo, en lugar de la caja «Esto pasa solo», van tres casillas:
  - ☐ **Enviar confirmación al cliente**, con un enlace «Editar texto».
  - ☐ **Enviar recordatorio al cliente**, con una lista de 15 min, 1 h, 2 h o el día anterior, y su enlace «Editar texto».
  - ☐ **Avisarme en Windows**, con un número de minutos antes.
- «Editar texto» despliega un cuadro con el mensaje, con las variables `{nombre}`, `{dia}` y `{hora}`. Lo que se cambie se guarda en `config.llamadas` y queda para las próximas llamadas.
- Las casillas parten como quedaron en la última llamada: la elección también se guarda en `config.llamadas` (`confirmacion.on`, `recordatorio.on`, `recordatorio.minutos`, `avisoMin` y el nuevo `aviso.on`).
- «El día anterior» se guarda como `recordatorio.minutos = 'dia_antes'` y se envía el día anterior a las 18:00. Si esa hora ya pasó, no se envía.
- `POST` de la llamada recibe las opciones de esa llamada: `{ fecha, confirmacion, recordatorio, minutos, aviso, avisoMin }`. `programarLlamada(id, opciones)` usa esas opciones en lugar de leer solo la configuración. Si no vienen opciones (llamadas antiguas al reprogramar), usa `config.llamadas`.

## 4. Ficha del lead: «Referido por» oculto

- Se quita el campo del formulario de edición y de la vista de datos de la ficha. El dato sigue en la base y no se borra al guardar: el `PATCH` deja de mandar `referido_por`.
- En Métricas se quita la tarjeta «Referidos», que dependía de ese campo.

## 5. Barra superior verde

- En `main.js` la ventana usa `titleBarStyle: 'hidden'` y `titleBarOverlay: { color: '#2F4A3C', symbolColor: '#F6ECDA', height: 36 }`. Windows dibuja sus propios botones de minimizar, maximizar y cerrar, en crema; el de cerrar se pone rojo al pasar el mouse.
- En `index.html` va una barra fija de 36 px arriba, verde #2F4A3C, con `-webkit-app-region: drag` para mover la ventana y doble clic para maximizar. Lleva el logo pequeño y «CRM HERMES · versión X» en color crema (#F6ECDA), con la fuente Cinzel. Deja libre el espacio de los botones de Windows a la derecha (`env(titlebar-area-width)`).
- La versión la entrega el servidor, que ya la conoce.
- Se ve también en la pantalla del PIN.
- El resto de la interfaz baja 36 px. La vista de WhatsApp se ubica con el rectángulo que manda la página, así que se ajusta sola. Hay que probarlo.

## Novedades y versión

- `package.json` 4.1.0 (ya está).
- La entrada `NOVEDADES['4.1.0']` se reescribe:
  - grupos dentro de la Cola de envío;
  - ver y ordenar a quién se le envía;
  - «Corriendo» o «Después»;
  - llamadas con opciones en la ficha;
  - Automáticos más simple;
  - barra verde.

## Pruebas

Se usa `node:test`, con los ayudantes de `test/ayuda.js`.
- **Carriles:**
  - un grupo «Después» no sale mientras el anterior tiene pendientes, ni si el anterior está en pausa, y sí sale cuando el anterior termina o se cancela;
  - dos grupos «Corriendo» se alternan según su `nextAt`;
  - el máximo diario se comparte;
  - los agendados no esperan la pausa.
- **Orden:**
  - `PUT /orden` reordena solo pendientes del grupo e ignora ids ajenos o ya enviados;
  - `siguienteDeTanda` respeta el orden nuevo.
- **Automáticos:** pasar a Ingresado no crea agendados; la migración deja `secuencia.pausada` en false.
- **Llamadas:** las opciones por llamada crean (o no) la confirmación, el recordatorio y el aviso; «el día anterior» queda a las 18:00 del día previo.
- Se borran las pruebas existentes de «Primero».
- Prueba en el navegador contra un servidor de prueba (WhatsApp falso):
  - dos grupos corriendo;
  - arrastrar filas;
  - «Agendar llamada» con las casillas;
  - Automáticos sin las cuatro tarjetas.
- La barra verde se prueba con `npm start`.
