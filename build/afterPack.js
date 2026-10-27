// Aplica ícono, nombre y versión al ejecutable de Windows sin necesitar Wine
const fs = require('fs');
const path = require('path');
module.exports = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const R = ResEdit.default || ResEdit;
  const pkg = context.packager.appInfo;
  const exe = path.join(context.appOutDir, pkg.productFilename + '.exe');
  const data = fs.readFileSync(exe);
  const pe = R.NtExecutable.from(data, { ignoreCert: true });
  const res = R.NtExecutableResource.from(pe);
  const ico = R.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const grupos = R.Resource.IconGroupEntry.fromEntries(res.entries);
  const id = grupos.length ? grupos[0].id : 1, lang = grupos.length ? grupos[0].lang : 1033;
  R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map((i) => i.data));
  const vi = R.Resource.VersionInfo.fromEntries(res.entries)[0];
  const v = pkg.version.split('.').map((n) => parseInt(n) || 0);
  vi.setFileVersion(v[0], v[1], v[2], 0, 1033); vi.setProductVersion(v[0], v[1], v[2], 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: pkg.productName, ProductName: pkg.productName, InternalName: pkg.productName,
    OriginalFilename: pkg.productFilename + '.exe', CompanyName: 'Conecta Salud', LegalCopyright: '© ' + new Date().getFullYear() + ' Conecta Salud'
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • ícono y datos aplicados a', path.basename(exe));
};
