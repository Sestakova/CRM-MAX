// Temas de color del CRM. Se usa en el programa (main.js) y en la pantalla (window.TEMAS)
(function (raiz) {
  const TEMAS = [
    { id: 'claro', nombre: 'Claro' },
    { id: 'invertido', nombre: 'Invertido' },
    { id: 'oscuro', nombre: 'Oscuro' },
    { id: 'auto', nombre: 'Automático' }
  ];
  // Colores de la barra de título de Windows (la dibuja Windows, no la página)
  const BARRA = {
    claro: { color: '#2F4A3C', symbolColor: '#F6ECDA' },
    invertido: { color: '#B4472C', symbolColor: '#FBEDE7' },
    oscuro: { color: '#221E1A', symbolColor: '#ECE2D2' }
  };
  // Fondo de la ventana mientras carga (evita un destello claro de noche)
  const FONDO = { claro: '#FBF7F0', invertido: '#2F4A3C', oscuro: '#181512' };
  const svg = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONO = {
    claro: svg('<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
    invertido: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>'),
    oscuro: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    auto: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9 16l3-8 3 8M10.1 13.2h3.8"/>')
  };
  const AUTO = { oscuro: '20:00', claro: '07:00' };
  const minutos = (hhmm, def) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? +m[1] * 60 + +m[2] : def; };

  // Qué colores se ven ahora: el automático es oscuro entre «oscuro» y «claro» (cruzando o no la medianoche)
  function temaEfectivo(tema, ahora = new Date(), auto = AUTO) {
    if (tema === 'invertido' || tema === 'oscuro' || tema === 'claro') return tema;
    if (tema !== 'auto') return 'claro';
    const o = minutos(auto && auto.oscuro, 20 * 60), c = minutos(auto && auto.claro, 7 * 60);
    const t = ahora.getHours() * 60 + ahora.getMinutes();
    const oscuro = o > c ? t >= o || t < c : t >= o && t < c;
    return oscuro ? 'oscuro' : 'claro';
  }

  const api = { TEMAS, BARRA, FONDO, ICONO, AUTO, temaEfectivo };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.TEMAS = api;
})(typeof window !== 'undefined' ? window : this);
