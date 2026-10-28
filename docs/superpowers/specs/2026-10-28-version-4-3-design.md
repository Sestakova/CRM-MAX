# CRM HERMES 4.3.0: temas, actualizaciones livianas, documentos, anualidad, 7% y etiquetas

Fecha: 2026-10-28. Pedido por Jesús Bustamante (Conecta Salud), único usuario del CRM. Diseño conversado con maquetas en el navegador (`.superpowers/brainstorm/1422-1793170392/content/`).

## Por qué

Jesús quiere un CRM más cómodo para el día a día de un agente de Isapre: trabajar de noche sin encandilarse, recibir actualizaciones en segundos en vez de 120 MB, tener los documentos de cada cliente ordenados sin buscarlos en Descargas, no perder clientes en el aniversario de su contrato, saber al tiro el 7% de un lead y agrupar leads a su manera. También quiere sacar lo que no usa (la campanita, la línea de la barra, código que quedó de la 4.1.0).

## Qué entra (10 partes)

### 1. Barra de secciones sin línea (ya hecho, sin commit)
Se borraron las dos reglas `body.barra .stage::after` y `body.barra.compacto .stage::after` de `public/app.css`. Va en el primer commit de la versión.

### 2. Temas de color
- Cuatro temas: **Claro** (el actual), **Invertido**, **Oscuro**, **Automático**.
- **Invertido**: fondo verde de la marca `#2F4A3C`, superficies verdes un poco más claras (`#3B5B4A`), letras crema `#F6ECDA`, terracota más claro para contraste (`#E07A57`), barra de título de Windows en terracota `#B4472C` con símbolos `#FBEDE7`.
- **Oscuro**: casi negro cálido (fondo `#181512`, superficies `#221E1A`, líneas `#3A332C`), letras `#ECE2D2`, apagadas `#A3937F`, terracota `#D9734F`, verde `#8DB39A`, barra de título `#221E1A`.
- Valores de referencia: la maqueta aprobada `temas-v2.html`. El constructor ajusta tonos donde haga falta para que todo se lea bien (contraste AA en texto normal).
- **Automático = por horario**: Oscuro de 20:00 a 7:00, Claro el resto. Las dos horas se cambian en Configuración. Cambia solo, sin reiniciar, a la hora justa (revisar cada minuto basta).
- **Botón del tema**: botón redondo en la barra de arriba, en el lugar de la campanita. Su dibujo muestra el tema puesto: sol (Claro), círculo mitad lleno (Invertido), luna (Oscuro), «A» dentro de un círculo (Automático). Al apretarlo abre **un menú chico** con los cuatro temas y su dibujo; se marca el actual.
- El tema elegido se guarda (en `apariencia.tema` de la config) y se aplica antes de pintar la pantalla para que no haya destello claro al abrir.
- La barra de título de Windows (`titleBarOverlay`) cambia de color con el tema (vía IPC desde la pantalla a `main.js`, `win.setTitleBarOverlay`).
- **WhatsApp**: cuando el tema efectivo es Oscuro, `nativeTheme.themeSource = 'dark'` para que WhatsApp Web pase a su modo oscuro (si el usuario lo tiene en «predeterminado del sistema»); con Claro o Invertido, `'light'`. El Cotizador queda como lo muestre miscotizadores.
- Todos los colores sueltos de `app.css` y `app.js` (unos 40 fuera de las variables) pasan a variables o se revisan para que funcionen en los cuatro temas. Fondos de la Configuración «apariencia» (aurora, foto propia, opacidad) deben seguir funcionando encima de cada tema.

### 3. Sacar la campanita
- Se quita el botón `#bCampana`, su globo `#campPop`, su badge y `/api/campana`. Los recordatorios del día siguen contando en el Inicio («N cosas para hoy») y se ven en «Tu día».
- La ayuda/novedades que nombran la campanita se actualizan.

### 4. Sacar código muerto
Lo que quedó de lo quitado en 4.1.0: revisión de `secuencia.pausada`, entradas `resumen`, `postventa`, `referidos` del mapa `NOM` de `server.js`, `respuestasRapidas` en `DEFAULTS` y `EDITABLES` (no tiene pantalla), y cualquier función o ruta de resumen diario, postventa o referidos que ya no se llame. `alSalirDeIngresado` se mantiene mientras existan agendados viejos de postventa que cancelar. No debe cambiar nada visible.

### 5. Actualizaciones livianas, con barra de avance y botón de reinicio
- **Dos tipos de actualización:**
  - **Liviana** (casi siempre): solo cambian `public/` y los `.js` propios del programa. La release trae un paquete chico (zip, unos 2-5 MB) más un archivo de datos con versión, tamaño, sha512 y una «huella» de la base (versión de Electron + `package.json` dependencias). Solo se aplica si la huella coincide con la del programa instalado.
  - **Completa**: cuando cambia Electron, whatsapp-web.js, otras dependencias o los parches: el instalador de siempre con electron-updater.
