# Sección Cotizador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seventh section, «Cotizador», that shows panel.miscotizadores.cl embedded inside the CRM.

**Architecture:** Front-end only change in `public/`, plus the version bump.
- The new section is added to `SECS`/`VIEWS`/`SAT_DE`/`ATAJOS` in `public/app.js`, with a `<section class="view" id="v-cotizador">` in `index.html` that holds a full-size iframe.
- The iframe is created the first time the section is opened (`loadCotizador`) and is never re-created, so switching sections keeps the page as it was.
- The Inicio ring is generalized from 5 fixed angles to N evenly spaced satellites.

**Tech Stack:** Electron 38, plain JS/HTML/CSS in `public/`.

**Spec:** `docs/superpowers/specs/2026-10-27-seccion-cotizador-design.md`

## Global Constraints

- Every user-facing text is in simple Spanish.
- URL: `https://panel.miscotizadores.cl/dashboard`. The «Abrir en el navegador» button opens the same URL.
- Shortcut: `7`. Description: «Cotiza en miscotizadores sin salir del CRM · Atajo 7».
- Version: 4.2.0, with a `NOVEDADES['4.2.0']` entry.
- Do not change `userData`, `appId`, the update repo or `asar`.
- Do not publish or push without asking Jesús.

## Review Focus

- **Inicio with 6 satellites:** the ring, the threads and the polygon all use the same N points, and no circle overlaps the center at the minimum window size (1000×640).
- **Bottom bar with 7 circles at 1000 px wide:** the circles must not overlap the Métricas button or each other.
- **Switching sections and coming back:** the iframe keeps its page (no reload), and «Recargar» does reload it.
- **The CRM's own shortcuts while focus is inside the iframe:** keys go to the iframe, so Esc and 1–7 don't work until you click outside it. Expected and acceptable.

---

### Task 1: Sección Cotizador

**Files:**
- Modify: `public/app.js`:
  - `SECS` (~73): add the calculator entry after `auto`;
  - `VIEWS` (~81): add `{ id: 'cotizador', label: 'Cotizador', sub: () => 'Tu cuenta de miscotizadores dentro del CRM' }`;
  - `SAT_DE` (~92): add `cotizador: 'cotizador'`;
  - `layout()` (~108): angles for N satellites;
  - the `go()` loader map (~163): add `cotizador: loadCotizador`;
  - `ATAJOS` (~1492): add `7: 'cotizador'`;
  - `NOVEDADES` (~228): add the `'4.2.0'` entry.
- Modify: `public/index.html`: add `<section class="view" id="v-cotizador"><div class="cotiz" id="cotizCaja"></div></section>` after `v-auto`.
- Modify: `public/app.css`:
  - `#v-cotizador.on{display:flex;flex-direction:column;padding:0 12px 12px}`;
  - `.cotiz{flex:1;min-height:0;border-radius:var(--r2);overflow:hidden;border:1px solid var(--line);background:#fff}`;
  - `.cotiz iframe{width:100%;height:100%;border:0;display:block}`.
- Modify: `package.json`: `"version": "4.2.0"`.

**Interfaces:**
- `loadCotizador()`:
  - Paints `#headActions` with «Recargar» (`id="cotRec"`) and «Abrir en el navegador» (`id="cotNav"`).
  - If `#cotizCaja` has no iframe, it creates `<iframe src=URL title="Cotizador" allow="clipboard-read; clipboard-write">`.
  - «Recargar» reassigns `iframe.src = URL`.
  - «Abrir en el navegador» calls `window.open(URL, '_blank')`. `main.js` (~193) already sends it to the default browser.
- Calculator icon path for `SECS`: `'M6 3h12v18H6z M9 7h6 M9 11h1 M12 11h1 M15 11h0 M9 15h1 M12 15h1 M15 15h0 M9 18h6'`.

- [ ] **Step 1: Add the section** (SECS, VIEWS, SAT_DE, ATAJOS, loader, HTML, CSS).
- [ ] **Step 2: Generalize the ring.** In `layout()`, `const n = sats.length - 1; const pts = Array.from({ length: n }, (_, i) => -90 + (360 / n) * i).map(...)`, with everything else unchanged.
- [ ] **Step 3: Version and Novedades.** `package.json` 4.2.0 and `NOVEDADES['4.2.0'] = ['Nueva sección Cotizador: tu cuenta de miscotizadores dentro del CRM (atajo 7)']`.
- [ ] **Step 4: Verify.**
  - `node --check public/app.js` and `npm test` → 51/51 pass.
  - In the browser, against the test server (fake WhatsApp, PIN 1234):
    - the Inicio shows 6 evenly spaced circles;
    - the bar shows 7 circles at 1000 px with no overlap;
    - Cotizador loads the miscotizadores page;
    - switch to Envíos and back → the iframe is the same element (no reload);
    - «Recargar» works;
    - no console errors from the CRM.
- [ ] **Step 5: Commit** `git commit -m "Sección Cotizador con miscotizadores dentro del CRM (4.2.0)"`

Pending after build (not verifiable here): whether the miscotizadores login persists inside the iframe in the real program. Jesús checks it once installed. If it doesn't persist, switch to the own-view approach (spec, option A).
