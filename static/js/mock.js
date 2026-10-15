/* =====================================================================================
   Mockup estático: sustituye al servidor. Intercepta las llamadas a /api/… y responde con datos de
   demostración (datos/demo.json, todos ficticios). Las consultas nuevas del portal reciben una
   respuesta de ejemplo; los cambios de configuración del backoffice no se guardan.
   ===================================================================================== */
(function(){
'use strict';
var fetchReal = window.fetch.bind(window);
var D = null, ESTADO = { chats: {}, vistas: {}, canal: {}, trabajos: {}, usuarios: {} };
var listo = fetchReal('datos/demo.json').then(function(r){ return r.json(); }).then(function(d){ D = d; return d; });
var CLAVE = 'demo1234';
var EMAIL_ROL = { 'cliente@demo.es': 'cliente', 'abogado@demo.es': 'abogado', 'gestor@demo.es': 'gestor', 'javier@demo.es': 'javier', 'marta@demo.es': 'marta' };
var AVISO = 'Mockup estático: este cambio no se guarda. En la aplicación real se aplicaría al momento.';

function copia(x){ return x == null ? x : JSON.parse(JSON.stringify(x)); }
function resp(status, body){
  return new Response(JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } });
}
function error(status, mensaje, comoObjeto){ return resp(status, { detail: comoObjeto ? { mensaje: mensaje } : mensaje }); }
function ahora(){ var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); }
function hex(n){ var s = ''; while (s.length < n) s += Math.floor(Math.random() * 16).toString(16); return s; }

/* ---------- sesión ---------- */
function rolDe(init){
  var h = (init && init.headers) || {};
  var a = h.Authorization || h.authorization || '';
  var m = /^Bearer demo-([a-z0-9]+)$/.exec(a);
  return m ? m[1] : null;
}
function snap(path, rol){
  var e = D[path]; if (!e) return null;
  var r = e[rol] || (rol && rol.indexOf('nuevo') === 0 ? null : null);
  return r ? copia(r) : null;
}
function usuarioDe(rol){
  if (ESTADO.usuarios[rol]) return ESTADO.usuarios[rol];
  var email = Object.keys(EMAIL_ROL).find(function(e){ return EMAIL_ROL[e] === rol; });
  return email ? D._logins[email] : null;
}

