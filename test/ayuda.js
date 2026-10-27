// Ayuda para las pruebas: una base nueva y vacía en una carpeta temporal
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDb } = require('../db');

const carpetaNueva = () => fs.mkdtempSync(path.join(os.tmpdir(), 'crm-test-'));
async function baseNueva(carpeta = carpetaNueva()) { return openDb(carpeta); }
const esperarGuardado = () => new Promise((r) => setTimeout(r, 1700));   // db.js guarda al disco tras 1,5 s de calma

module.exports = { baseNueva, carpetaNueva, esperarGuardado };
