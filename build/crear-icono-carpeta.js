// Crea build/carpeta.ico: carpeta terracota con la H de HERMES en un círculo crema (ícono de «Clientes CRM HERMES»)
// Uso: node build/crear-icono-carpeta.js   (solo hace falta volver a correrlo si cambia el dibujo)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const OSCURA = hex('#8A3A22'), TERRA = hex('#B4472C'), BORDE = hex('#C65A3D'), CREMA = hex('#F6ECDA'), VERDE = hex('#2F4A3C');

// Dibujo en un lienzo de 64 × 64 unidades: devuelve el color del punto (x, y) o null si es transparente
function color(x, y) {
  const enRect = (x0, y0, w, h, r) => {
    if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false;
    const cx = Math.min(Math.max(x, x0 + r), x0 + w - r), cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const dc = Math.hypot(x - 32, y - 40);
  if (dc <= 13) {
    // H: dos barras verticales y una horizontal
    const enH = (x >= 25 && x <= 28.6 && y >= 31.5 && y <= 48.5) || (x >= 35.4 && x <= 39 && y >= 31.5 && y <= 48.5) || (x >= 25 && x <= 39 && y >= 38.3 && y <= 41.7);
    return enH ? VERDE : CREMA;
  }
  if (enRect(3, 19, 58, 40, 5)) return y < 24 ? BORDE : TERRA;
  // pestaña de la carpeta
  if (enRect(3, 9, 58, 16, 5) && (x <= 24 || y >= 15 || (y >= 9 + (x - 24) && x <= 30))) return OSCURA;
  return null;
}

function png(n) {
  const S = 4, filas = [];
  for (let py = 0; py < n; py++) {
    const fila = Buffer.alloc(1 + n * 4);
    for (let px = 0; px < n; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = color(((px + (sx + 0.5) / S) / n) * 64, ((py + (sy + 0.5) / S) / n) * 64);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const o = 1 + px * 4;
      if (a) { fila[o] = Math.round(r / a); fila[o + 1] = Math.round(g / a); fila[o + 2] = Math.round(b / a); fila[o + 3] = Math.round((a / (S * S)) * 255); }
    }
    filas.push(fila);
  }
  const crcT = new Int32Array(256).map((_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const trozo = (tipo, datos) => { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr), trozo('IDAT', zlib.deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}

const tam = [256, 48, 32, 16], imgs = tam.map(png);
const cab = Buffer.alloc(6); cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(tam.length, 4);
let off = 6 + 16 * tam.length;
const dir = tam.map((n, i) => { const e = Buffer.alloc(16); e[0] = n >= 256 ? 0 : n; e[1] = n >= 256 ? 0 : n; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(imgs[i].length, 8); e.writeUInt32LE(off, 12); off += imgs[i].length; return e; });
fs.writeFileSync(path.join(__dirname, 'carpeta.ico'), Buffer.concat([cab, ...dir, ...imgs]));
console.log('build/carpeta.ico listo');
