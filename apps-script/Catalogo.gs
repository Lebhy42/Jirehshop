/**
 * Catálogo y apartados de Jireh shop.
 *
 * Es un archivo NUEVO dentro del mismo proyecto de Apps Script donde ya está Code.gs
 * (Extensiones > Apps Script > "+" > Secuencia de comandos > nómbralo Catalogo).
 * No cambia nada de Code.gs: usa el mismo PIN de la tienda (pinOk) y las mismas clientas.
 *
 * Guarda:
 *  - Las fotos en una carpeta de Google Drive ("Catálogo Jireh shop (fotos)"), visibles con el enlace.
 *  - Los productos en la pestaña "Catalogo".
 *  - Los apartados en "Apartados" y cada abono en "Abonos".
 *
 * Después de pegarlo: Implementar > Gestionar implementaciones > (lápiz) > Versión: Nueva versión > Implementar.
 * Google pedirá permiso para usar Drive (para guardar las fotos). La dirección /exec no cambia.
 */

const APARTADO_PCT = 30;    // % mínimo para apartar (igual que en index.html)
const APARTADO_DIAS = 21;   // días para liquidar (igual que en index.html)

const HOJA_CATALOGO = 'Catalogo';
const HOJA_APARTADOS = 'Apartados';
const HOJA_ABONOS = 'Abonos';
const CARPETA_FOTOS = 'Catálogo Jireh shop (fotos)';
const COLS_CAT = ['id', 'nombre', 'categoria', 'precio', 'oferta', 'tallas', 'fotos', 'descripcion', 'estado', 'alta', 'actualizado'];
const COLS_AP = ['id', 'cliente', 'nombre', 'tel', 'prenda', 'total', 'pagado', 'alta', 'limite', 'estado', 'actualizado'];
const COLS_ABONO = ['fecha', 'abono', 'apartado', 'cliente', 'nombre', 'monto', 'saldo'];
const ESTADOS = ['disponible', 'agotado', 'oculto'];
const MAX_FOTO = 3 * 1024 * 1024;