- El CRM revisa la release más nueva: si hay paquete liviano compatible, baja ese; si no, el instalador completo.
- **Barra de avance**: mientras baja cualquiera de los dos, se ve una barrita con el porcentaje (y MB bajados de MB totales) en un lugar visible siempre, no solo en Configuración. Al terminar aparece el botón **«Reiniciar y actualizar»**: el programa se cierra entero (incluida la bandeja y WhatsApp) y vuelve a abrir solo con la versión nueva.
- Si no se aprieta el botón, la actualización se aplica la próxima vez que se cierre y abra el programa.
- **Seguridad**: verificar sha512 antes de aplicar; aplicar de forma que un corte a la mitad no deje el programa roto; si la versión liviana no logra arrancar, volver a la anterior. Un instalador completo posterior siempre manda sobre un paquete liviano anterior. Datos del usuario (`%APPDATA%\Enviador WhatsApp`) intocables.
- Revisar cada 30 minutos en vez de cada 4 horas (ya estaba acordado como idea).
- **Publicar**: `npm run build` genera también el paquete liviano y su archivo de datos; la release lleva esos archivos además de los 3 de siempre. Actualizar `CLAUDE.md` («Publicar una versión»).
- Instalación por usuario (`perMachine: false`), en una carpeta donde el programa puede escribir.
- Lo que sea más eficiente y confiable queda a criterio del constructor (Jesús lo pidió así): por ejemplo, una carpeta superpuesta en `userData` con un cargador mínimo, o reemplazo atómico de `resources/app`.

### 6. Carpeta de clientes en el escritorio
- El CRM crea en el escritorio la carpeta **«Clientes CRM HERMES»** con ícono propio: carpeta terracota con la H de HERMES en un círculo crema (maqueta `carpeta-y-siete.html`). Se hace con `desktop.ini` + un `.ico` que viene con el programa. Si la borran, se vuelve a crear con la siguiente descarga.
- Dentro, una subcarpeta por cliente: `Nombre Apellido (+56 9 XXXX XXXX)`. Si cambia el nombre del contacto, se sigue usando la carpeta existente (se identifica por teléfono).
- **Qué se guarda**: solo lo que Jesús descarga a propósito desde WhatsApp (botón descargar o abrir un documento que dispara descarga). Ver una foto o un PDF sin descargar no guarda nada. Así se cumple «no todos los documentos hay que descargarlos».
- **De qué cliente es**: el chat abierto en ese momento en la vista de WhatsApp. Si ese chat no es un contacto del CRM, va a la subcarpeta `Sin asignar`.
- Al guardar aparece un aviso «Guardado en la carpeta de María Pérez» con un botón **«Mover a Descargas»** para cuando era un archivo que no corresponde.
- Si el nombre de archivo ya existe, se agrega « (2)», « (3)».
- **Ficha**: bloque «Documentos (N)» con la lista (nombre y fecha; clic abre el archivo) y botón «Abrir carpeta».
- Solo descargas de la vista de WhatsApp; el Cotizador y otras descargas siguen yendo a donde iban.

### 7. Venta cerrada: felicitaciones y anualidad
- Al mover un lead a **Ingresado** (en Pipeline, ficha o donde se cambie la etapa a mano):
  1. **Tarjeta al centro** con confeti (pantalla oscurecida, tarjeta que salta): «¡Felicitaciones! María Pérez ya es tu cliente en Colmena», y «Su anualidad cuenta desde hoy, DD-MM-AAAA. Te aviso un mes antes del DD-MM-AAAA». Botón «¡Vamos!».
  2. **Al cerrarla**, baja la **franja verde** arriba con confeti suave («¡Venta cerrada! María Pérez · Colmena · anualidad desde hoy») que se va sola a los 5 segundos.
  - Maqueta: `felicitaciones-anualidad.html`.