/* ---------- portal del cliente (con estado en memoria) ---------- */
function listaChats(rol){
  if (!ESTADO.chats[rol]){
    var s = snap('/api/chats', rol);
    ESTADO.chats[rol] = s && s.status === 200 ? s.body : { chats: [], expedientes: [] };
  }
  return ESTADO.chats[rol];
}
function vista(rol, id){
  var k = rol + '/' + id;
  if (!ESTADO.vistas[k]){ var s = snap('/api/chats/' + id, rol); if (!s || s.status !== 200) return null; ESTADO.vistas[k] = s.body; }
  return ESTADO.vistas[k];
}
function resumenChat(v){
  var preg = v.mensajes.filter(function(m){ return m.rol === 'usuario'; });
  return { id: v.id, numero: v.numero, titulo: v.titulo, actualizado: v.actualizado, creado: v.creado, fijado: !!v.fijado, expediente_id: v.expediente_id || null,
           mensajes: preg.length, documentos: (v.documentos || []).length, ultima_pregunta: preg.length ? preg[preg.length - 1].texto : '' };
}
function actualizarLista(rol, v){
  var l = listaChats(rol), i = l.chats.findIndex(function(c){ return c.id === v.id; });
  var r = resumenChat(v);
  if (i >= 0) l.chats.splice(i, 1);
  l.chats.unshift(r);
}
var contador = 100;
function nuevoChat(rol, titulo, expId){
  var t = ahora(), id = hex(12);
  var v = { id: id, numero: 'CON-2026-' + String(++contador).padStart(6, '0'), titulo: titulo || 'Nueva consulta', cliente_id: (usuarioDe(rol) || {}).id || null,
            creado: t, actualizado: t, fijado: false, expediente_id: expId || null, expediente: null, mensajes: [], documentos: [], memoria: {}, revision: {} };
  ESTADO.vistas[rol + '/' + id] = v; actualizarLista(rol, v);
  return v;
}
function claveTema(q){
  var n = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/cerradura|casero|inquilin|desahuc|desaloj/.test(n)) return 'cerradura';
  if (/fianza|alquiler|piso|arrend|propietari/.test(n)) return 'fianza';
  if (/pension|alimentos|custodia|divorci|expareja|hijos/.test(n)) return 'pension';
  return 'despid';
}
var FASES = ['Entendiendo tu consulta', 'Buscando resoluciones de los tribunales', 'Leyendo las resoluciones más relevantes', 'Redactando la respuesta'];
function sondearTrabajo(rol, id){
  var t = ESTADO.trabajos[id];
  if (!t) return error(404, 'No existe.');
  var pasado = Date.now() - t.inicio, total = 4200;
  if (pasado < total){
    var fase = FASES[Math.min(FASES.length - 1, Math.floor(pasado / (total / FASES.length)))];
    return resp(200, { id: id, existe: true, terminado: false, estado: 'en_curso', fase: fase });
  }
  if (!t.resultado){
    var r = copia(D._respuestas[claveTema(t.query)]);
    r.correlation_id = id; r.case_id = t.v.numero;
    var ts = ahora();
    t.v.mensajes.push({ rol: 'usuario', texto: t.query, ts: ts });
    t.v.mensajes.push({ rol: 'asistente', respuesta: copia(r), ts: ts });
    t.v.actualizado = ts;
    if (!t.v.titulo || t.v.titulo === 'Nueva consulta') t.v.titulo = t.query.length > 70 ? t.query.slice(0, 69) + '…' : t.query;
    actualizarLista(rol, t.v);
    r.chat = copia(t.v);
    r.aviso_demo = true;
    t.resultado = r;
  }
  return resp(200, { id: id, existe: true, terminado: true, estado: 'completado', fase: 'Respuesta lista', resultado: copia(t.resultado) });
}
function canal(rol){
  if (!ESTADO.canal[rol]){ var s = snap('/api/mensajes', rol); ESTADO.canal[rol] = s && s.status === 200 ? s.body : { mensajes: [], sin_leer: 0, despacho: 'Despacho Demo' }; }
  return ESTADO.canal[rol];
}