// La página manda el catálogo y los apartados por POST (las fotos no caben en la dirección)
function doPost(e) {
  let res;
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = ACCIONES_CATALOGO[p.action];
    res = fn ? fn(p) : { ok: false, error: 'Acción no válida.' };
  } catch (err) {
    res = { ok: false, error: 'Error en el servidor. Inténtalo otra vez.' };
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

const SIN_PIN = { ok: false, error: 'PIN incorrecto.' };

const ACCIONES_CATALOGO = {
  /* ---------- catálogo ---------- */
  catalogo(p) {
    const duena = pinOk(p.pin);
    const productos = leerCatalogo().filter(x => duena || x.estado !== 'oculto').map(pubProd);
    return { ok: true, duena, productos };
  },

  subirFoto(p) {
    if (!pinOk(p.pin)) return SIN_PIN;
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(p.foto || ''));
    if (!m) return { ok: false, error: 'La foto no es válida.' };
    const bytes = Utilities.base64Decode(m[2]);
    if (bytes.length > MAX_FOTO) return { ok: false, error: 'La foto es demasiado grande.' };
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const archivo = carpetaFotos().createFile(Utilities.newBlob(bytes, 'image/' + m[1], 'jireh-' + Date.now() + '.' + ext));
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, foto: archivo.getId() };
  },

  guardarProducto(p) {
    if (!pinOk(p.pin)) return SIN_PIN;
    const d = p.producto || {};
    const id = String(d.id || '');
    if (!/^P-[A-Z0-9]{4,12}$/.test(id)) return { ok: false, error: 'Producto no válido.' };
    const nombre = texto(d.nombre, 60);
    const precio = Math.round(Number(d.precio));
    const oferta = Math.round(Number(d.oferta)) || '';
    if (!nombre) return { ok: false, error: 'Escribe el nombre de la prenda.' };
    if (!(precio > 0)) return { ok: false, error: 'Escribe el precio.' };
    if (oferta && oferta >= precio) return { ok: false, error: 'El precio de oferta debe ser menor que el precio normal.' };
    const prod = {
      id, nombre, precio, oferta,
      categoria: texto(d.categoria, 30),
      tallas: (Array.isArray(d.tallas) ? d.tallas : []).map(t => texto(t, 12).replace(/,/g, ' ')).filter(Boolean).slice(0, 15),
      fotos: (Array.isArray(d.fotos) ? d.fotos : []).map(String).filter(f => /^[\w-]{10,}$/.test(f)).slice(0, 6),
      descripcion: texto(d.descripcion, 300),
      estado: ESTADOS.indexOf(d.estado) >= 0 ? d.estado : 'disponible',
    };
    return conCandado(() => {
      const ahora = new Date().toISOString();
      const existe = leerCatalogo().find(x => x.id === id);
      prod.alta = existe ? existe.alta : ahora;
      prod.actualizado = ahora;
      const fila = COLS_CAT.map(k => k === 'tallas' ? prod.tallas.join(', ') : k === 'fotos' ? prod.fotos.join(',') : celda(prod[k]));
      const h = hoja2(HOJA_CATALOGO, COLS_CAT);
      if (existe) h.getRange(existe.fila, 1, 1, COLS_CAT.length).setValues([fila]);
      else h.appendRow(fila);
      // las fotos que quitó la dueña se mandan a la papelera de Drive
      if (existe) existe.fotos.filter(f => prod.fotos.indexOf(f) < 0).forEach(papelera);
      return { ok: true, producto: pubProd(prod) };
    });
  },

  borrarProducto(p) {
    if (!pinOk(p.pin)) return SIN_PIN;
    return conCandado(() => {
      const x = leerCatalogo().find(y => y.id === String(p.id || ''));
      if (!x) return { ok: true };
      hoja2(HOJA_CATALOGO, COLS_CAT).deleteRow(x.fila);
      x.fotos.forEach(papelera);
      return { ok: true };
    });
  },

  /* ---------- apartados y abonos ---------- */
  apartados(p) {
    if (!pinOk(p.pin)) return SIN_PIN;
    const cliente = String(p.cliente || '');
    const xs = leerApartados().filter(a => cliente ? a.cliente === cliente : a.estado === 'abierto');
    return { ok: true, apartados: conAbonos(xs).map(a => pubAp(a, true)) };
  },

  // para la tarjeta de la clienta: solo sus apartados abiertos y sin teléfono
  misApartados(p) {
    const c = buscar(leer(), p.id);
    if (!c) return { ok: false, error: 'No encontramos esa tarjeta.' };
    const xs = leerApartados().filter(a => a.cliente === c.id && a.estado === 'abierto');
    return { ok: true, apartados: conAbonos(xs).map(a => pubAp(a)) };
  },

  nuevoApartado(p) {
    if (!pinOk(p.pin)) return SIN_PIN;
    const d = p.apartado || {};
    const id = String(d.id || '');
    if (!/^A-[A-Z0-9]{4,12}$/.test(id)) return { ok: false, error: 'Apartado no válido.' };
    const prenda = texto(d.prenda, 80);
    const total = Math.round(Number(d.total));
    const anticipo = Math.round(Number(d.anticipo));
    if (!prenda) return { ok: false, error: 'Escribe qué prenda se aparta.' };
    if (!(total > 0)) return { ok: false, error: 'Escribe el precio total.' };
    if (!(anticipo >= 0) || anticipo > total) return { ok: false, error: 'El anticipo no puede ser mayor que el precio.' };
    return conCandado(() => {
      const ya = leerApartados().find(a => a.id === id);  // reintento por mala señal: no se duplica
      if (ya) return { ok: true, apartado: pubAp(conAbonos([ya])[0], true) };
      const c = buscar(leer(), d.cliente);
      if (!c) return { ok: false, error: 'No encontramos a la clienta.' };
      const alta = new Date();
      const a = {
        id, cliente: c.id, nombre: c.nombre, tel: c.tel, prenda, total, pagado: anticipo,
        alta: alta.toISOString(), limite: new Date(alta.getTime() + APARTADO_DIAS * 864e5).toISOString(),
        estado: anticipo >= total ? 'liquidado' : 'abierto', actualizado: alta.toISOString(),
      };
      hoja2(HOJA_APARTADOS, COLS_AP).appendRow(COLS_AP.map(k => k === 'tel' ? "'" + a.tel : celda(a[k])));
      if (anticipo > 0) registrarAbono(id, a, anticipo);
      return { ok: true, apartado: pubAp(conAbonos([a])[0], true) };
    });
  },

  abonar(p) {
    if (!pinOk(p.pin)) return SIN_PIN;
    const abonoId = String(p.abono || '');
    if (!/^B-[A-Z0-9]{4,12}$/.test(abonoId)) return { ok: false, error: 'Abono no válido.' };
    return conCandado(() => {
      const a = leerApartados().find(x => x.id === String(p.apartado || ''));
      if (!a) return { ok: false, error: 'No encontramos ese apartado.' };
      const repetido = leerAbonos().some(b => b.abono === abonoId);  // reintento: ya se guardó
      if (!repetido) {
        if (a.estado !== 'abierto') return { ok: false, error: 'Ese apartado ya no está abierto.' };
        const monto = Math.round(Number(p.monto));
        const saldo = a.total - a.pagado;
        if (!(monto > 0) || monto > saldo) return { ok: false, error: 'El abono debe ser de $1 a $' + saldo + '.' };
        a.pagado += monto;
        if (a.pagado >= a.total) a.estado = 'liquidado';
        guardarApartado(a);
        registrarAbono(abonoId, a, monto);
      }
      return { ok: true, apartado: pubAp(conAbonos([a])[0], true) };
    });
  },

  cancelarApartado(p) {
    if (!pinOk(p.pin)) return SIN_PIN;
    return conCandado(() => {
      const a = leerApartados().find(x => x.id === String(p.apartado || ''));
      if (!a) return { ok: false, error: 'No encontramos ese apartado.' };
      a.estado = 'cancelado';
      guardarApartado(a);
      return { ok: true, apartado: pubAp(conAbonos([a])[0], true) };
    });
  },
};

