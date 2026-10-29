# CRM HERMES (antes CRM MAX / Enviador WhatsApp) · Conecta Salud

Programa de escritorio (Electron) para Windows: CRM de leads de Isapre con WhatsApp Web integrado, pipeline, envíos masivos, leads de Meta y mensajes automáticos. Usuario: Jesús Bustamante. Todo en español, textos simples y directos.

Versión actual publicada: **4.3.3** (código de esta carpeta).

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `arranque.js` | Punto de entrada: abre la versión liviana guardada en `userData/liviana/` si es compatible; si no, `main.js` instalado |
| `main.js` | Proceso principal Electron: ventana, vistas de WhatsApp y Cotizador (WebContentsView), bandeja, avisos de Windows, tema de la barra de título, descargas a la carpeta del cliente, actualizaciones (liviana o electron-updater) |
| `preload.js` | Expone `window.crmNativo` (ubicar las vistas de WhatsApp y Cotizador, avisar el tema) |
| `server.js` | Servidor Express local (127.0.0.1, puerto aleatorio): API, cola de envíos, secuencias, programados, agendados, llamadas, anualidad, documentos, UF, métricas, conexión whatsapp-web.js |
| `db.js` | SQLite con sql.js (`datos/crm.db`), esquema, migraciones (`ensure`), valores por defecto (`DEFAULTS`) |
| `meta.js` | Leads de formularios de Facebook/Instagram |
| `temas.js`, `uf.js`, `anualidad.js`, `documentos.js`, `liviana.js`, `carriles.js`, `llamadas.js`, `tandas.js` | Lógica pura con pruebas en `test/` (temas, UF del día 5 y 7%, anualidad, carpeta de documentos, actualización liviana, cola, llamadas, grupos) |
| `auth.js` | PIN de 4 dígitos, sesión, código de recuperación |
| `public/` | Interfaz (index.html, app.js, app.css, fuentes Cinzel/Jost locales, logo) |
| `build/` | Íconos (`carpeta.ico` se crea con `crear-icono-carpeta.js`), `afterPack.js` (ícono y versión del .exe con resedit), `aplicar-parches.js`, `parches/` y `liviana.js` (huella y paquete liviano) |

## Reglas importantes (no romper)

- `userData` está forzado a `%APPDATA%\Enviador WhatsApp` (ahí viven la sesión de WhatsApp, `datos/crm.db`, `preferencias.json`). No cambiar: perdería los datos del usuario.
- `appId` = `cl.conectasalud.enviador` y el repo de actualizaciones `Sestakova/crm-max`: no cambiar.
- `asar: false` a propósito.
- whatsapp-web.js está fijo en **1.34.7** con parches locales (`build/parches`). `npm install` los aplica solo (postinstall). Si se actualiza la librería, revisar los parches.
- WhatsApp corre dentro de la ventana; whatsapp-web.js se conecta a esa misma vista por el puerto de depuración (`remote-debugging-port 0`, archivo `DevToolsActivePort`).
- Seguridad del servidor: solo acepta Host 127.0.0.1/localhost con su puerto; rutas sensibles a mayúsculas; todo detrás del PIN.
- Cola: prioridad agendado > meta > seguimientos > masivo. Pausas separadas: «Pausar» en Envíos (`cola_pausada`) solo detiene masivos/programados; los seguimientos y el Mensaje 1 de Meta se pausan y cancelan en Automáticos (`auto_pausada`). Los agendados no respetan horario ni límite diario. Tipos `manual`, `fuera_horario`, `agendado`, `resumen` no cuentan para el máximo diario.

## Comandos

```
npm install        # instala y aplica parches
npm start          # abre el programa en modo desarrollo
npm run build      # crea dist/Instalar-CRM-HERMES.exe, .blockmap y latest.yml
```

## Publicar una versión

1. Subir `version` en `package.json` y agregar la entrada en `NOVEDADES` (public/app.js).
2. `npm run build` (también escribe `huella.json` y arma el paquete liviano).
3. Crear la release `vX.Y.Z` en https://github.com/Sestakova/crm-max/releases/new y subir los 5 archivos de `dist/`: `Instalar-CRM-HERMES.exe`, `Instalar-CRM-HERMES.exe.blockmap`, `latest.yml`, `CRM-HERMES-liviana.gz` y `liviana.json`.
4. Los programas instalados revisan cada 30 min (o Configuración → Buscar ahora). Si la huella coincide (no cambió Electron, ninguna dependencia ni los parches) bajan solo el paquete liviano (pocos MB); si no, el instalador completo. Una barrita arriba muestra el avance y el botón «Reiniciar y actualizar» cierra todo y vuelve a abrir.
5. Las livianas sirven desde la 4.3.0 instalada en adelante (`arranque.js` elige entre la liviana guardada en `userData/liviana/` y la instalada; si la liviana no abre, vuelve sola a la instalada).

## Pendiente / ideas acordadas

- Más adelante: cotización en PDF, notas por lead, exportar a Excel, respaldo automático, integrar el Cotizador con el lead, licencias.