/* ---------- modelo económico (mismas fórmulas que el servidor, para los simuladores) ---------- */
function r2(x){ return Math.round((x + 1e-9) * 100) / 100; }
function comision(base, co, unico){ return base * (1 + co.iva_pct / 100) * (unico ? co.pago_unico_pct : co.cobro_pct) / 100 + co.cobro_fijo; }
function margen(base, consultas, co, unico, cc){
  cc = cc == null ? co.coste_consulta : cc;
  var com = comision(base, co, unico), coste = consultas * cc, b = base - com - coste;
  return { importe: r2(base), con_iva: r2(base * (1 + co.iva_pct / 100)), comision: r2(com), coste_consultas: r2(coste), beneficio: r2(b), margen_pct: base > 0 ? Math.round(1000 * b / base) / 10 : null };
}
function precioMinimo(n, co, unico){ var pct = (unico ? co.pago_unico_pct : co.cobro_pct) / 100; return r2((n * co.coste_consulta + co.cobro_fijo) / (1 - co.margen_minimo_pct / 100 - pct * (1 + co.iva_pct / 100))); }
function importePeriodo(p, per){ return r2(p * per.meses * (1 - (per.descuento_pct || 0) / 100)); }
function num(v){ return Number(String(v == null ? '' : v).replace(',', '.')) || 0; }
function simularPlan(d, cfg){
  var co = cfg.costes, min = co.margen_minimo_pct, precio = num(d.precio), c = d.consultas || {};
  if (!d.nombre || String(d.nombre).trim().length < 2) throw new Error('Escribe el nombre del plan.');
  if (precio < 0.5) throw new Error('«Precio base» no puede ser menor que 0,5.');
  var conIva = r2(precio * (1 + co.iva_pct / 100));
  if (d.tipo === 'pago_unico'){
    var t = num(c.total) || 1, peor = t + num(c.aclaraciones);
    var filas = [[t, t + ' consulta'], [peor, peor + ' consultas (con aclaraciones)']].map(function(x){
      var m = margen(precio, x[0], co, true); return Object.assign({ id: 'u' + x[0], nombre: 'Pago único · ' + x[1], meses: null, consultas: x[0] }, m, { ok: m.margen_pct >= min }); });
    return { periodos: filas, precio_minimo: precioMinimo(peor, co, true), minimo_pct: min, ok: filas.every(function(f){ return f.ok; }), con_iva_mes: conIva, por_consulta: conIva,
             escenarios: co.curva.map(function(p){ return { consultas_anuales: p.consultas_anuales, coste: p.coste, margen_pct: margen(precio, peor, co, true, p.coste).margen_pct }; }) };
  }
  var mes = num(c.mes), dia = num(c.dia), sem = num(c.semana);
  if (!(dia <= sem && sem <= mes)) throw new Error('Los topes tienen que cumplir: al día ≤ a la semana ≤ al mes.');
  var per = cfg.periodos.filter(function(p){ return (d.periodos || []).indexOf(p.id) >= 0; });
  if (!per.length) throw new Error('Activa al menos un periodo de pago.');
  var filas2 = per.map(function(p){ var imp = importePeriodo(precio, p), m = margen(imp, mes * p.meses, co);
    return Object.assign({ id: p.id, nombre: p.nombre, meses: p.meses, descuento_pct: p.descuento_pct, activo: p.activo, consultas: mes * p.meses }, m, { ok: m.margen_pct >= min }); });
  return { periodos: filas2, precio_minimo: precioMinimo(mes, co), minimo_pct: min, ok: filas2.filter(function(f){ return f.activo !== false; }).every(function(f){ return f.ok; }),
           con_iva_mes: conIva, por_consulta: mes ? r2(conIva / mes) : null,
           escenarios: co.curva.map(function(p){ return { consultas_anuales: p.consultas_anuales, coste: p.coste, margen_pct: margen(precio, mes, co, false, p.coste).margen_pct }; }) };
}
function simularCampana(c, cfg){
  var co = cfg.costes, min = co.margen_minimo_pct, cc = co.coste_consulta;
  if (c.tipo === 'prueba' || c.tipo === 'consulta_gratis'){
    var n = num(c.consultas) || (c.tipo === 'prueba' ? 3 : 1), coste = r2(n * cc);
    return { filas: [], coste_por_uso: coste, bajo_minimo: false, minimo_pct: min,
             lectura: c.tipo === 'prueba' ? 'Coste de captación: hasta ' + coste.toFixed(2).replace('.', ',') + ' € de OCI por prueba completa.' : 'Cada uso cuesta ' + coste.toFixed(2).replace('.', ',') + ' € de OCI sin ingreso.' };
  }
  var filas = [];
  cfg.planes.filter(function(p){ return p.tipo === 'suscripcion' && p.estado !== 'retirado' && (!(c.planes || []).length || c.planes.indexOf(p.id) >= 0); }).forEach(function(p){
    cfg.periodos.forEach(function(per){
      if (p.periodos.indexOf(per.id) < 0 || ((c.periodos || []).length && c.periodos.indexOf(per.id) < 0)) return;
      var imp = importePeriodo(p.precio, per), consultas = p.consultas.mes * per.meses, imp2 = imp;
      if (c.tipo === 'descuento'){ var v = num(c.descuento_valor); imp2 = c.descuento_tipo === 'pct' ? imp * (1 - v / 100) : Math.max(0, imp - v); }
      else if (c.tipo === 'plan_superior'){ var dst = cfg.planes.find(function(x){ return x.id === c.plan_destino; }); if (!dst || dst.id === p.id) return; consultas = dst.consultas.mes * per.meses; }
      var m = imp2 > 0 ? margen(imp2, consultas, co) : { margen_pct: null, beneficio: r2(-consultas * cc) };
      filas.push({ plan: p.nombre, plan_id: p.id, periodo: per.nombre, precio_normal: imp, precio_campana: r2(imp2), margen_pct: m.margen_pct, beneficio: m.beneficio, ok: m.margen_pct != null && m.margen_pct >= min });
    });
  });
  var bajo = filas.some(function(f){ return !f.ok; });
  return { filas: filas, bajo_minimo: bajo, minimo_pct: min, coste_por_uso: null, lectura: bajo ? 'Algún plan baja del margen mínimo con esta campaña.' : 'Todos los planes siguen por encima del margen mínimo.' };
}

/* ---------- filtros de listados del backoffice ---------- */
function norm(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function listarSuscriptores(rol, qs){
  var base = snap('/api/bo/negocio/suscriptores?limite=1000', rol); if (!base || base.status !== 200) return base;
  var b = base.body, filas = b.filas;
  var q = norm(qs.get('q')), est = qs.get('estado'), plan = qs.get('plan'), al = qs.get('alerta');
  if (q) filas = filas.filter(function(f){ return norm([f.nombre, f.email, f.plan_nombre, f.id].join(' ')).indexOf(q) >= 0; });
  if (est) filas = filas.filter(function(f){ return f.estado === est; });
  if (plan) filas = filas.filter(function(f){ return f.plan === plan; });
  if (al === 'uso') filas = filas.filter(function(f){ return f.alertas_uso || f.aviso_uso; });
  if (al === 'impago') filas = filas.filter(function(f){ return f.impago; });
  var lim = Number(qs.get('limite') || 60), desde = Number(qs.get('desde') || 0);
  return { status: 200, body: { total: filas.length, filas: filas.slice(desde, desde + lim), estados: b.estados, puede_editar: b.puede_editar } };
}

/* ---------- enrutador ---------- */
function atender(url, init){
  init = init || {};
  var u = new URL(url, location.href), path = u.pathname.replace(/^.*?(\/api\/)/, '/api/'), qs = u.searchParams;
  var metodo = (init.method || 'GET').toUpperCase(), rol = rolDe(init), cuerpo = {};
  try { cuerpo = init.body ? JSON.parse(init.body) : {}; } catch(e){}
  var m;

  // --- autenticación
  if (path === '/api/health') return resp(200, { ok: true, version: 'Mockup estático' });
  if (path === '/api/auth/cuentas-prueba') return resp(200, D._cuentas);
  if (path === '/api/auth/login' && metodo === 'POST'){
    if (!cuerpo.email){
      var porRol = { cliente: 'cliente@demo.es', abogado: 'abogado@demo.es' }[cuerpo.rol];
      if (!porRol) return error(400, 'Elige si entras como cliente o como abogado.');
      return resp(200, { token: 'demo-' + EMAIL_ROL[porRol], usuario: D._logins[porRol] });
    }
    var email = String(cuerpo.email || '').trim().toLowerCase(), r = EMAIL_ROL[email];
    var nuevo = Object.keys(ESTADO.usuarios).find(function(k){ return ESTADO.usuarios[k].email === email; });
    if (nuevo && cuerpo.password){ return resp(200, { token: 'demo-' + nuevo, usuario: ESTADO.usuarios[nuevo] }); }
    if (!r || cuerpo.password !== CLAVE) return error(400, 'Correo o contraseña incorrectos. En este mockup la contraseña de todas las cuentas es «' + CLAVE + '».');
    var usr = D._logins[email];
    if (cuerpo.rol && usr.rol !== cuerpo.rol) return error(400, 'Esta cuenta es de ' + (usr.rol === 'cliente' ? 'cliente' : 'abogado del despacho') + ': entra por la pestaña «' + (usr.rol === 'cliente' ? 'Soy cliente' : 'Soy abogado') + '».');
    return resp(200, { token: 'demo-' + r, usuario: usr });
  }
  if (path === '/api/auth/registro' && metodo === 'POST'){
    var k = 'nuevo' + hex(6), nu = { id: hex(12), rol: 'cliente', nombre: String(cuerpo.nombre || 'Nuevo cliente'), email: String(cuerpo.email || '').toLowerCase(), telefono: cuerpo.telefono || '', creado: ahora() };
    ESTADO.usuarios[k] = nu; return resp(200, { token: 'demo-' + k, usuario: nu });
  }
  if (path === '/api/auth/logout') return resp(200, { ok: true });
  if (!rol) return error(401, 'Sesión no iniciada o caducada. Vuelve a entrar.');
  var yo = usuarioDe(rol);
  if (!yo) return error(401, 'Sesión no iniciada o caducada. Vuelve a entrar.');
  if (path === '/api/auth/yo'){
    if (metodo === 'PATCH'){ yo = ESTADO.usuarios[rol] = Object.assign({}, yo, cuerpo.nombre ? { nombre: cuerpo.nombre } : {}); }
    return resp(200, { usuario: yo });
  }
  if (path === '/api/app/config') return resp(200, { version: 'Mockup estático', despacho: 'Despacho Demo', voz: false, precio_consulta: 9.95 });

  // --- portal: chats, consultas y canal
  if (path === '/api/chats' && metodo === 'GET') return resp(200, copia(listaChats(rol)));
  if (path === '/api/chats' && metodo === 'POST') return resp(200, copia(nuevoChat(rol, cuerpo.titulo, cuerpo.expediente_id)));
  if ((m = /^\/api\/chats\/([a-f0-9]{12})$/.exec(path))){
    var v = vista(rol, m[1]);
    if (!v) return error(404, 'No existe.');
    if (metodo === 'GET') return resp(200, copia(v));
    if (metodo === 'PATCH'){ if (cuerpo.titulo) v.titulo = cuerpo.titulo; if (cuerpo.fijado != null) v.fijado = !!cuerpo.fijado; actualizarLista(rol, v); return resp(200, copia(v)); }
    if (metodo === 'DELETE'){ var l = listaChats(rol); l.chats = l.chats.filter(function(c){ return c.id !== v.id; }); delete ESTADO.vistas[rol + '/' + v.id]; return resp(200, { ok: true }); }
  }
  if ((m = /^\/api\/chats\/([a-f0-9]{12})\/memoria$/.exec(path))){ var vm = vista(rol, m[1]); if (vm) vm.memoria = {}; return resp(200, copia(vm)); }
  if (/^\/api\/chats\/[a-f0-9]{12}\/documentos/.test(path) && metodo !== 'GET') return error(400, 'En el mockup estático no se suben ni se analizan documentos.');
  if (/^\/api\/chats\/[a-f0-9]{12}\/expediente$/.test(path) || /^\/api\/expedientes\//.test(path)) return error(400, AVISO);
  if (path === '/api/consultas' && metodo === 'POST'){
    var vc = cuerpo.chat_id ? vista(rol, cuerpo.chat_id) : null;
    if (!vc) vc = nuevoChat(rol, '', null);
    var id = cuerpo.request_id || ('q' + hex(10));
    ESTADO.trabajos[id] = { inicio: Date.now(), query: String(cuerpo.query || ''), v: vc };
    return resp(202, { id: id, estado: 'pendiente' });
  }
  if ((m = /^\/api\/consultas\/([\w-]+)$/.exec(path))) return sondearTrabajo(rol, m[1]);
  if (path === '/api/mensajes/estado'){ var cs = canal(rol); return resp(200, { sin_leer: cs.sin_leer || 0, despacho: cs.despacho }); }
  if (path === '/api/mensajes'){
    var cn = canal(rol);
    if (metodo === 'POST'){
      var lc = listaChats(rol).chats.find(function(c){ return c.id === cuerpo.consulta_id; });
      var msg = { id: hex(12), de: 'cliente', autor: yo.nombre, texto: String(cuerpo.texto || ''), ts: ahora(), consulta_id: lc ? lc.id : null,
                  consulta_numero: lc ? lc.numero : '', consulta_titulo: lc ? lc.titulo : '', leido_cliente: true, leido_despacho: false };
      cn.mensajes.push(msg);
      return resp(200, { mensaje: msg, mensajes: copia(cn.mensajes), despacho: cn.despacho });
    }
    cn.sin_leer = 0; return resp(200, copia(cn));
  }

  // --- backoffice: simuladores (calculados aquí)
  if (path === '/api/bo/negocio/planes/simular' || path === '/api/bo/negocio/campanas/simular'){
    var cfg = (snap('/api/bo/negocio/config', 'abogado') || {}).body;
    try { return resp(200, path.indexOf('planes') > 0 ? simularPlan(cuerpo, cfg) : simularCampana(cuerpo, cfg)); }
    catch(e){ return error(400, e.message, true); }
  }
  if (/^\/api\/bo\/chats\/[a-f0-9]{12}\/analisis$/.test(path)){ var sa = snap(path.replace(/\/analisis$/, ''), rol); return sa ? resp(sa.status, sa.body) : error(404, 'No existe.'); }
  if (/^\/api\/bo\/administracion\/probar\//.test(path)) return resp(200, { ok: true, mensaje: 'Mockup: conexión simulada correcta.' });
  if (path.indexOf('/api/bo/') === 0 && metodo !== 'GET') return error(409, AVISO, path.indexOf('/api/bo/negocio/') === 0);

  // --- backoffice: lecturas
  if (path === '/api/bo/negocio/suscriptores'){ var ls = listarSuscriptores(rol, qs); return ls ? resp(ls.status, ls.body) : error(403, 'Sin acceso.', true); }
  if ((m = /^\/api\/bo\/negocio\/registro$/.exec(path))){
    var rg = snap(path, rol); if (!rg) return error(403, 'Sin acceso.', true);
    var mod = qs.get('modulo'), q = norm(qs.get('q'));
    rg.body.filas = rg.body.filas.filter(function(e){ return (!mod || e.modulo === mod) && (!q || norm([e.autor, e.accion, e.detalle].join(' ')).indexOf(q) >= 0); });
    return resp(rg.status, rg.body);
  }
  if (path === '/api/bo/consultas'){
    var co = snap(path, rol); if (!co) return error(403, 'Solo para el despacho.');
    var qq = norm(qs.get('q'));
    if (qq) co.body.consultas = co.body.consultas.filter(function(f){ return norm([f.titulo, f.cliente.nombre, f.materia, f.ultima_pregunta].join(' ')).indexOf(qq) >= 0; });
    return resp(co.status, co.body);
  }
  if (path === '/api/bo/supervision'){
    var sp = snap(path, rol); if (!sp) return error(403, 'Solo para el despacho.');
    var est = qs.get('estado'), qs2 = norm(qs.get('q'));
    sp.body.filas = sp.body.filas.filter(function(f){ return (!est || (f.validacion || 'pendiente') === est || f.estado === est) && (!qs2 || norm([f.entrada, f.case_id, f.correlation_id, f.cliente, f.materia].join(' ')).indexOf(qs2) >= 0); });
    return resp(sp.status, sp.body);
  }
  var s = snap(path, rol) || (rol === 'gestor' && path.indexOf('/api/bo/negocio/') !== 0 ? snap(path, 'abogado') : null) || (rol === 'gestor' && /^\/api\/bo\/negocio\/suscriptores\//.test(path) ? snap(path, 'abogado') : null);
  if (s) return resp(s.status, s.body);
  if (path.indexOf('/api/bo/') === 0) return error(rol === 'abogado' || rol === 'gestor' ? 404 : 403, rol === 'abogado' || rol === 'gestor' ? 'No disponible en el mockup.' : 'Solo para el despacho.', path.indexOf('/negocio/') > 0);
  return error(404, 'No disponible en el mockup.');
}

window.fetch = function(entrada, init){
  var url = typeof entrada === 'string' ? entrada : entrada.url;
  if (url.indexOf('/api/') < 0) return fetchReal(entrada, init);
  return listo.then(function(){
    return new Promise(function(ok){ setTimeout(function(){ ok(atender(url, init)); }, 120 + Math.random() * 180); });
  });
};

/* Los enlaces a resoluciones y documentos originales necesitan el servidor */
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  var h = a.getAttribute('href') || '';
  if (/\/sentencias\/|\/archivo|\/api\//.test(h)){
    e.preventDefault(); e.stopPropagation();
    if (window.LIA && window.LIA.toast) window.LIA.toast('En el mockup estático no se abren los documentos originales.');
  }
}, true);
})();
