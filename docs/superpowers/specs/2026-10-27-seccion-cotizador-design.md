# Sección Cotizador · diseño corto

Fecha: 2026-10-27 · Cambio chico.

## Para qué

Jesús quiere cotizar en miscotizadores.cl sin salir del CRM. Por ahora es solo la página dentro de una sección nueva, sin conexión con los leads.

## Qué se construye

- Una séptima sección, **Cotizador**, en la barra de abajo, después de Automáticos.
  - Ícono de calculadora y descripción «Cotiza en miscotizadores sin salir del CRM · Atajo 7».
  - También aparece en el Inicio, junto a las demás secciones.
- Dentro de la sección va la página `https://panel.miscotizadores.cl/dashboard`, incrustada y ocupando todo el espacio.
  - Si no hay sesión iniciada, la misma página manda al login.
- La página se carga la primera vez que se abre la sección. Al cambiar a otra sección no se recarga, para no perder una cotización a medias.
- Arriba van dos botones chicos:
  - **Recargar**: vuelve a cargar la página.
  - **Abrir en el navegador**: abre miscotizadores en el navegador normal, por si algo no funciona incrustado.

## Formas consideradas

- **A. Vista propia como WhatsApp.** Tiene sesión garantizada y sirve de base para integrar más adelante, pero toca más el programa por dentro.
- **B. Página incrustada (iframe). ← elegida por Jesús.** Es lo más simple.
  - Revisado: miscotizadores no envía `X-Frame-Options` ni `Content-Security-Policy`, así que se deja incrustar. El servidor del CRM tampoco pone reglas que lo impidan.
- **C. Abrir en el navegador.** Saca a Jesús del CRM.

## Riesgo conocido

Falta comprobar en el programa real si el login se mantiene dentro de la página incrustada. Algunos sitios no envían su cookie de sesión dentro de un iframe de otro sitio.

Si no se mantiene, se avisa a Jesús y se cambia a la forma A. La sección, el botón y el ícono sirven igual.

## Decisiones mías (para revisar)

- La sección va en la barra y en el Inicio, con atajo 7.
- La URL de entrada es la del dashboard, no la del login: si la sesión está abierta entra directo.
- Se agregan los botones Recargar y Abrir en el navegador.
- La versión pasa a **4.2.0**, con su entrada en Novedades.

## Fuera de este cambio (ideas para después)

- Botón «Cotizar» en la ficha y en el chat.
- Ficha del lead al lado del cotizador, con botones para copiar sus datos.
- Atrapar el mensaje de WhatsApp que entrega el cotizador y enviarlo al lead: el lead pasa a «Cotización enviada» y queda un recordatorio a 2 días.