- **Anualidad**: empieza el día que pasa a Ingresado. Si sale de Ingresado y vuelve, no se celebra ni reinicia de nuevo si ya tenía anualidad vigente (decisión del diseñador: evita celebraciones por error al arrastrar). Leads que ya están en Ingresado al instalar la 4.3.0 (decisión del diseñador): anualidad desde `ingreso_fecha` si tiene (la escribía la 4.0.x al pasar a Ingresado); **no** se usa `etapa_fecha`, porque la migración de 4.0.0 la llenó con la fecha de la última edición. Sin `ingreso_fecha`, la ficha muestra «Sin anualidad» y un botón «Fijar anualidad» con fecha a elegir. Solo cambios de etapa hechos a mano llegan a Ingresado (los automáticos `moverEtapaSi` solo mueven a Contactado/Respondió), así que la celebración y el inicio de la anualidad van en el cambio de etapa manual.
- **Ficha, bloque «Anualidad»**: desde / aniversario, barrita de avance, «Faltan N meses · te aviso el DD-MM-AAAA», botón «↻ Renovar anualidad» e historial.
- **Renovar anualidad**: ventana con motivo (Apertura de cartera / Cambio de plan / Otro motivo… con texto libre), nueva fecha de inicio (por defecto hoy) e Isapre nueva (opcional; si se llena, actualiza la Isapre del contacto). Al renovar: la cuenta parte de la nueva fecha y el historial anota «DD-MM-AAAA · Renovada por <motivo> (<Isapre>)».
- **Aviso del aniversario**: 30 días antes, un recordatorio normal del CRM para Jesús: «Aniversario de María Pérez (Colmena): revisar su plan». **Sin mensaje al cliente.** Al renovar, el recordatorio pendiente se mueve. Cada año se crea el del año siguiente.
- **Se renueva sola cada año** (Jesús eligió esto): al llegar el aniversario, la cuenta parte de nuevo desde esa fecha (mismo día y mes, año siguiente) y se crea el aviso del año siguiente. Nunca queda «vencida». «Renovar anualidad» es solo para cuando la fecha cambia (apertura de cartera, cambio de plan, otro). El historial anota las renovaciones automáticas y las manuales.
- **Inicio**: «Aniversarios de este mes» con los clientes cuyo aniversario cae en el mes.

### 8. El 7% en la ficha
- Usa el campo **renta** que ya existe en el contacto. Debajo muestra **«Su 7%: $ 105.000 · 2,66 UF»**. Solo eso, sin comparaciones ni planes.
- La renta ya se guarda como número (`rentaNum` en db.js toma el primer valor si venía un rango). El 7% se calcula sobre ese número tal cual; si Jesús corrige la renta en la ficha, el 7% se actualiza. Sin renta, no se muestra (decisión del diseñador).
- **UF**: de mindicador.cl, el **valor del día 5 de cada mes**, fijo hasta el 5 del mes siguiente. Si el día 5 el CRM está cerrado o sin internet, se pide el valor del día 5 en cuanto se pueda. Sin conexión se usa el último guardado. Del 1 al 4 de cada mes rige la UF del 5 del mes anterior.
- **Tope imponible**: 90 UF por defecto, editable a mano en Configuración (Jesús lo ajusta cuando cambie). Si la renta pasa el tope, el 7% se calcula sobre el tope: nunca más que el 7% de 90 UF. La ficha lo indica con «(tope 90 UF)».
- En Configuración se ve la UF vigente y su fecha.

### 9. Etiquetas propias y filtros guardados
- Etiquetas libres por contacto («2 cargas», «embarazo», «Fonasa → Isapre»): se agregan y quitan en la ficha, con color de una paleta corta. Una lista común para reutilizar.
- Se ven como chips en la ficha y en las tarjetas de la Pipeline.
- Filtro por etiqueta en la Pipeline y al elegir destinatarios de un envío masivo.
- **Filtros guardados**: en la Pipeline, guardar la combinación de filtros actual con un nombre y volver a ella con un clic.
- (Alcance decidido por el diseñador; Jesús aprobó la idea, no el detalle.)

### 10. Versión y novedades
- `version` 4.3.0, entrada en `NOVEDADES`, ayudas que nombran atajos/campanita al día.

## Qué no entra
- Respuestas rápidas con «/» (descartado).
- Lista de documentos requeridos, seguimiento del trámite, qué anuncio vende, meta mensual (descartados).
- Licencias (aparte).
- Integraciones del Cotizador con el lead (para después).

## Restricciones
- Todo en español, textos simples y directos.
- No tocar `userData`, `appId`, repo de actualizaciones, `asar: false`, whatsapp-web.js 1.34.7 y sus parches.
- Servidor solo en 127.0.0.1, detrás del PIN.
- TDD con `node:test` (`npm test`); probar en Electron de prueba con `appData` apartado, nunca con los datos reales.
- No commit/push/release sin pedirlo Jesús.

## Enfoques considerados
- **Actualizaciones**: (A) paquete liviano + instalador completo cuando hace falta — **elegido**, porque casi todas las versiones solo cambian pantallas y lógica. (B) mejorar la descarga diferencial del instalador: menos trabajo, pero sigue reinstalando todo y bajando de más.
- **Documentos**: (A) chat abierto decide el cliente, con «Sin asignar» y «Mover a Descargas» — **elegido**. (B) preguntar en cada descarga — descartado: demasiados clics.
- **UF**: (A) mindicador.cl, gratis y sin registro — **elegido**. (B) API CMF: requiere clave.
- **Automático**: seguir a Windows (Windows no cambia solo por hora) vs. por horario — **por horario**, porque el oscuro es para la noche.

## Lo que queda al constructor
Mecanismo exacto de aplicación del paquete liviano, cómo leer el chat activo de WhatsApp, dónde va la barrita de descarga, tonos finos de los temas, nombres de tablas/columnas, estructura de etiquetas.