/* ---------- ayudantes ---------- */
function hoja2(nombre, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(nombre);
  if (!h) { h = ss.insertSheet(nombre); h.appendRow(cols); h.setFrozenRows(1); }
  return h;
}
function filas(nombre, cols) {
  return hoja2(nombre, cols).getDataRange().getValues().slice(1).map((r, i) => {
    const o = { fila: i + 2 };
    cols.forEach((k, j) => { o[k] = r[j] instanceof Date ? r[j].toISOString() : r[j]; });
    return o;
  });
}
function leerCatalogo() {
  return filas(HOJA_CATALOGO, COLS_CAT).filter(x => x.id).map(x => ({
    fila: x.fila, id: String(x.id), nombre: String(x.nombre), categoria: String(x.categoria || ''),
    precio: Number(x.precio) || 0, oferta: Number(x.oferta) || '',
    tallas: String(x.tallas || '').split(',').map(t => t.trim()).filter(Boolean),
    fotos: String(x.fotos || '').split(',').map(t => t.trim()).filter(Boolean),
    descripcion: String(x.descripcion || ''), estado: ESTADOS.indexOf(x.estado) >= 0 ? x.estado : 'disponible',
    alta: String(x.alta || ''), actualizado: String(x.actualizado || ''),
  }));
}
function pubProd(x) {
  return { id: x.id, nombre: x.nombre, categoria: x.categoria, precio: x.precio, oferta: x.oferta, tallas: x.tallas, fotos: x.fotos, descripcion: x.descripcion, estado: x.estado, alta: x.alta };
}
function leerApartados() {
  return filas(HOJA_APARTADOS, COLS_AP).filter(x => x.id).map(x => ({
    fila: x.fila, id: String(x.id), cliente: String(x.cliente), nombre: String(x.nombre), tel: String(x.tel).replace(/\D/g, ''),
    prenda: String(x.prenda), total: Number(x.total) || 0, pagado: Number(x.pagado) || 0,
    alta: String(x.alta || ''), limite: String(x.limite || ''), estado: String(x.estado || 'abierto'),
  }));
}
function leerAbonos() {
  return filas(HOJA_ABONOS, COLS_ABONO).map(x => ({ abono: String(x.abono), apartado: String(x.apartado), fecha: String(x.fecha), monto: Number(x.monto) || 0 }));
}
function conAbonos(xs) {
  const todos = leerAbonos();
  xs.forEach(a => { a.abonos = todos.filter(b => b.apartado === a.id).map(b => ({ fecha: b.fecha, monto: b.monto })); });
  return xs;
}
function guardarApartado(a) {
  const h = hoja2(HOJA_APARTADOS, COLS_AP);
  h.getRange(a.fila, COLS_AP.indexOf('pagado') + 1).setValue(a.pagado);
  h.getRange(a.fila, COLS_AP.indexOf('estado') + 1, 1, 2).setValues([[a.estado, new Date().toISOString()]]);
}
function registrarAbono(abonoId, a, monto) {
  hoja2(HOJA_ABONOS, COLS_ABONO).appendRow([new Date().toISOString(), abonoId, a.id, a.cliente, a.nombre, monto, a.total - a.pagado]);
}
function pubAp(a, conTel) {
  const t = { id: a.id, cliente: a.cliente, nombre: a.nombre, prenda: a.prenda, total: a.total, pagado: a.pagado, saldo: Math.max(0, a.total - a.pagado), alta: a.alta, limite: a.limite, estado: a.estado, abonos: a.abonos || [] };
  if (conTel) t.tel = a.tel;
  return t;
}
function carpetaFotos() {
  const it = DriveApp.getFoldersByName(CARPETA_FOTOS);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA_FOTOS);
}
function papelera(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
function texto(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }
// evita que un texto que empieza con = + - @ se tome como fórmula en la hoja
function celda(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }
