// Ayuda para las pruebas: una base nueva y vacía en una carpeta temporal
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDb } = require('../db');

const carpetaNueva = () => fs.mkdtempSync(path.join(os.tmpdir(), 'crm-test-'));
async function baseNueva(carpeta = carpetaNueva()) { return openDb(carpeta); }
const esperarGuardado = () => new Promise((r) => setTimeout(r, 1700));   // db.js guarda al disco tras 1,5 s de calma

// Copia de normPhone de server.js (ahí vive dentro de start y no se puede importar)
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('560')) d = '56' + d.slice(3);
  if (d.length === 9 && d[0] === '9') d = '56' + d;
  if (d.length === 8) d = '569' + d;
  return /^569\d{8}$/.test(d) ? d : null;
}

module.exports = { baseNueva, carpetaNueva, esperarGuardado, normPhone };
