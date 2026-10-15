/* =====================  Backoffice · Gestión y Dashboard (modelo de precios y suscripciones V5)  =====================
   APEX: páginas 60 «Dashboard» y 61-69 «Gestión» (pestañas con Region Display Selector). La lógica y las reglas
   (margen mínimo, versiones de precio, permisos) están en el servidor (core/negocio.py); aquí solo se pinta y se envía. */
(function(){
'use strict';
var BO = window.BO, P = window.LIA;
if (!BO || !BO.util) return;
var U = BO.util, $ = U.$, esc = U.esc;

var g = { tab: P.store.get('legalia_bo_gtab') || '', cfg: null, subs: { q: '', estado: '', plan: '', alerta: '', limite: 40 }, reg: { modulo: '', q: '' },
          plan: null, campana: null, ficha: null };

/* ---------- API: los errores de negocio traen {mensaje, simulacion, requiere_confirmacion} ---------- */
function api(path, opc){
  opc = opc || {};
  var init = { method: opc.method || 'GET', headers: Sesion.cabeceras() };
  if (opc.body !== undefined){ init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opc.body); }
  return fetch(Sesion.base() + path, init).then(function(res){
    return res.json().catch(function(){ return {}; }).then(function(body){
      if (res.status === 401 && Sesion.token){ Sesion.caducada(); }
      if (!res.ok){
        var d = body.detail, e = new Error(typeof d === 'string' ? d : (d && d.mensaje) || ('Error ' + res.status));
        e.datos = d && typeof d === 'object' ? d : {}; e.status = res.status; throw e;
      }
      return body;
    });
  });
}

/* ---------- formato ---------- */
function num(n, dec){ return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' }); }
function eur(n, dec){ return num(n, dec == null ? 2 : dec) + ' €'; }
function pct(n, dec){ return n == null ? '—' : num(n, dec == null ? 1 : dec) + ' %'; }
function ent(n){ return Number(n || 0).toLocaleString('es-ES', { useGrouping: 'always' }); }
function fechaCorta(t){ if (!t) return '—'; var d = new Date(String(t).length <= 10 ? t + 'T12:00:00' : t); return isNaN(d) ? esc(t) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', ''); }
function tag(txt, cls, title){ return '<span class="bo-tag ' + (cls || 't-gray') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(txt) + '</span>'; }
function margenTag(m, ok){ return '<span class="g-margen ' + (ok ? 'ok' : 'ko') + '">' + pct(m) + '</span>'; }
function icono(c){ return '<span class="fa ' + c + '" aria-hidden="true"></span>'; }
function vacio(t){ return '<div class="bo-vacio">' + t + '</div>'; }
function alerta(tipo, html){ return '<div class="t-Alert t-Alert--' + tipo + '">' + icono(tipo === 'warning' ? 'fa-exclamation-triangle' : tipo === 'danger' ? 'fa-times-circle' : tipo === 'success' ? 'fa-check-circle' : 'fa-info-circle') + '<div>' + html + '</div></div>'; }
function aviso(e){ P.toast(e.message || String(e)); }

/* ---------- permisos ---------- */
function perm(mod){ var n = BO.negocio || {}; if (mod === 'gestores') return n.perfil === 'administrador' ? 'editar' : 'no'; return (n.permisos || {})[mod] || 'no'; }
function puedeVer(mod){ return mod == null ? true : perm(mod) !== 'no'; }
function puedeEditar(mod){ return perm(mod) === 'editar'; }
function soloLectura(mod){ return puedeEditar(mod) ? '' : '<span class="g-lectura">' + icono('fa-eye') + ' Solo lectura</span>'; }

var TABS = [
  { id: 'planes', t: 'Planes', ico: 'fa-tags', mod: 'planes' },
  { id: 'periodos', t: 'Periodos de pago', ico: 'fa-calendar', mod: 'planes' },
  { id: 'campanas', t: 'Campañas', ico: 'fa-bullhorn', mod: 'campanas' },
  { id: 'limites', t: 'Límites y expediente', ico: 'fa-tachometer', mod: 'limites' },
  { id: 'suscriptores', t: 'Suscriptores', ico: 'fa-users', mod: 'suscriptores' },
  { id: 'impagos', t: 'Impagos', ico: 'fa-credit-card', mod: 'suscriptores' },
  { id: 'gestores', t: 'Gestores y permisos', ico: 'fa-user-secret', mod: 'gestores' },
  { id: 'costes', t: 'Costes y margen', ico: 'fa-calculator', mod: 'costes' },
  { id: 'registro', t: 'Registro de cambios', ico: 'fa-history', mod: null }
];

/* ---------- formularios: name="a.b" -> {a: {b: valor}} ---------- */
function leerForm(form){
  var out = {};
  Array.prototype.forEach.call(form.querySelectorAll('[name]'), function(el){
    if (el.disabled && !el.dataset.siempre) return;
    var ruta = el.name.split('.'), o = out;
    for (var i = 0; i < ruta.length - 1; i++){ o = o[ruta[i]] = o[ruta[i]] || {}; }
    var k = ruta[ruta.length - 1];
    if (el.type === 'radio'){ if (el.checked) o[k] = el.value; return; }
    if (el.type === 'checkbox'){
      if (el.dataset.lista){ o[k] = o[k] || []; if (el.checked) o[k].push(el.value); }
      else o[k] = el.checked;
    } else if (el.dataset.lineas){ o[k] = el.value.split('\n').map(function(x){ return x.trim(); }).filter(Boolean); }
    else o[k] = el.value;
  });
  return out;
}
function campo(etq, control, ayuda, cls){ return '<label class="g-campo' + (cls ? ' ' + cls : '') + '"><span>' + esc(etq) + '</span>' + control + (ayuda ? '<small>' + ayuda + '</small>' : '') + '</label>'; }
function inp(name, valor, tipo, extra){ return '<input name="' + name + '" type="' + (tipo || 'text') + '" value="' + esc(valor == null ? '' : valor) + '"' + (extra || '') + '>'; }
function numInp(name, valor, paso, min, extra){ return inp(name, valor, 'number', ' inputmode="decimal" step="' + (paso || 1) + '" min="' + (min == null ? 0 : min) + '"' + (extra || '')); }
function sel(name, opciones, valor, extra){ return '<select name="' + name + '"' + (extra || '') + '>' + opciones.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(valor) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
function chk(name, valor, marcado, etq, lista, extra){ return '<label class="g-check"><input type="checkbox" name="' + name + '" value="' + esc(valor) + '"' + (lista ? ' data-lista="1"' : '') + (marcado ? ' checked' : '') + (extra || '') + '><span>' + esc(etq) + '</span></label>'; }
function debounce(fn, ms){ var t; return function(){ var a = arguments, self = this; clearTimeout(t); t = setTimeout(function(){ fn.apply(self, a); }, ms); }; }

/* =====================================================================================
   GESTIÓN
   ===================================================================================== */
function pintarGestion(sub){
  var el = $('bo-gestion');
  var tabs = TABS.filter(function(t){ return puedeVer(t.mod); });
  if (sub) g.tab = sub;
  if (!tabs.some(function(t){ return t.id === g.tab; })) g.tab = tabs.length ? tabs[0].id : '';
  if (!tabs.length){ el.innerHTML = '<div class="bo-card">' + vacio('No tienes acceso a Gestión. Pídeselo al administrador del despacho.') + '</div>'; return; }
  el.innerHTML = '<div class="g-cab"><nav class="g-tabs" role="tablist" aria-label="Apartados de Gestión">' + tabs.map(function(t){
      var on = t.id === g.tab;
      return '<button type="button" role="tab" aria-selected="' + on + '" class="g-tab' + (on ? ' on' : '') + '" data-gtab="' + t.id + '">' + icono(t.ico) + '<span>' + esc(t.t) + '</span></button>'; }).join('') +
    '</nav></div><div id="gCuerpo"></div>';
  var on = el.querySelector('.g-tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  pintarTab();
}
function pintarTab(){
  var c = $('gCuerpo'); if (!c) return;
  P.store.set('legalia_bo_gtab', g.tab);
  U.cargando(c, 'Cargando');
  var tarea = { planes: tabPlanes, periodos: tabPeriodos, campanas: tabCampanas, limites: tabLimites, suscriptores: tabSuscriptores,
                impagos: tabImpagos, gestores: tabGestores, costes: tabCostes, registro: tabRegistro }[g.tab];
  var conCfg = ['planes', 'periodos', 'campanas', 'limites', 'costes', 'suscriptores'].indexOf(g.tab) >= 0;
  (conCfg ? cargarCfg() : Promise.resolve()).then(function(){ tarea(c); })
    .catch(function(e){ c.innerHTML = '<div class="bo-card">' + vacio(esc(e.message)) + '</div>'; });
}
function cargarCfg(){ return api('/api/bo/negocio/config').then(function(c){ g.cfg = c; return c; }); }
function recargar(){ g.cfg = null; pintarTab(); }
BO.secciones.gestion = pintarGestion;
$('bo-gestion').addEventListener('click', function(e){
  var t = e.target.closest('[data-gtab]');
  if (t){ g.tab = t.dataset.gtab; document.querySelectorAll('#bo-gestion .g-tab').forEach(function(b){ var on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); pintarTab(); }
});
function ir(tab){ BO.ir('gestion', tab); }

function planesSuscripcion(){ return (g.cfg.planes || []).filter(function(p){ return p.tipo === 'suscripcion'; }); }
function nombrePlan(id){ var p = (g.cfg && g.cfg.planes || []).find(function(x){ return x.id === id; }); return p ? p.nombre : (id || '—'); }
function nombrePeriodo(id){ var p = (g.cfg && g.cfg.periodos || []).find(function(x){ return x.id === id; }); return p ? p.nombre : (id || '—'); }
var ESTADO_PLAN = { visible: ['Visible', 't-green'], oculto: ['Oculto', 't-gray'], retirado: ['Retirado', 't-red'] };

/* ---------- Planes ---------- */
function tabPlanes(c){
  var cfg = g.cfg, co = cfg.costes || {}, ed = puedeEditar('planes');
  var h = '<div class="g-barra"><div class="g-barra-txt"><b>Planes que se venden.</b> Esencial, Estándar y Premium son la configuración inicial propuesta: precio, consultas, expediente y funciones se cambian aquí. ' +
    (co.margen_minimo_pct != null ? 'Por debajo del <b>margen mínimo (' + pct(co.margen_minimo_pct, 0) + ')</b> un plan no se puede guardar.' : '') + '</div>' +
    soloLectura('planes') + (ed ? '<button type="button" class="bo-btn" data-g-plan-nuevo>' + icono('fa-plus') + ' Nuevo plan</button>' : '') + '</div>';
  if ((cfg.alertas_margen || []).length) h += alerta('warning', '<b>Hay planes por debajo del margen mínimo</b> con los costes actuales: ' + esc(cfg.alertas_margen.map(function(a){ return a.plan + ' ' + a.periodo.toLowerCase() + ' (' + pct(a.margen_pct) + ')'; }).join(', ')) + '. Revisa precios o costes.');
  h += '<div class="g-planes">' + cfg.planes.map(function(p){
    var s = p.simulacion, est = ESTADO_PLAN[p.estado] || ESTADO_PLAN.oculto, unico = p.tipo === 'pago_unico', e = p.expediente || {};
    var cons = unico ? ('1 pregunta + ' + p.consultas.aclaraciones + ' aclaraciones · válida ' + p.validez_horas + ' h')
      : (p.consultas.mes + ' consultas al mes · ' + p.consultas.dia + ' al día · ' + p.consultas.semana + ' a la semana');
    var exp = unico ? (e.docs_mes ? e.docs_mes + ' documento adjunto' : 'Sin documentos') + ' · sin expediente'
      : e.activos + ' expediente' + (e.activos === 1 ? '' : 's') + ' activo' + (e.activos === 1 ? '' : 's') + ' · ' + e.docs_mes + ' documentos/mes · ' + e.tam_mb + ' MB';
    return '<article class="bo-card g-plan est-' + esc(p.estado) + '"><header><div><h3>' + esc(p.nombre) + '</h3><p>' + esc(p.descripcion || '') + '</p></div>' + tag(est[0], est[1]) + '</header>' +
      '<div class="g-precio"><b>' + eur(p.precio) + '</b><span>+ IVA ' + (unico ? '· pago único' : '/ mes') + '</span></div>' +
      '<div class="g-precio-sub">' + eur(s.con_iva_mes) + ' con IVA' + (s.por_consulta ? ' · ' + eur(s.por_consulta) + ' por consulta' : '') + '</div>' +
      '<ul class="g-datos"><li>' + icono('fa-comments-o') + esc(cons) + '</li><li>' + icono('fa-folder-open-o') + esc(exp) + '</li>' +
        (unico ? '' : '<li>' + icono('fa-clock-o') + 'Conservación sin actividad: ' + e.conservacion_dias + ' días · memoria: resumen + ' + e.memoria_intercambios + ' intercambios</li>') + '</ul>' +
      ((p.funciones || []).length ? '<ul class="g-func">' + p.funciones.map(function(f){ return '<li>' + icono('fa-check') + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="g-margenes" aria-label="Margen bruto por periodo">' + s.periodos.map(function(f){
          return '<div class="g-margen-fila' + (f.activo === false ? ' inactivo' : '') + '"><span>' + esc(f.nombre) + (f.meses > 1 ? ' · ' + eur(f.importe) : '') + '</span>' + margenTag(f.margen_pct, f.ok) + '</div>'; }).join('') + '</div>' +
      '<footer><small>Versión ' + (p.version || 1) + ' · desde ' + fechaCorta(((p.historial || []).slice(-1)[0] || {}).desde) + ' · mínimo ' + eur(s.precio_minimo) + '</small>' +
        (ed ? '<div class="g-acc"><button type="button" class="bo-btn sec sm" data-g-plan="' + esc(p.id) + '">' + icono('fa-pencil') + ' Editar</button>' +
          '<button type="button" class="bo-btn sec sm" data-g-plan-menu="' + esc(p.id) + '" aria-haspopup="menu" aria-label="Más acciones de ' + esc(p.nombre) + '">' + icono('fa-ellipsis-h') + '</button></div>'
          : '<button type="button" class="bo-btn sec sm" data-g-plan="' + esc(p.id) + '">' + icono('fa-eye') + ' Ver</button>') + '</footer></article>';
  }).join('') + '</div>';
  h += '<p class="bo-nota">Margen bruto con pago del periodo, ' + eur(co.coste_consulta) + ' por consulta y cuota consumida al 100 %. Precio base mínimo = (consultas × coste + ' + eur(co.cobro_fijo) + ') ÷ (1 − margen mínimo − ' + pct(co.cobro_pct) + ' × ' + num(1 + co.iva_pct / 100, 2) + ').</p>';
  c.innerHTML = h;
}
function formPlan(p, nuevo){
  var unico = p.tipo === 'pago_unico', e = p.expediente || {}, cons = p.consultas || {}, ed = puedeEditar('planes');
  var dis = ed ? '' : ' disabled';
  var h = '<div class="g-editor"><form class="g-form" id="gFormPlan" novalidate' + (ed ? '' : ' data-lectura') + '>' +
    (nuevo ? '<div class="g-fila2">' + campo('Tipo', sel('tipo', [['suscripcion', 'Suscripción (mensual, trimestral…)'], ['pago_unico', 'Pago único (p. ej. consulta única)']], p.tipo, ' data-g-tipo-plan')) + '</div>' : '') +
    '<div class="g-fila2">' + campo('Nombre', inp('nombre', p.nombre, 'text', ' maxlength="40" required' + dis)) + campo('Estado', sel('estado', [['visible', 'Visible en la página de precios'], ['oculto', 'Oculto (solo por enlace o campaña)'], ['retirado', 'Retirado: no se vende']], p.estado || 'oculto', dis)) + '</div>' +
    campo('Descripción', inp('descripcion', p.descripcion, 'text', ' maxlength="160"' + dis)) +
    '<fieldset><legend>Precio</legend><div class="g-fila3">' + campo(unico ? 'Precio (pago único)' : 'Precio base mensual', '<div class="g-sufijo">' + numInp('precio', p.precio, 0.01, 0.5, dis) + '<em>€ + IVA</em></div>') +
      (unico ? campo('Validez', '<div class="g-sufijo">' + numInp('validez_horas', p.validez_horas || 48, 1, 1, dis) + '<em>horas</em></div>') : '') + '</div></fieldset>' +
    '<fieldset><legend>Consultas incluidas</legend><div class="g-fila3">' +
      (unico ? campo('Preguntas', numInp('consultas.total', cons.total || 1, 1, 1, dis)) + campo('Aclaraciones', numInp('consultas.aclaraciones', cons.aclaraciones || 0, 1, 0, dis))
        : campo('Al mes', numInp('consultas.mes', cons.mes, 1, 1, dis)) + campo('Al día', numInp('consultas.dia', cons.dia, 1, 1, dis)) + campo('A la semana', numInp('consultas.semana', cons.semana, 1, 1, dis))) + '</div></fieldset>' +
    '<fieldset><legend>Expediente y memoria del caso</legend><div class="g-fila3">' +
      campo('Expedientes activos', numInp('expediente.activos', e.activos || 0, 1, 0, dis)) + campo('Documentos al mes', numInp('expediente.docs_mes', e.docs_mes || 0, 1, 0, dis)) +
      campo('Documentos por expediente', numInp('expediente.docs_expediente', e.docs_expediente || 0, 1, 0, dis)) + campo('Tamaño máximo', '<div class="g-sufijo">' + numInp('expediente.tam_mb', e.tam_mb || 10, 1, 1, dis) + '<em>MB</em></div>') +
      campo('Conservación sin actividad', '<div class="g-sufijo">' + numInp('expediente.conservacion_dias', e.conservacion_dias || 90, 1, 0, dis) + '<em>días</em></div>') +
      campo('Memoria del caso', '<div class="g-sufijo">' + numInp('expediente.memoria_intercambios', e.memoria_intercambios || 0, 1, 0, dis) + '<em>intercambios</em></div>', 'La IA recibe un resumen del caso y estos últimos intercambios.') + '</div></fieldset>' +
    (unico ? '' : '<fieldset><legend>Periodos de pago</legend><div class="g-checks">' + g.cfg.periodos.map(function(x){
        return chk('periodos', x.id, (p.periodos || []).indexOf(x.id) >= 0, x.nombre + (x.descuento_pct ? ' −' + num(x.descuento_pct, 0) + ' %' : '') + (x.activo ? '' : ' (inactivo)'), true, dis); }).join('') + '</div></fieldset>') +
    '<fieldset><legend>Funciones (una por línea)</legend><textarea name="funciones" data-lineas="1" rows="4"' + dis + '>' + esc((p.funciones || []).join('\n')) + '</textarea></fieldset>' +
    '</form><aside class="g-editor-lado"><section class="g-sim" id="gSimPlan" aria-live="polite"></section>' +
    ((p.historial || []).length ? '<section class="t-Drawer-sec"><h3>Versiones de precio</h3><ul class="g-hist">' + p.historial.slice().reverse().map(function(v){ return '<li><b>v' + v.version + ' · ' + eur(v.precio) + '</b><span>desde ' + fechaCorta(v.desde) + ' · ' + esc(v.autor || '') + '</span></li>'; }).join('') + '</ul><p class="bo-nota">Quien ya está suscrito mantiene su precio hasta renovar y recibe aviso.</p></section>' : '') + '</aside></div>';
  return h;
}
function abrirPlan(id){
  var p = id ? JSON.parse(JSON.stringify(g.cfg.planes.find(function(x){ return x.id === id; }))) : { tipo: 'suscripcion', nombre: '', descripcion: '', precio: 19.95, estado: 'oculto',
    consultas: { mes: 20, dia: 5, semana: 10 }, expediente: { activos: 2, docs_mes: 5, docs_expediente: 10, tam_mb: 15, conservacion_dias: 120, memoria_intercambios: 10 },
    periodos: g.cfg.periodos.filter(function(x){ return x.activo; }).map(function(x){ return x.id; }), funciones: [] };
  g.plan = p;
  var ed = puedeEditar('planes');
  U.abrirDrawer(id ? (ed ? 'Editar plan · ' : 'Plan · ') + p.nombre : 'Nuevo plan', formPlan(p, !id), { clase: 'g-drawer', pie: ed ? '<span class="g-pie-estado" id="gPlanEstado"></span><button type="button" class="bo-btn sec" data-cerrar-drawer>Cancelar</button><button type="button" class="bo-btn" id="gPlanGuardar" data-g-plan-guardar>Guardar plan</button>' : '' });
  simularPlan();
}
var simularPlan = debounce(function(){
  var f = $('gFormPlan'); if (!f) return;
  var d = f.hasAttribute('data-lectura') ? JSON.parse(JSON.stringify(g.plan)) : leerForm(f); d.id = g.plan.id; d.tipo = d.tipo || g.plan.tipo;
  var out = $('gSimPlan'), boton = $('gPlanGuardar'), est = $('gPlanEstado');
  api('/api/bo/negocio/planes/simular', { method: 'POST', body: d }).then(function(s){
    out.innerHTML = tablaSimPlan(s);
    if (boton) boton.disabled = !s.ok;
    if (est) est.innerHTML = s.ok ? '<span class="n-ok">' + icono('fa-check') + ' Margen por encima del mínimo</span>' : '<span class="n-ko">' + icono('fa-exclamation-triangle') + ' Por debajo del mínimo: no se puede guardar</span>';
  }).catch(function(e){ out.innerHTML = alerta('warning', esc(e.message)); if (boton) boton.disabled = true; if (est) est.textContent = ''; });
}, 280);
function tablaSimPlan(s){
  return '<div class="t-Drawer-sec"><h3>Simulador · margen antes de guardar</h3>' +
    '<div class="g-sim-resumen"><div><span>Precio base mínimo</span><b>' + eur(s.precio_minimo) + ' + IVA</b></div><div><span>Margen mínimo</span><b>' + pct(s.minimo_pct, 0) + '</b></div><div><span>Con IVA</span><b>' + eur(s.con_iva_mes) + '</b></div>' + (s.por_consulta ? '<div><span>Por consulta</span><b>' + eur(s.por_consulta) + '</b></div>' : '') + '</div>' +
    '<div class="bo-tabla-wrap"><table class="bo-tabla compacta tarjetas"><thead><tr><th>Periodo</th><th>Importe</th><th>Comisión</th><th>Consultas</th><th>Coste</th><th>Margen</th></tr></thead><tbody>' +
    s.periodos.map(function(f){ return '<tr class="' + (f.activo === false ? 'inactivo' : '') + '"><td class="t-cab-movil"><b>' + esc(f.nombre) + '</b>' + (f.descuento_pct ? ' <small>−' + num(f.descuento_pct, 0) + ' %</small>' : '') + '</td><td data-label="Importe">' + eur(f.importe) + '</td><td data-label="Comisión">' + eur(f.comision) + '</td><td data-label="Consultas">' + ent(f.consultas) + '</td><td data-label="Coste">' + eur(f.coste_consultas) + '</td><td data-label="Margen">' + margenTag(f.margen_pct, f.ok) + '</td></tr>'; }).join('') +
    '</tbody></table></div><h4>Según el volumen (curva de coste OCI)</h4><div class="g-curva">' + s.escenarios.map(function(x){
      return '<div class="' + (x.margen_pct >= s.minimo_pct ? 'ok' : 'ko') + '"><span>' + ent(x.consultas_anuales) + '/año · ' + eur(x.coste, 3) + '</span><b>' + pct(x.margen_pct) + '</b></div>'; }).join('') + '</div></div>';
}
function guardarPlan(){
  var f = $('gFormPlan'), b = $('gPlanGuardar'); if (!f) return;
  var d = leerForm(f); d.tipo = d.tipo || g.plan.tipo;
  b.disabled = true;
  api(g.plan.id ? '/api/bo/negocio/planes/' + encodeURIComponent(g.plan.id) : '/api/bo/negocio/planes', { method: g.plan.id ? 'PUT' : 'POST', body: d }).then(function(r){
    U.cerrarDrawer();
    P.toast('Plan «' + r.plan.nombre + '» guardado.' + (r.suscriptores_avisados ? ' ' + r.suscriptores_avisados + ' suscriptores recibirán aviso del nuevo precio al renovar.' : ''));
    recargar();
  }).catch(function(e){ b.disabled = false; aviso(e); if (e.datos.simulacion) $('gSimPlan').innerHTML = tablaSimPlan(e.datos.simulacion); });
}
function menuPlan(btn, id){
  var p = g.cfg.planes.find(function(x){ return x.id === id; });
  var estado = function(est, txt){ return { texto: txt, accion: function(){
    api('/api/bo/negocio/planes/' + encodeURIComponent(id) + '/estado', { method: 'POST', body: { estado: est } }).then(function(){ P.toast('Plan «' + p.nombre + '»: ' + txt.toLowerCase() + '.'); recargar(); }).catch(aviso); } }; };
  P.menuPop(btn, [
    { texto: 'Duplicar', accion: function(){ api('/api/bo/negocio/planes/' + encodeURIComponent(id) + '/duplicar', { method: 'POST' }).then(function(r){ P.toast('Creado «' + r.plan.nombre + '» (oculto).'); recargar(); }).catch(aviso); } },
    p.estado !== 'visible' ? estado('visible', 'Publicar') : estado('oculto', 'Ocultar'),
    '-',
    p.estado !== 'retirado' ? { texto: 'Retirar (deja de venderse)', accion: function(){
      P.modal({ titulo: 'Retirar «' + p.nombre + '»', texto: 'Deja de venderse. Quien ya está suscrito sigue con él hasta cancelar o cambiar de plan.', boton: 'Retirar', peligro: true })
        .then(function(ok){ if (ok) estado('retirado', 'Retirado').accion(); }); } } : null
  ]);
}

/* ---------- Periodos de pago ---------- */
function tabPeriodos(c){
  var cfg = g.cfg, ed = puedeEditar('planes'), planes = planesSuscripcion();
  var h = '<div class="g-barra"><div class="g-barra-txt"><b>Periodos de pago.</b> Cada periodo tiene su propio descuento y se activa por plan. Ejemplo: semestral −15 %. Si un descuento deja algún plan por debajo del margen mínimo, no se guarda.</div>' +
    soloLectura('planes') + (ed ? '<button type="button" class="bo-btn" data-g-periodo-nuevo>' + icono('fa-plus') + ' Nuevo periodo</button>' : '') + '</div>';
  h += '<div class="bo-card"><div class="bo-tabla-wrap"><table class="bo-tabla tarjetas"><thead><tr><th>Periodo</th><th>Meses</th><th>Descuento</th><th>Estado</th>' +
    planes.map(function(p){ return '<th>' + esc(p.nombre) + '</th>'; }).join('') + (ed ? '<th></th>' : '') + '</tr></thead><tbody>' +
    cfg.periodos.map(function(x){
      return '<tr><td class="t-cab-movil"><b>' + esc(x.nombre) + '</b></td><td data-label="Meses">' + x.meses + '</td><td data-label="Descuento">' + (x.descuento_pct ? '−' + pct(x.descuento_pct, 0) : '—') + '</td>' +
        '<td data-label="Estado">' + (x.activo ? tag('Activo', 't-green') : tag('Inactivo', 't-gray')) + '</td>' +
        planes.map(function(p){
          var f = p.simulacion.periodos.find(function(z){ return z.id === x.id; });
          return '<td data-label="' + esc(p.nombre) + '">' + (f ? '<div class="g-celda-margen"><span>' + eur(f.importe) + '</span>' + margenTag(f.margen_pct, f.ok) + '</div>' : '<span class="g-gris">No se vende</span>') + '</td>'; }).join('') +
        (ed ? '<td class="t-acc-movil"><button type="button" class="bo-btn sec sm" data-g-periodo="' + esc(x.id) + '">' + icono('fa-pencil') + ' Editar</button></td>' : '') + '</tr>';
    }).join('') + '</tbody></table></div></div>' +
    '<p class="bo-nota">Importe del periodo sin IVA (al particular se le muestra con IVA incluido) y margen bruto con la cuota al 100 %. Subir de plan: efecto inmediato con la diferencia prorrateada. Bajar de plan: en la siguiente renovación. Sin reembolso al cancelar: sigue activo hasta el final del periodo pagado.</p>';
  c.innerHTML = h;
}
function abrirPeriodo(id){
  var x = id ? g.cfg.periodos.find(function(p){ return p.id === id; }) : { nombre: '', meses: 6, descuento_pct: 15, activo: true };
  var planes = planesSuscripcion();
  U.abrirDrawer(id ? 'Editar periodo · ' + x.nombre : 'Nuevo periodo',
    '<form class="g-form" id="gFormPeriodo" novalidate><div class="g-fila3">' + campo('Nombre', inp('nombre', x.nombre, 'text', ' maxlength="30" placeholder="Semestral"')) +
      campo('Meses', numInp('meses', x.meses, 1, 1)) + campo('Descuento', '<div class="g-sufijo">' + numInp('descuento_pct', x.descuento_pct, 0.5, 0) + '<em>%</em></div>') + '</div>' +
      '<div class="g-checks">' + chk('activo', '1', x.activo, 'Periodo activo') + '</div>' +
      '<fieldset><legend>Planes que se venden con este periodo</legend><div class="g-checks">' + planes.map(function(p){ return chk('planes', p.id, id ? (p.periodos || []).indexOf(id) >= 0 : p.estado !== 'retirado', p.nombre, true); }).join('') + '</div></fieldset>' +
    '</form><div id="gPeriodoErr" aria-live="polite"></div>',
    { clase: 'g-drawer estrecho', pie: '<button type="button" class="bo-btn sec" data-cerrar-drawer>Cancelar</button><button type="button" class="bo-btn" data-g-periodo-guardar="' + esc(id || '') + '">Guardar periodo</button>' });
}
function guardarPeriodo(id, b){
  var d = leerForm($('gFormPeriodo'));
  b.disabled = true;
  api(id ? '/api/bo/negocio/periodos/' + encodeURIComponent(id) : '/api/bo/negocio/periodos', { method: id ? 'PUT' : 'POST', body: d }).then(function(r){
    U.cerrarDrawer(); P.toast('Periodo «' + r.periodo.nombre + '» guardado.'); recargar();
  }).catch(function(e){
    b.disabled = false;
    var sim = e.datos.simulacion;
    $('gPeriodoErr').innerHTML = alerta('warning', esc(e.message)) + (Array.isArray(sim) && sim.length ? '<div class="g-curva">' + sim.map(function(f){ return '<div class="' + (f.ok ? 'ok' : 'ko') + '"><span>' + esc(f.plan) + ' · ' + eur(f.importe) + '</span><b>' + pct(f.margen_pct) + '</b></div>'; }).join('') + '</div>' : '');
  });
}

/* ---------- Campañas ---------- */
var TIPO_ICO = { descuento: 'fa-percent', prueba: 'fa-hourglass-half', consulta_gratis: 'fa-gift', plan_superior: 'fa-level-up' };
var EST_CAMP = { activa: ['Activa', 't-green'], pausada: ['Pausada', 't-orange'], finalizada: ['Finalizada', 't-gray'], borrador: ['Borrador', 't-blue'] };
function resumenCampana(x){
  if (x.tipo === 'descuento') return (x.descuento_tipo === 'pct' ? pct(x.descuento_valor, 0) : eur(x.descuento_valor)) + ' de descuento · ' + (x.duracion_meses > 1 ? x.duracion_meses + ' meses' : 'primer periodo');
  if (x.tipo === 'prueba') return x.consultas + ' consultas en ' + x.dias + ' días · ' + (x.pide_tarjeta ? 'pide tarjeta' : 'sin tarjeta');
  if (x.tipo === 'consulta_gratis') return x.consultas + ' consulta' + (x.consultas === 1 ? '' : 's') + ' gratis';
  if (x.tipo === 'plan_superior') return nombrePlan(x.plan_destino) + ' al precio del plan contratado · ' + x.duracion_meses + ' mes' + (x.duracion_meses === 1 ? '' : 'es');
  return '';
}
function tabCampanas(c){
  var cfg = g.cfg, ed = puedeEditar('campanas');
  var h = '<div class="g-barra"><div class="g-barra-txt"><b>Campañas</b> con fecha de inicio y fin: descuentos, pruebas, consultas gratis y prueba de un plan superior. Pueden bajar del margen mínimo: el sistema avisa y pide confirmación; solo quien edita los precios puede activarlas.</div>' +
    soloLectura('campanas') + (ed ? '<button type="button" class="bo-btn" data-g-camp-nueva>' + icono('fa-plus') + ' Nueva campaña</button>' : '') + '</div>';
  h += '<div class="g-campanas">' + cfg.campanas.map(function(x){
    var e = EST_CAMP[x.estado] || EST_CAMP.borrador, s = x.simulacion || {};
    return '<article class="bo-card g-camp"><header><span class="g-camp-ico">' + icono(TIPO_ICO[x.tipo] || 'fa-bullhorn') + '</span><div><h3>' + esc(x.nombre) + '</h3><small>' + esc(cfg.tipos_campana[x.tipo] || x.tipo) + '</small></div>' + tag(e[0], e[1]) + '</header>' +
      '<p class="g-camp-res">' + esc(resumenCampana(x)) + '</p>' + (x.descripcion ? '<p class="bo-nota">' + esc(x.descripcion) + '</p>' : '') +
      '<ul class="g-datos"><li>' + icono('fa-users') + esc(cfg.destinatarios[x.destinatarios] || x.destinatarios) + '</li>' +
        '<li>' + icono(x.aplicacion === 'codigo' ? 'fa-ticket' : 'fa-magic') + (x.aplicacion === 'codigo' ? 'Código <code>' + esc(x.codigo) + '</code>' : 'Automática al contratar') + '</li>' +
        '<li>' + icono('fa-calendar') + fechaCorta(x.inicio) + (x.fin ? ' → ' + fechaCorta(x.fin) : ' · sin fecha de fin') + (x.max_usos ? ' · máx. ' + ent(x.max_usos) + ' usos' : '') + '</li>' +
        ((x.planes || []).length ? '<li>' + icono('fa-tags') + esc(x.planes.map(nombrePlan).join(', ')) + ((x.periodos || []).length ? ' · ' + esc(x.periodos.map(nombrePeriodo).join(', ')) : '') + '</li>' : '') + '</ul>' +
      (s.coste_por_uso != null ? '<div class="g-camp-sim">' + esc(s.lectura) + '</div>' : (s.bajo_minimo ? '<div class="g-camp-sim ko">' + icono('fa-exclamation-triangle') + ' Baja del margen mínimo: ' + esc(s.filas.filter(function(f){ return !f.ok; }).map(function(f){ return f.plan + ' ' + f.periodo.toLowerCase() + ' ' + pct(f.margen_pct); }).join(', ')) + '</div>' : '<div class="g-camp-sim ok">' + icono('fa-check') + ' Todos los planes siguen por encima del mínimo</div>')) +
      (ed ? '<footer class="g-acc"><button type="button" class="bo-btn sec sm" data-g-camp="' + esc(x.id) + '">' + icono('fa-pencil') + ' Editar</button>' +
        (x.estado === 'activa' ? '<button type="button" class="bo-btn sec sm" data-g-camp-estado="pausada" data-id="' + esc(x.id) + '">' + icono('fa-pause') + ' Pausar</button>'
          : x.estado !== 'finalizada' ? '<button type="button" class="bo-btn sec sm" data-g-camp-estado="activa" data-id="' + esc(x.id) + '">' + icono('fa-play') + ' Activar</button>' : '') +
        (x.estado !== 'finalizada' && !x.siempre_activa ? '<button type="button" class="bo-btn sec sm" data-g-camp-estado="finalizada" data-id="' + esc(x.id) + '">' + icono('fa-stop') + ' Finalizar</button>' : '') + '</footer>'
        : '<footer class="g-acc"><button type="button" class="bo-btn sec sm" data-g-camp="' + esc(x.id) + '">' + icono('fa-eye') + ' Ver</button></footer>') + '</article>';
  }).join('') + '</div><p class="bo-nota">La prueba gratuita básica (3 consultas en 7 días) es una campaña más, siempre activa para usuarios nuevos. El resultado de cada campaña (usos y cuántos acaban pagando) está en el Dashboard. Los cupones y pruebas los ejecutará Stripe.</p>';
  c.innerHTML = h;
}
function formCampana(x){
  var cfg = g.cfg, ed = puedeEditar('campanas'), dis = ed ? '' : ' disabled', planes = planesSuscripcion();
  var tipos = Object.keys(cfg.tipos_campana);
  return '<div class="g-editor"><form class="g-form" id="gFormCamp" novalidate>' +
    '<fieldset><legend>Tipo de campaña</legend><div class="g-tipos" role="radiogroup">' + tipos.map(function(t){
      return '<label class="g-tipo"><input type="radio" name="tipo" value="' + t + '"' + (x.tipo === t ? ' checked' : '') + (x.id || !ed ? ' disabled data-siempre="1"' : '') + '><span>' + icono(TIPO_ICO[t]) + '<b>' + esc(cfg.tipos_campana[t]) + '</b><small>' +
        { descuento: 'Porcentaje o importe, primer periodo o varios meses', prueba: 'Días o consultas gratis, con o sin tarjeta', consulta_gratis: 'Una o varias consultas sin coste', plan_superior: 'Probar un plan superior al precio del actual' }[t] + '</small></span></label>'; }).join('') + '</div></fieldset>' +
    '<div class="g-fila2">' + campo('Nombre', inp('nombre', x.nombre, 'text', ' maxlength="60"' + dis)) + campo('Estado al guardar', sel('estado', [['activa', 'Activa'], ['borrador', 'Borrador'], ['pausada', 'Pausada']], x.estado || 'activa', dis)) + '</div>' +
    campo('Descripción', inp('descripcion', x.descripcion, 'text', ' maxlength="240"' + dis)) +
    '<fieldset data-solo="descuento"><legend>Descuento</legend><div class="g-fila3">' + campo('Tipo', sel('descuento_tipo', [['pct', 'Porcentaje'], ['importe', 'Importe fijo (€)']], x.descuento_tipo || 'pct', dis)) +
      campo('Valor', numInp('descuento_valor', x.descuento_valor == null ? 20 : x.descuento_valor, 0.01, 0, dis)) + campo('Durante', '<div class="g-sufijo">' + numInp('duracion_meses', x.duracion_meses || 1, 1, 1, dis) + '<em>meses</em></div>') + '</div></fieldset>' +
    '<fieldset data-solo="prueba"><legend>Prueba gratis</legend><div class="g-fila3">' + campo('Consultas', numInp('consultas', x.consultas || 3, 1, 1, dis)) + campo('Días', numInp('dias', x.dias || 7, 1, 1, dis)) +
      '<div class="g-checks">' + chk('pide_tarjeta', '1', x.pide_tarjeta, 'Pedir tarjeta', false, dis) + '</div></div></fieldset>' +
    '<fieldset data-solo="consulta_gratis"><legend>Consultas gratis</legend>' + campo('Consultas', numInp('consultas', x.consultas || 1, 1, 1, dis)) + '</fieldset>' +
    '<fieldset data-solo="plan_superior"><legend>Plan superior</legend><div class="g-fila2">' + campo('Plan que se prueba', sel('plan_destino', planes.map(function(p){ return [p.id, p.nombre]; }), x.plan_destino || 'premium', dis)) +
      campo('Durante', '<div class="g-sufijo">' + numInp('duracion_meses', x.duracion_meses || 1, 1, 1, dis) + '<em>meses</em></div>') + '</div></fieldset>' +
    '<fieldset><legend>A quién va dirigida y cómo se aplica</legend><div class="g-fila2">' + campo('Destinatarios', sel('destinatarios', Object.keys(cfg.destinatarios).map(function(k){ return [k, cfg.destinatarios[k]]; }), x.destinatarios || 'nuevos', dis)) +
      campo('Aplicación', sel('aplicacion', [['automatica', 'Automática al contratar'], ['codigo', 'Con código promocional']], x.aplicacion || 'automatica', dis + ' data-g-aplic')) + '</div>' +
      '<div data-solo-cod>' + campo('Código promocional', inp('codigo', x.codigo, 'text', ' maxlength="24" style="text-transform:uppercase" placeholder="BIENVENIDA25"' + dis)) + '</div></fieldset>' +
    '<fieldset data-no="prueba consulta_gratis"><legend>Planes y periodos (ninguno marcado = todos)</legend><div class="g-checks">' + planes.map(function(p){ return chk('planes', p.id, (x.planes || []).indexOf(p.id) >= 0, p.nombre, true, dis); }).join('') + '</div>' +
      '<div class="g-checks">' + cfg.periodos.map(function(p){ return chk('periodos', p.id, (x.periodos || []).indexOf(p.id) >= 0, p.nombre, true, dis); }).join('') + '</div></fieldset>' +
    '<fieldset><legend>Vigencia y límite</legend><div class="g-fila3">' + campo('Inicio', inp('inicio', x.inicio || new Date().toISOString().slice(0, 10), 'date', dis)) + campo('Fin', inp('fin', x.fin || '', 'date', dis), 'Vacío = sin fecha de fin') +
      campo('Máximo de usos', numInp('max_usos', x.max_usos || '', 1, 1, dis + ' placeholder="Sin límite"')) + '</div></fieldset>' +
    '</form><aside class="g-editor-lado"><section id="gSimCamp" aria-live="polite"></section></aside></div>';
}
function ajustarFormCampana(){
  var f = $('gFormCamp'); if (!f) return;
  var t = (f.querySelector('[name=tipo]:checked') || {}).value;
  f.querySelectorAll('[data-solo]').forEach(function(fs){ var on = fs.dataset.solo === t; fs.hidden = !on; fs.querySelectorAll('input,select').forEach(function(i){ i.disabled = !on || !puedeEditar('campanas'); }); });
  f.querySelectorAll('[data-no]').forEach(function(fs){ fs.hidden = fs.dataset.no.split(' ').indexOf(t) >= 0; });
  var cod = f.querySelector('[data-solo-cod]'); if (cod) cod.hidden = f.querySelector('[name=aplicacion]').value !== 'codigo';
}
function abrirCampana(id){
  var x = id ? JSON.parse(JSON.stringify(g.cfg.campanas.find(function(c){ return c.id === id; }))) : { tipo: 'descuento', estado: 'activa', descuento_tipo: 'pct', descuento_valor: 20, duracion_meses: 1, destinatarios: 'nuevos', aplicacion: 'automatica', planes: [], periodos: [] };
  g.campana = x;
  var ed = puedeEditar('campanas');
  U.abrirDrawer(id ? (ed ? 'Editar campaña · ' : 'Campaña · ') + x.nombre : 'Nueva campaña', formCampana(x),
    { clase: 'g-drawer', pie: ed ? '<span class="g-pie-estado" id="gCampEstado"></span><button type="button" class="bo-btn sec" data-cerrar-drawer>Cancelar</button><button type="button" class="bo-btn" data-g-camp-guardar>Guardar campaña</button>' : '' });
  ajustarFormCampana(); simularCampana();
}
function datosCampana(){ if (!puedeEditar('campanas')) return JSON.parse(JSON.stringify(g.campana)); var d = leerForm($('gFormCamp')); d.tipo = d.tipo || g.campana.tipo; return d; }
var simularCampana = debounce(function(){
  var f = $('gFormCamp'); if (!f) return;
  api('/api/bo/negocio/campanas/simular', { method: 'POST', body: datosCampana() }).then(function(s){
    $('gSimCamp').innerHTML = tablaSimCamp(s);
    var est = $('gCampEstado'); if (est) est.innerHTML = s.bajo_minimo ? '<span class="n-ko">' + icono('fa-exclamation-triangle') + ' Baja del margen mínimo</span>' : '<span class="n-ok">' + icono('fa-check') + ' Margen correcto</span>';
  }).catch(function(e){ $('gSimCamp').innerHTML = alerta('warning', esc(e.message)); });
}, 300);
function tablaSimCamp(s){
  if (s.coste_por_uso != null) return '<div class="t-Drawer-sec"><h3>Control del margen</h3>' + alerta('info', esc(s.lectura)) + '</div>';
  return '<div class="t-Drawer-sec"><h3>Control del margen · primer periodo</h3>' + (s.bajo_minimo ? alerta('warning', '<b>Esta campaña baja del margen mínimo (' + pct(s.minimo_pct, 0) + ').</b> Se puede activar, pero el sistema pedirá confirmación y solo quien edita los precios puede hacerlo.') : '') +
    (s.filas.length ? '<div class="bo-tabla-wrap"><table class="bo-tabla compacta tarjetas"><thead><tr><th>Plan</th><th>Periodo</th><th>Precio normal</th><th>Con campaña</th><th>Margen</th></tr></thead><tbody>' + s.filas.map(function(f){
      return '<tr><td class="t-cab-movil"><b>' + esc(f.plan) + '</b></td><td data-label="Periodo">' + esc(f.periodo) + '</td><td data-label="Precio normal">' + eur(f.precio_normal) + '</td><td data-label="Con campaña">' + eur(f.precio_campana) + '</td><td data-label="Margen">' + margenTag(f.margen_pct, f.ok) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="bo-nota">Ningún plan afectado con esta selección.</p>') + '</div>';
}
function guardarCampana(b, confirmar){
  var d = datosCampana(); if (confirmar) d.confirmar_bajo_minimo = true;
  b.disabled = true;
  api(g.campana.id ? '/api/bo/negocio/campanas/' + encodeURIComponent(g.campana.id) : '/api/bo/negocio/campanas', { method: g.campana.id ? 'PUT' : 'POST', body: d }).then(function(r){
    U.cerrarDrawer(); P.toast('Campaña «' + r.campana.nombre + '» guardada (' + r.campana.estado + ').'); recargar();
  }).catch(function(e){
    b.disabled = false;
    if (e.datos.requiere_confirmacion){
      var malas = (e.datos.simulacion.filas || []).filter(function(f){ return !f.ok; }).map(function(f){ return f.plan + ' ' + f.periodo.toLowerCase() + ': ' + pct(f.margen_pct); }).join(' · ');
      P.modal({ titulo: 'Activar por debajo del margen mínimo', texto: 'Margen resultante: ' + malas + '. ¿Activar la campaña igualmente? Queda registrado con tu nombre.', boton: 'Activar igualmente', peligro: true })
        .then(function(ok){ if (ok) guardarCampana(b, true); });
      return;
    }
    aviso(e); if (e.datos.simulacion) $('gSimCamp').innerHTML = tablaSimCamp(e.datos.simulacion);
  });
}
function estadoCampana(id, estado, confirmar){
  api('/api/bo/negocio/campanas/' + encodeURIComponent(id) + '/estado', { method: 'POST', body: { estado: estado, confirmar: !!confirmar } }).then(function(r){
    P.toast('Campaña «' + r.campana.nombre + '»: ' + estado + '.'); recargar();
  }).catch(function(e){
    if (e.datos.requiere_confirmacion) return P.modal({ titulo: 'Activar por debajo del margen mínimo', texto: e.message + ' Queda registrado con tu nombre.', boton: 'Activar igualmente', peligro: true })
      .then(function(ok){ if (ok) estadoCampana(id, estado, true); });
    aviso(e);
  });
}

/* ---------- Límites y expediente ---------- */
var FILAS_LIM = [['consultas', 'mes', 'Consultas al mes', 'Cuota del plan: se renueva en la fecha de alta y no se acumula'], ['consultas', 'semana', 'Consultas a la semana', 'Ventana móvil de 7 días'], ['consultas', 'dia', 'Consultas al día', 'Se renueva a medianoche (hora de Madrid)'],
  ['expediente', 'activos', 'Expedientes activos', ''], ['expediente', 'docs_mes', 'Documentos subidos al mes', ''], ['expediente', 'docs_expediente', 'Documentos por expediente', ''],
  ['expediente', 'tam_mb', 'Tamaño máximo por documento (MB)', ''], ['expediente', 'conservacion_dias', 'Conservación sin actividad (días)', 'Se avisa 15 días antes de borrar'], ['expediente', 'memoria_intercambios', 'Memoria: últimos intercambios', 'Además del resumen del caso']];
var CUENTA = { pregunta: 'Una pregunta y su respuesta', pregunta_expediente: 'Pregunta dentro de un expediente', respuesta_fallida: 'Respuesta que falla o no llega', documento: 'Subir un documento (tiene su propio límite)', mensaje_despacho: 'Mensajes con el despacho' };
function tabLimites(c){
  var cfg = g.cfg, ed = puedeEditar('limites'), dis = ed ? '' : ' disabled';
  var planes = planesSuscripcion().filter(function(p){ return p.estado !== 'retirado'; });
  var h = '<div class="g-barra"><div class="g-barra-txt"><b>Límites de uso por ventanas y del expediente.</b> Las ventanas avisan antes de agotarse y nunca se corta una respuesta a medias. Cambiar las consultas al mes cambia el coste: se vuelve a comprobar el margen.</div>' + soloLectura('limites') + '</div>';
  h += '<div class="g-ventanas"><div class="bo-card bo-pad"><h4>' + icono('fa-sun-o') + ' Ventana diaria</h4><p>Se renueva a medianoche (hora de Madrid). Evita picos y usos automatizados.</p></div><div class="bo-card bo-pad"><h4>' + icono('fa-calendar-o') + ' Ventana semanal</h4><p>Ventana móvil de 7 días. Frena a quien agota la cuota del mes en un fin de semana.</p></div><div class="bo-card bo-pad"><h4>' + icono('fa-calendar') + ' Ventana mensual</h4><p>Es la cuota del plan. Se renueva en la fecha de alta y no se acumula.</p></div></div>';
  h += '<form id="gFormLim" class="bo-card" novalidate><div class="bo-cab"><h3>Topes por plan</h3>' + (ed ? '<button type="button" class="bo-btn" data-g-lim-guardar>Guardar límites</button>' : '') + '</div><div class="bo-tabla-wrap"><table class="bo-tabla g-matriz tarjetas"><thead><tr><th>Límite</th>' + planes.map(function(p){ return '<th>' + esc(p.nombre) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    FILAS_LIM.map(function(f){
      return '<tr><td class="t-cab-movil"><b>' + esc(f[2]) + '</b>' + (f[3] ? '<small>' + esc(f[3]) + '</small>' : '') + '</td>' + planes.map(function(p){
        return '<td data-label="' + esc(p.nombre) + '">' + numInp('planes.' + p.id + '.' + f[0] + '.' + f[1], (p[f[0]] || {})[f[1]], 1, f[0] === 'consultas' ? 1 : 0, dis + ' aria-label="' + esc(f[2] + ' · ' + p.nombre) + '"') + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>' +
    '<div class="g-lim-pie">' + campo('Aviso al llegar al', '<div class="g-sufijo">' + numInp('general.aviso_pct', cfg.limites.aviso_pct, 1, 50, dis) + '<em>% de la cuota</em></div>', 'Con la hora de renovación y la opción de subir de plan.') + '</div><div id="gLimErr" aria-live="polite"></div></form>';
  h += '<div class="bo-grid g-2b"><div class="bo-card bo-pad"><h3>Qué cuenta como consulta</h3>' + Object.keys(CUENTA).map(function(k){ return '<div class="bo-fila"><span>' + esc(CUENTA[k]) + '</span><b>' + (cfg.limites.cuenta[k] == null ? '—' : cfg.limites.cuenta[k]) + '</b></div>'; }).join('') + '</div>' +
    '<div class="bo-card bo-pad"><h3>Por qué limitar</h3><p class="bo-nota">Cada documento se procesa (OCR y análisis) y la memoria se envía al modelo en cada pregunta: más contexto, más coste por consulta. La IA recibe un resumen del caso y los últimos intercambios, no la conversación entera; así el coste por consulta se mantiene cerca de ' + eur(cfg.costes ? cfg.costes.coste_consulta : 0.25) + '. La prueba gratuita no incluye expediente.</p></div></div>';
  c.innerHTML = h;
}
function guardarLimites(b){
  var d = leerForm($('gFormLim'));
  b.disabled = true;
  api('/api/bo/negocio/limites', { method: 'PUT', body: d }).then(function(){ P.toast('Límites guardados.'); recargar(); })
    .catch(function(e){ b.disabled = false; $('gLimErr').innerHTML = alerta('warning', esc(e.message)); aviso(e); });
}

/* ---------- Suscriptores ---------- */
var EST_SUB = { activa: 't-green', cancelada: 't-orange', suspendida: 't-red', uso_indebido: 't-red', baja: 't-gray', prueba: 't-blue', prueba_vencida: 't-gray', consulta_unica: 't-purple' };
var FASE = { reintentando: ['Reintentando', 't-orange'], suspendido: ['Suspendido', 't-red'], aviso_borrado: ['Aviso de borrado', 't-red'], pendiente_borrado: ['Borrado pendiente', 't-red'], recuperado: ['Recuperado', 't-green'], borrado: ['Borrado', 't-gray'], baja: ['Baja', 't-gray'] };
function tagSub(e, txt){ return tag(txt || (g.cfg && g.cfg.estados_sub[e]) || e, EST_SUB[e] || 't-gray'); }
function barraUso(n, tope, aviso){
  if (tope == null) return '<span class="g-gris">—</span>';
  var p = tope ? Math.min(100, Math.round(100 * n / tope)) : 0;
  return '<div class="g-uso' + (aviso ? ' aviso' : '') + '" title="' + n + ' de ' + tope + '"><div class="g-uso-txt"><b>' + n + '</b>/' + tope + '</div><div class="bo-meter ' + (p >= 100 ? 'red' : aviso ? 'gold' : '') + '"><i style="width:' + p + '%"></i></div></div>';
}
function tabSuscriptores(c){
  var f = g.subs;
  var qs = '?q=' + encodeURIComponent(f.q) + '&estado=' + encodeURIComponent(f.estado) + '&plan=' + encodeURIComponent(f.plan) + '&alerta=' + encodeURIComponent(f.alerta) + '&limite=' + f.limite;
  api('/api/bo/negocio/suscriptores' + qs).then(function(d){
    var ed = d.puede_editar, est = d.estados, tot = Object.keys(est).reduce(function(a, k){ return a + est[k]; }, 0);
    var chips = [['', 'Todos', tot]].concat(['activa', 'prueba', 'suspendida', 'uso_indebido', 'cancelada', 'consulta_unica', 'prueba_vencida', 'baja'].filter(function(k){ return est[k]; }).map(function(k){ return [k, g.cfg.estados_sub[k].split(' (')[0], est[k]]; }));
    var h = '<div class="bo-card t-IRR-region"><div class="bo-cab"><h3>Suscriptores <span class="bo-tag t-gray">' + ent(d.total) + '</span></h3><div class="g-acc">' + soloLectura('suscriptores') +
        (ed ? '<button type="button" class="bo-btn sec" data-g-vincular>' + icono('fa-user-plus') + ' Alta de un cliente</button>' : '') +
        '<button type="button" class="bo-btn sec" data-g-subs-csv>' + icono('fa-download') + ' CSV</button></div></div>' +
      '<div class="t-IRR-toolbar"><label class="t-IRR-search">' + icono('fa-search') + '<input type="search" id="gSubQ" value="' + esc(f.q) + '" placeholder="Nombre, correo o plan…" aria-label="Buscar suscriptores"></label>' +
        '<select class="bo-sel" id="gSubPlan" aria-label="Plan"><option value="">Todos los planes</option>' + g.cfg.planes.map(function(p){ return '<option value="' + esc(p.id) + '"' + (f.plan === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="bo-chip' + (f.alerta === 'uso' ? ' on' : '') + '" data-g-sub-alerta="uso">' + icono('fa-exclamation-triangle') + ' Uso anómalo o al límite</button></div>' +
      '<div class="bo-filtros t-IRR-filtros" role="group" aria-label="Estado">' + chips.map(function(x){ return '<button type="button" class="bo-chip' + (f.estado === x[0] ? ' on' : '') + '" data-g-sub-estado="' + x[0] + '">' + esc(x[1]) + ' <em>' + ent(x[2]) + '</em></button>'; }).join('') + '</div>';
    if (!d.filas.length) h += vacio('Ningún suscriptor con ese filtro.');
    else h += '<div class="bo-tabla-wrap"><table class="bo-tabla tarjetas g-tabla-subs"><thead><tr><th>Suscriptor</th><th>Plan</th><th>Estado</th><th>Uso del mes</th><th>€/mes</th><th>Renovación</th><th></th></tr></thead><tbody>' + d.filas.map(function(s){
      return '<tr data-g-sub="' + esc(s.id) + '" tabindex="0"><td class="t-cab-movil"><div class="bo-cli"><span class="bo-av">' + esc(P.iniciales(s.nombre || '?')) + '</span><div class="g-sub-nom"><b>' + esc(s.nombre || '—') + '</b><small>' + esc(s.email || '') + '</small></div>' + (s.demo ? '' : tag('Cliente real', 't-blue')) + '</div></td>' +
        '<td data-label="Plan">' + esc(s.plan_nombre) + (s.periodo ? ' <small>· ' + esc(nombrePeriodo(s.periodo)) + '</small>' : '') + (s.cambio_pendiente ? ' ' + tag('Cambio al renovar', 't-blue') : '') + '</td>' +
        '<td data-label="Estado">' + tagSub(s.estado) + (s.impago ? ' ' + tag((FASE[s.impago] || [s.impago])[0], (FASE[s.impago] || [0, 't-red'])[1]) : '') + '</td>' +
        '<td data-label="Uso del mes">' + barraUso(s.uso_mes, s.tope_mes, s.aviso_uso) + '</td>' +
        '<td data-label="€/mes">' + (s.mensual ? eur(s.mensual) : '—') + '</td><td data-label="Renovación">' + fechaCorta(s.renovacion) + '</td>' +
        '<td class="t-acc-movil">' + (s.alertas_uso ? '<span class="g-alerta-ico" title="Alerta de uso indebido">' + icono('fa-exclamation-triangle') + '</span>' : '') + '<button type="button" class="bo-btn sec sm" data-g-sub="' + esc(s.id) + '">Ficha</button></td></tr>';
    }).join('') + '</tbody></table></div>';
    h += '<div class="t-IRR-pagination">' + (d.filas.length < d.total ? '<button type="button" class="bo-btn sec sm" data-g-mas>Ver más</button> ' : '') + 'Filas 1 - ' + d.filas.length + ' de ' + ent(d.total) + '</div></div>';
    h += '<p class="bo-nota">Los suscriptores sin la etiqueta «Cliente real» forman parte de los datos de demostración (252 activos: 60 % Esencial, 30 % Estándar, 10 % Premium y un 50 % de uso), como el mock del documento de precios.</p>';
    g.subsFilas = d.filas;
    c.innerHTML = h;
  }).catch(function(e){ c.innerHTML = '<div class="bo-card">' + vacio(esc(e.message)) + '</div>'; });
}
function verSuscriptor(id){
  U.abrirDrawer('Suscriptor', '<div class="bo-cargando"><span class="dots">Cargando la ficha</span></div>', { clase: 'g-drawer medio' });
  (g.cfg ? Promise.resolve() : cargarCfg()).then(function(){ return api('/api/bo/negocio/suscriptores/' + encodeURIComponent(id)); }).then(function(r){
    g.ficha = r.ficha; pintarFicha(r);
  }).catch(function(e){ $('boDrawerCuerpo').innerHTML = vacio(esc(e.message)); });
}
BO.verSuscriptor = verSuscriptor;
function ventana(nombre, v){
  if (!v || v.tope == null) return '';
  return '<div class="g-ventana' + (v.agotada ? ' agotada' : v.aviso ? ' aviso' : '') + '"><div><span>' + nombre + '</span><b>' + v.usadas + ' / ' + v.tope + '</b></div><div class="bo-meter ' + (v.agotada ? 'red' : v.aviso ? 'gold' : '') + '"><i style="width:' + Math.min(100, v.pct || 0) + '%"></i></div><small>Renueva: ' + esc(/ 00:00$/.test(v.renueva) ? 'a medianoche' : String(v.renueva).length === 10 ? fechaCorta(v.renueva) : v.renueva) + '</small></div>';
}
function pintarFicha(r){
  var s = r.ficha, ed = r.puede_editar, cfg = g.cfg, v = s.ventanas, imp = s.impago_estado, pl = s.limites_plan || {}, e = pl.expediente || {};
  $('boDrawerTit').textContent = s.nombre || 'Suscriptor';
  var h = '<div class="g-ficha-cab"><span class="bo-perfil-av">' + esc(P.iniciales(s.nombre || '?')) + '</span><div><h3>' + esc(s.nombre || '—') + '</h3><p>' + esc(s.email || '') + (s.demo ? ' · ejemplo' : ' · cliente de Legal IA') + '</p></div>' + tagSub(s.estado, s.estado_txt) + '</div>';
  if ((s.alertas_uso || []).length) h += alerta('danger', '<b>Alerta de uso indebido (posible reventa).</b> ' + esc(s.alertas_uso.map(function(a){ return a.detalle; }).join(' · ')) + '<br><small>Uso profesional sí, reventa no: muchas personas distintas en una cuenta → aviso, suspensión y baja sin reembolso.</small>');
  if (s.aviso_precio) h += alerta('info', 'Aviso de nuevo precio enviado: ' + eur(s.aviso_precio.precio_nuevo) + ' + IVA/mes desde la próxima renovación.');
  if (s.cambio_pendiente) h += alerta('info', 'Cambio programado para la renovación (' + fechaCorta(s.cambio_pendiente.desde) + '): ' + esc(nombrePlan(s.cambio_pendiente.plan)) + ' · ' + esc(nombrePeriodo(s.cambio_pendiente.periodo)) + '.');
  h += '<section class="t-Drawer-sec"><h3>Plan y facturación</h3><div class="bo-info">' + U.filaInfo('Plan', esc(s.plan_nombre || '—')) + (s.periodo ? U.filaInfo('Periodo', esc(nombrePeriodo(s.periodo))) : '') +
    (s.precio_contratado ? U.filaInfo('Precio contratado', eur(s.precio_contratado) + ' + IVA' + (s.version_plan ? ' · v' + s.version_plan : '')) + U.filaInfo('Equivale a', eur(s.mensual) + '/mes sin IVA') : '') +
    U.filaInfo('Alta', fechaCorta(s.alta)) + (s.renovacion ? U.filaInfo('Renovación', fechaCorta(s.renovacion)) : '') + U.filaInfo('Origen', esc(s.origen === 'prueba' ? 'Prueba gratuita' : s.campana ? 'Campaña' : 'Directo')) +
    (s.campana ? U.filaInfo('Campaña', esc(((cfg.campanas || []).find(function(c){ return c.id === s.campana; }) || {}).nombre || s.campana)) : '') +
    ((s.cortesia || {}).consultas || (s.cortesia || {}).dias ? U.filaInfo('Cortesía', ((s.cortesia.consultas ? '+' + s.cortesia.consultas + ' consultas ' : '') + (s.cortesia.dias ? '+' + s.cortesia.dias + ' días' : ''))) : '') +
    (s.expedientes_activos != null ? U.filaInfo('Expedientes', s.expedientes_activos + ' de ' + (e.activos || 0)) : '') + '</div></section>';
  if (v) h += '<section class="t-Drawer-sec"><h3>Consumo · ventanas de uso</h3><div class="g-ventanas-ficha">' + ventana('Hoy', v.dia) + ventana('Últimos 7 días', v.semana) + ventana('Este ciclo', v.mes) + '</div><p class="bo-nota">Aviso al ' + cfg.limites.aviso_pct + ' % con la hora de renovación y la opción de subir de plan. Documentos: ' + (e.docs_mes || 0) + ' al mes · ' + (e.tam_mb || 0) + ' MB por documento.</p></section>';
  if (imp) h += '<section class="t-Drawer-sec"><h3>Impago</h3><div class="bo-info">' + U.filaInfo('Fase', tag((FASE[imp.fase] || [imp.fase])[0], (FASE[imp.fase] || [0, 't-gray'])[1])) + U.filaInfo('Importe', eur(imp.importe)) + U.filaInfo('Desde', fechaCorta(imp.desde) + (imp.dias != null ? ' (' + imp.dias + ' días)' : '')) +
    (imp.motivo ? U.filaInfo('Motivo', esc(imp.motivo)) : '') + (imp.borrado_previsto && !imp.resuelto ? U.filaInfo('Borrado previsto', fechaCorta(imp.borrado_previsto)) : '') + (imp.recuperado_en ? U.filaInfo('Recuperado', fechaCorta(imp.recuperado_en) + ' · ' + eur(imp.importe_recuperado)) : '') + '</div>' +
    (ed && !imp.resuelto ? '<div class="g-acc g-acc-ficha">' + accionesImpago(s.id, imp.fase) + '</div>' : '') + '</section>';
  if (ed) h += '<section class="t-Drawer-sec"><h3>Acciones</h3><div class="g-acc g-acc-ficha">' +
    (pl.tipo === 'suscripcion' ? '<button type="button" class="bo-btn sec" data-g-acc="cambiar_plan">' + icono('fa-exchange') + ' Cambiar de plan</button><button type="button" class="bo-btn sec" data-g-acc="cambiar_periodo">' + icono('fa-calendar') + ' Cambiar periodo</button>' +
      '<button type="button" class="bo-btn sec" data-g-acc="cortesia_consultas">' + icono('fa-plus') + ' Consultas de cortesía</button><button type="button" class="bo-btn sec" data-g-acc="cortesia_dias">' + icono('fa-gift') + ' Días de cortesía</button>' +
      '<button type="button" class="bo-btn sec" data-g-acc="aplicar_campana">' + icono('fa-bullhorn') + ' Aplicar campaña</button>' : '') +
    (s.estado === 'uso_indebido' || s.estado === 'suspendida' ? '<button type="button" class="bo-btn sec" data-g-acc="reactivar">' + icono('fa-play') + ' Reactivar</button>'
      : s.estado !== 'baja' ? '<button type="button" class="bo-btn peligro" data-g-acc="suspender_uso_indebido">' + icono('fa-ban') + ' Suspender por uso indebido</button>' : '') +
    (s.estado !== 'baja' ? '<button type="button" class="bo-btn peligro" data-g-acc="baja">' + icono('fa-user-times') + ' Dar de baja</button>' : '') + '</div></section>';
  h += '<section class="t-Drawer-sec"><h3>Historial</h3>' + ((s.historial || []).length ? '<ul class="g-hist">' + s.historial.slice().reverse().slice(0, 30).map(function(x){
      return '<li><b>' + esc(x.accion.replace(/_/g, ' ')) + '</b><span>' + esc(U.fecha(x.ts)) + ' · ' + esc(x.autor) + '</span>' + (x.detalle ? '<p>' + esc(x.detalle) + '</p>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="bo-nota">Sin cambios.</p>') + '</section>';
  $('boDrawerCuerpo').innerHTML = h;
}
function accionesImpago(id, fase){
  var b = function(acc, txt, ico, peligro){ return '<button type="button" class="bo-btn ' + (peligro ? 'peligro' : 'sec') + ' sm" data-g-acc="' + acc + '" data-id="' + esc(id) + '">' + icono(ico) + ' ' + txt + '</button>'; };
  if (fase === 'reintentando') return b('reintentar_cobro', 'Reintentar ahora', 'fa-refresh') + b('recordatorio', 'Recordatorio', 'fa-envelope-o');
  if (fase === 'suspendido') return b('reintentar_cobro', 'Reintentar', 'fa-refresh') + b('ampliar_plazo', 'Ampliar plazo', 'fa-clock-o') + b('regalar_dias', 'Regalar días', 'fa-gift');
  if (fase === 'aviso_borrado' || fase === 'pendiente_borrado') return b('reintentar_cobro', 'Reintentar', 'fa-refresh') + b('aplazar_borrado', 'Aplazar borrado', 'fa-pause') + b('baja', 'Dar de baja', 'fa-user-times', true);
  return '';
}
function accionSub(id, acc){
  var s = g.ficha && g.ficha.id === id ? g.ficha : null, cfg = g.cfg;
  var enviar = function(datos){
    datos.accion = acc;
    return api('/api/bo/negocio/suscriptores/' + encodeURIComponent(id) + '/accion', { method: 'POST', body: datos }).then(function(r){
      P.toast(((r.ficha.historial || []).slice(-1)[0] || {}).detalle || 'Hecho.');
      if (!$('boDrawer').hidden && g.ficha && g.ficha.id === id) pintarFicha({ ficha: r.ficha, puede_editar: true }); g.ficha = r.ficha;
      if (BO.secciones && $('bo-gestion').classList.contains('on') && (g.tab === 'suscriptores' || g.tab === 'impagos')) pintarTab();
    }).catch(aviso);
  };
  var planes = planesSuscripcion().filter(function(p){ return p.estado !== 'retirado'; });
  if (acc === 'cambiar_plan') return P.modal({ titulo: 'Cambiar de plan', texto: 'Subir de plan: efecto inmediato y se cobra la diferencia prorrateada por los días que quedan. Bajar de plan: se aplica en la siguiente renovación.',
      campos: [{ etiqueta: 'Plan', tipo: 'select', valor: s ? s.plan : planes[0].id, opciones: planes.map(function(p){ return { valor: p.id, texto: p.nombre + ' · ' + eur(p.precio) + ' + IVA/mes' }; }) }], boton: 'Cambiar' })
    .then(function(v){ if (v) enviar({ plan: v[0] }); });
  if (acc === 'cambiar_periodo'){
    var pl = cfg.planes.find(function(p){ return s && p.id === s.plan; }) || planes[0];
    return P.modal({ titulo: 'Cambiar periodo de pago', texto: 'Se aplica en la siguiente renovación.', campos: [{ etiqueta: 'Periodo', tipo: 'select', valor: s ? s.periodo : 'mensual',
      opciones: cfg.periodos.filter(function(p){ return (pl.periodos || []).indexOf(p.id) >= 0; }).map(function(p){ return { valor: p.id, texto: p.nombre + (p.descuento_pct ? ' (−' + num(p.descuento_pct, 0) + ' %)' : '') }; }) }], boton: 'Programar' })
      .then(function(v){ if (v) enviar({ periodo: v[0] }); });
  }
  if (acc === 'cortesia_consultas' || acc === 'cortesia_dias' || acc === 'ampliar_plazo' || acc === 'aplazar_borrado' || acc === 'regalar_dias'){
    var t = { cortesia_consultas: ['Consultas de cortesía', 'Se suman a la cuota del ciclo actual.', 'Consultas', '5'], cortesia_dias: ['Días de cortesía', 'Retrasan la próxima renovación.', 'Días', '7'],
              ampliar_plazo: ['Ampliar plazo', 'Retrasa las fases del impago (aviso y borrado).', 'Días', '7'], aplazar_borrado: ['Aplazar borrado', 'Retrasa el borrado de expedientes, documentos e historial.', 'Días', '15'],
              regalar_dias: ['Regalar días', 'Acceso de cortesía mientras regulariza el pago; también retrasa las fases del impago.', 'Días', '7'] }[acc];
    return P.modal({ titulo: t[0], texto: t[1], campos: [{ etiqueta: t[2], valor: t[3] }], boton: 'Aplicar' }).then(function(v){ if (v) enviar({ n: v[0] }); });
  }
  if (acc === 'aplicar_campana'){
    var activas = (cfg.campanas || []).filter(function(c){ return c.estado === 'activa'; });
    if (!activas.length) return P.toast('No hay campañas activas.');
    return P.modal({ titulo: 'Aplicar campaña', campos: [{ etiqueta: 'Campaña', tipo: 'select', valor: activas[0].id, opciones: activas.map(function(c){ return { valor: c.id, texto: c.nombre }; }) }], boton: 'Aplicar' })
      .then(function(v){ if (v) enviar({ campana: v[0] }); });
  }
  if (acc === 'suspender_uso_indebido') return P.modal({ titulo: 'Suspender por uso indebido', texto: 'Se bloquean las consultas nuevas. Queda en el registro con tu nombre.', campos: [{ etiqueta: 'Motivo', multilinea: true, valor: s && (s.alertas_uso || []).length ? s.alertas_uso[0].detalle : '' }], boton: 'Suspender', peligro: true })
    .then(function(v){ if (v) enviar({ motivo: v[0] }); });
  if (acc === 'baja') return P.modal({ titulo: 'Dar de baja', texto: 'La suscripción deja de renovarse y se cierran sus impagos. No hay reembolso del periodo pagado.', campos: [{ etiqueta: 'Motivo', valor: '' }], boton: 'Dar de baja', peligro: true })
    .then(function(v){ if (v) enviar({ motivo: v[0] }); });
  if (acc === 'reintentar_cobro') return P.modal({ titulo: 'Reintentar el cobro', texto: 'Prototipo: sin Stripe, el reintento se simula como cobrado. En producción lo decide Stripe.', boton: 'Reintentar' }).then(function(ok){ if (ok) enviar({}); });
  return enviar({});
}
function vincularCliente(){
  Promise.all([api('/api/bo/clientes'), api('/api/bo/negocio/suscriptores?limite=500')]).then(function(x){
    var con = {}; x[1].filas.forEach(function(s){ if (s.cliente_id) con[s.cliente_id] = 1; });
    var libres = x[0].clientes.filter(function(c){ return !con[c.id]; });
    if (!libres.length) return P.toast('Todos los clientes de Legal IA tienen ya una suscripción.');
    var planes = planesSuscripcion().filter(function(p){ return p.estado !== 'retirado'; });
    P.modal({ titulo: 'Alta de un cliente', texto: 'Suscripción para un cliente de Legal IA. Sus consultas reales se cuentan contra la cuota del plan.', campos: [
      { etiqueta: 'Cliente', tipo: 'select', valor: libres[0].id, opciones: libres.map(function(c){ return { valor: c.id, texto: c.nombre + ' · ' + c.email }; }) },
      { etiqueta: 'Plan', tipo: 'select', valor: planes[0].id, opciones: planes.map(function(p){ return { valor: p.id, texto: p.nombre }; }) },
      { etiqueta: 'Periodo', tipo: 'select', valor: 'mensual', opciones: g.cfg.periodos.filter(function(p){ return p.activo; }).map(function(p){ return { valor: p.id, texto: p.nombre }; }) }], boton: 'Dar de alta' })
    .then(function(v){ if (!v) return; api('/api/bo/negocio/suscriptores/vincular', { method: 'POST', body: { cliente_id: v[0], plan: v[1], periodo: v[2] } }).then(function(){ P.toast('Suscripción creada.'); pintarTab(); }).catch(aviso); });
  }).catch(aviso);
}

/* ---------- Impagos ---------- */
function tabImpagos(c){
  api('/api/bo/negocio/impagos').then(function(d){
    var ed = d.puede_editar, pl = d.plazos, abiertos = d.filas.filter(function(f){ return ['reintentando', 'suspendido', 'aviso_borrado', 'pendiente_borrado'].indexOf(f.fase) >= 0; }), cerrados = d.filas.filter(function(f){ return abiertos.indexOf(f) < 0; });
    var riesgo = abiertos.reduce(function(a, f){ return a + (f.importe || 0); }, 0);
    var h = '<div class="g-barra"><div class="g-barra-txt"><b>Impagos.</b> Si un cobro falla se suspenden las consultas nuevas; si no se regulariza, se borran expedientes, documentos e historial para no consumir recursos (solo se conservan los datos de cobro que exige la ley).</div>' + soloLectura('suscriptores') + '</div>';
    h += '<form class="bo-card g-pasos" id="gFormPlazos" novalidate><div class="g-paso"><b>Día 0</b><span>Falla el cobro</span><small>Aviso por correo y en la app. Se suspenden las consultas nuevas.</small></div>' +
      '<div class="g-paso"><b>Días 1–' + (ed ? numInp('reintentos_dias', pl.reintentos_dias, 1, 1, ' aria-label="Días de reintentos"') : pl.reintentos_dias) + '</b><span>Reintentos</span><small>Stripe reintenta el cobro; si se paga, el acceso vuelve al momento.</small></div>' +
      '<div class="g-paso"><b>Día ' + (ed ? numInp('aviso_borrado_dia', pl.aviso_borrado_dia, 1, 1, ' aria-label="Día del aviso de borrado"') : pl.aviso_borrado_dia) + '</b><span>Aviso de borrado</span><small>Se avisa del borrado; puede descargar sus documentos.</small></div>' +
      '<div class="g-paso fin"><b>Día ' + (ed ? numInp('borrado_dia', pl.borrado_dia, 1, 1, ' aria-label="Día del borrado"') : pl.borrado_dia) + '</b><span>Borrado</span><small>Se eliminan expedientes, documentos y conversaciones.</small></div>' +
      (ed ? '<div class="g-pasos-acc"><button type="button" class="bo-btn sec sm" data-g-plazos>Guardar plazos</button></div>' : '') + '</form>';
    var porFase = function(f){ return abiertos.filter(function(x){ return x.fase === f; }).length; };
    h += '<div class="bo-grid g-kpis">' + U.kpi('fa-refresh', 'Reintentando', porFase('reintentando'), '<small>días 1–' + pl.reintentos_dias + '</small>') + U.kpi('fa-ban', 'Suspendidos', porFase('suspendido'), '<small>consultas bloqueadas</small>') +
      U.kpi('fa-trash-o', 'Aviso de borrado', porFase('aviso_borrado') + porFase('pendiente_borrado'), '<small>desde el día ' + pl.aviso_borrado_dia + '</small>') + U.kpi('fa-eur', 'Importe en riesgo', eur(riesgo), '<small>' + abiertos.length + ' cobros abiertos</small>') + '</div>';
    h += '<div class="bo-card"><div class="bo-cab"><h3>Cobros fallidos abiertos</h3><button type="button" class="bo-btn sec sm" data-g-imp-csv>' + icono('fa-download') + ' Exportar listado</button></div>' +
      (abiertos.length ? '<div class="bo-tabla-wrap"><table class="bo-tabla tarjetas"><thead><tr><th>Suscriptor</th><th>Importe</th><th>Desde</th><th>Fase</th><th>Próximo hito</th><th>Gestión</th>' + (ed ? '<th>Acciones</th>' : '') + '</tr></thead><tbody>' + abiertos.map(function(f){
        var fa = FASE[f.fase] || [f.fase, 't-gray'];
        return '<tr><td class="t-cab-movil"><button type="button" class="g-link" data-g-sub="' + esc(f.id) + '"><b>' + esc(f.nombre || '—') + '</b></button><small class="g-gris">' + esc(f.motivo || '') + '</small></td>' +
          '<td data-label="Importe">' + eur(f.importe) + '</td><td data-label="Desde">' + fechaCorta(f.desde) + ' <small>(' + f.dias + ' d)</small></td><td data-label="Fase">' + tag(fa[0], fa[1]) + '</td>' +
          '<td data-label="Próximo hito">' + (f.fase === 'reintentando' || f.fase === 'suspendido' ? 'Aviso ' + fechaCorta(f.aviso_previsto) : 'Borrado ' + fechaCorta(f.borrado_previsto)) + '</td>' +
          '<td data-label="Gestión"><small>' + f.intentos + ' intentos' + (f.recordatorios ? ' · ' + f.recordatorios + ' recordatorios' : '') + (f.ampliacion_dias ? ' · +' + f.ampliacion_dias + ' días' : '') + '</small></td>' +
          (ed ? '<td class="t-acc-movil"><div class="g-acc">' + accionesImpago(f.id, f.fase) + '</div></td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>' : vacio('No hay cobros fallidos abiertos.')) + '</div>';
    if (cerrados.length) h += '<div class="bo-card"><div class="bo-cab"><h3>Recuperados y cerrados</h3></div><div class="bo-tabla-wrap"><table class="bo-tabla tarjetas"><thead><tr><th>Suscriptor</th><th>Importe</th><th>Desde</th><th>Resultado</th></tr></thead><tbody>' + cerrados.map(function(f){
      var fa = FASE[f.fase] || [f.fase, 't-gray'];
      return '<tr><td class="t-cab-movil"><button type="button" class="g-link" data-g-sub="' + esc(f.id) + '"><b>' + esc(f.nombre || '—') + '</b></button></td><td data-label="Importe">' + eur(f.importe) + '</td><td data-label="Desde">' + fechaCorta(f.desde) + '</td><td data-label="Resultado">' + tag(fa[0], fa[1]) + (f.recuperado_en ? ' <small>' + fechaCorta(f.recuperado_en) + '</small>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    h += '<p class="bo-nota">Los plazos deben figurar en las condiciones de uso y comunicarse por adelantado. Cada acción manual queda registrada con su autor y su fecha. Prototipo: sin Stripe, «Reintentar» se simula como cobrado.</p>';
    g.impFilas = d.filas;
    c.innerHTML = h;
  }).catch(function(e){ c.innerHTML = '<div class="bo-card">' + vacio(esc(e.message)) + '</div>'; });
}

/* ---------- Gestores y permisos ---------- */
var NIVEL_TXT = { no: 'Sin acceso', ver: 'Ver', editar: 'Editar' };
function tabGestores(c){
  api('/api/bo/negocio/gestores').then(function(d){
    var h = '<div class="g-barra"><div class="g-barra-txt"><b>Administrador, gestores y permisos.</b> El administrador decide todo, incluido quién gestiona qué. Para cada gestor y módulo: sin acceso, ver o editar. «Gestor tipo» es una propuesta de partida.</div>' +
      '<button type="button" class="bo-btn" data-g-gestor-nuevo>' + icono('fa-user-plus') + ' Alta de gestor</button></div>';
    h += '<div class="bo-card"><div class="bo-tabla-wrap"><table class="bo-tabla g-matriz tarjetas"><thead><tr><th>Cuenta</th><th>Perfil</th>' + d.modulos.map(function(m){ return '<th>' + esc(m.nombre) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
      d.cuentas.map(function(a){
        var gestor = a.perfil === 'gestor', baja = !!a.desactivado;
        return '<tr data-g-cuenta="' + esc(a.id) + '" class="' + (baja ? 'inactivo' : '') + '"><td class="t-cab-movil"><div class="bo-cli"><span class="bo-av">' + esc(P.iniciales(a.nombre || '?')) + '</span><div class="g-sub-nom"><b>' + esc(a.nombre) + (a.soy_yo ? ' (tú)' : '') + '</b><small>' + esc(a.email) + ' · ' + esc(a.cargo || 'Abogado') + '</small></div>' + (baja ? tag('Baja', 't-gray') : '') + '</div></td>' +
          '<td data-label="Perfil">' + sel('perfil', [['administrador', 'Administrador'], ['gestor', 'Gestor'], ['ninguno', 'Sin acceso a Gestión']], a.perfil, ' class="bo-sel" data-g-perfil' + (a.soy_yo || baja ? ' disabled' : '')) + '</td>' +
          d.modulos.map(function(m){ return '<td data-label="' + esc(m.nombre) + '">' + (a.perfil === 'administrador' ? '<span class="g-gris">' + NIVEL_TXT[m.niveles[m.niveles.length - 1]] + '</span>'
            : sel('perm.' + m.id, m.niveles.map(function(n){ return [n, NIVEL_TXT[n]]; }), (a.permisos || {})[m.id] || 'no', ' class="bo-sel"' + (gestor && !baja ? '' : ' disabled'))) + '</td>'; }).join('') +
          '<td class="t-acc-movil"><div class="g-acc">' + (a.soy_yo ? '' : (baja ? '' : '<button type="button" class="bo-btn sec sm" data-g-gestor-guardar>Guardar</button>') +
            '<button type="button" class="bo-btn ' + (baja ? 'sec' : 'peligro') + ' sm" data-g-gestor-baja="' + (baja ? '1' : '0') + '">' + (baja ? 'Reactivar' : 'Baja') + '</button>') + '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      '<div class="bo-card bo-pad"><h3>Gestor tipo (propuesta)</h3><div class="g-chips">' + d.modulos.map(function(m){ return '<span class="g-chip-perm">' + esc(m.nombre) + ': <b>' + NIVEL_TXT[d.gestor_tipo[m.id]] + '</b></span>'; }).join('') + '<span class="g-chip-perm">Gestores y permisos: <b>Solo administrador</b></span></div>' +
      '<p class="bo-nota">Un gestor sin permiso de edición sobre precios no puede lanzar una campaña que baje del margen mínimo. Cada cambio queda registrado con su autor y su fecha.</p></div>';
    c.innerHTML = h;
    g.gestores = d;
  }).catch(function(e){ c.innerHTML = '<div class="bo-card">' + vacio(esc(e.message)) + '</div>'; });
}
function guardarGestor(tr){
  var uid = tr.dataset.gCuenta, perfil = tr.querySelector('[data-g-perfil]').value, permisos = {};
  tr.querySelectorAll('select[name^="perm."]').forEach(function(s){ permisos[s.name.slice(5)] = s.value; });
  api('/api/bo/negocio/gestores/' + encodeURIComponent(uid), { method: 'PUT', body: { perfil: perfil, permisos: permisos } }).then(function(){ P.toast('Permisos guardados.'); pintarTab(); }).catch(aviso);
}

/* ---------- Costes y margen ---------- */
var CAMPOS_COSTE = [['coste_consulta', 'Coste OCI por consulta', '€', 0.001, 'Referencia: 100.000 consultas/año ↔ 25.000 € de OCI.'], ['oci_fijo_mes', 'OCI fijo al mes (arranque)', '€', 1, 'Capacidad base casi fija: hasta 2.500 €/mes.'],
  ['oci_real_mes', 'OCI real del mes', '€', 0.01, 'Facturación de Oracle. Si supera el fijo, salta una alerta.'], ['base_juridica_mes', 'Base de datos jurídica al mes', '€', 1, 'Precio público de referencia hasta tener la tarifa del proveedor.'],
  ['iva_pct', 'IVA', '%', 0.1, 'Se suma al precio base y se ingresa a Hacienda: no es margen.'], ['cobro_pct', 'Comisión de cobro (suscripción)', '%', 0.01, 'Stripe: tarjeta EEE 1,5 % + Billing 0,7 %.'],
  ['cobro_fijo', 'Comisión fija por cobro', '€', 0.01, ''], ['pago_unico_pct', 'Comisión de pago único', '%', 0.01, 'Sin Stripe Billing.'], ['margen_minimo_pct', 'Margen bruto mínimo', '%', 0.5, 'Por debajo no se puede publicar un plan.']];
function previaCostes(co){
  var planes = (g.cfg.planes || []).filter(function(p){ return p.estado !== 'retirado'; });
  var div = 1 - co.margen_minimo_pct / 100 - co.cobro_pct / 100 * (1 + co.iva_pct / 100);
  return '<div class="bo-tabla-wrap"><table class="bo-tabla compacta tarjetas"><thead><tr><th>Plan</th><th>Precio</th><th>Precio mínimo</th><th>Margen mensual</th></tr></thead><tbody>' + planes.map(function(p){
    var unico = p.tipo === 'pago_unico', n = unico ? (p.consultas.total + p.consultas.aclaraciones) : p.consultas.mes, pc = (unico ? co.pago_unico_pct : co.cobro_pct) / 100;
    var d = 1 - co.margen_minimo_pct / 100 - pc * (1 + co.iva_pct / 100);
    var min = d > 0 ? (n * co.coste_consulta + co.cobro_fijo) / d : null;
    var com = p.precio * (1 + co.iva_pct / 100) * pc + co.cobro_fijo, m = 100 * (p.precio - com - n * co.coste_consulta) / p.precio;
    return '<tr><td class="t-cab-movil"><b>' + esc(p.nombre) + '</b></td><td data-label="Precio">' + eur(p.precio) + '</td><td data-label="Precio mínimo">' + (min == null ? '—' : eur(min)) + '</td><td data-label="Margen">' + margenTag(m, m >= co.margen_minimo_pct) + '</td></tr>'; }).join('') +
    '</tbody></table></div>' + (div <= 0 ? alerta('danger', 'Con ese margen y esa comisión no hay precio posible.') : '');
}
function tabCostes(c){
  var co = g.cfg.costes, ed = puedeEditar('costes'), dis = ed ? '' : ' disabled';
  var h = '<div class="g-barra"><div class="g-barra-txt"><b>Costes de referencia, IVA y margen mínimo.</b> El margen se mide sobre el precio base sin IVA, después de la comisión de cobro y con la cuota consumida al 100 %.</div>' + soloLectura('costes') + '</div>';
  h += '<div class="bo-grid g-2b"><form class="bo-card bo-pad" id="gFormCostes" novalidate><h3>Costes</h3><div class="g-fila2">' + CAMPOS_COSTE.map(function(f){
      return campo(f[1], '<div class="g-sufijo">' + numInp(f[0], co[f[0]] == null ? '' : co[f[0]], f[3], 0, dis + (f[0] === 'oci_real_mes' ? ' placeholder="Sin dato"' : '')) + '<em>' + f[2] + '</em></div>', esc(f[4])); }).join('') + '</div>' +
      (ed ? '<div class="g-form-pie"><button type="button" class="bo-btn" data-g-costes>Guardar costes</button></div>' : '') + '<div id="gCostesErr" aria-live="polite"></div></form>' +
    '<div class="g-pila"><div class="bo-card bo-pad"><h3>Vista previa con estos costes</h3><div class="g-formula">Precio base mínimo = (consultas × <b>' + eur(co.coste_consulta) + '</b> + ' + eur(co.cobro_fijo) + ') ÷ (1 − <b>' + pct(co.margen_minimo_pct, 0) + '</b> − ' + pct(co.cobro_pct) + ' × ' + num(1 + co.iva_pct / 100, 2) + ')</div><div id="gCostesPrevia">' + previaCostes(co) + '</div></div>' +
      '<div class="bo-card bo-pad"><h3>Curva de coste OCI según el volumen</h3><div class="bo-tabla-wrap"><table class="bo-tabla compacta tarjetas"><thead><tr><th>Consultas al año</th><th>OCI / consulta</th>' + planesSuscripcion().map(function(p){ return '<th>' + esc(p.nombre) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        (co.curva || []).map(function(x, i){ return '<tr><td class="t-cab-movil"><b>' + ent(x.consultas_anuales) + '</b>' + (x.nota ? ' <small>' + esc(x.nota) + '</small>' : '') + '</td><td data-label="OCI / consulta">' + eur(x.coste, 3) + '</td>' + planesSuscripcion().map(function(p){ var e = p.simulacion.escenarios[i] || {}; return '<td data-label="' + esc(p.nombre) + '">' + margenTag(e.margen_pct, e.margen_pct >= co.margen_minimo_pct) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div><p class="bo-nota">Los 2.500 €/mes de arranque son casi fijos: con 50.000 consultas al año cada una cuesta 0,60 € de OCI. En producción, el coste por consulta se alimentará del consumo medido.</p></div>' +
      (perm('gestores') === 'editar' ? '<div class="bo-card bo-pad"><h3>Datos de demostración</h3><p class="bo-nota" style="margin-top:0">252 suscriptores de ejemplo (60/30/10, 50 % de uso) más pruebas, bajas e impagos, para enseñar el Dashboard. Los clientes reales no se tocan.</p><div class="g-acc"><button type="button" class="bo-btn sec sm" data-g-demo="1">' + icono('fa-refresh') + ' Regenerar</button><button type="button" class="bo-btn peligro sm" data-g-demo="0">' + icono('fa-trash-o') + ' Quitar</button></div></div>' : '') +
    '</div></div>';
  c.innerHTML = h;
}

/* ---------- Registro de cambios ---------- */
var MOD_TXT = { planes: 'Planes', campanas: 'Campañas', limites: 'Límites', costes: 'Costes', suscriptores: 'Suscriptores', gestores: 'Permisos' };
function tabRegistro(c){
  api('/api/bo/negocio/registro?modulo=' + encodeURIComponent(g.reg.modulo) + '&q=' + encodeURIComponent(g.reg.q)).then(function(d){
    var h = '<div class="bo-card t-IRR-region"><div class="bo-cab"><h3>Registro de cambios</h3>' + (d.completo ? '' : '<span class="g-lectura">Solo los módulos que puedes ver</span>') + '</div>' +
      '<div class="t-IRR-toolbar"><label class="t-IRR-search">' + icono('fa-search') + '<input type="search" id="gRegQ" value="' + esc(g.reg.q) + '" placeholder="Autor, acción o detalle…" aria-label="Buscar en el registro"></label>' +
      '<select class="bo-sel" id="gRegMod" aria-label="Módulo"><option value="">Todos los módulos</option>' + Object.keys(MOD_TXT).map(function(k){ return '<option value="' + k + '"' + (g.reg.modulo === k ? ' selected' : '') + '>' + MOD_TXT[k] + '</option>'; }).join('') + '</select></div>' +
      (d.filas.length ? '<ul class="g-registro">' + d.filas.map(function(e){
        return '<li><div class="g-reg-cab"><span class="g-reg-fecha">' + esc(U.fecha(e.ts)) + '</span>' + tag(MOD_TXT[e.modulo] || e.modulo, 't-blue') + '<b>' + esc(e.accion) + '</b><span class="g-reg-autor">' + icono('fa-user-o') + ' ' + esc(e.autor) + '</span></div><p>' + esc(e.detalle) + '</p>' +
          (e.antes || e.despues ? '<details><summary>Antes y después</summary><div class="g-reg-dif"><pre>' + esc(JSON.stringify(e.antes || null, null, 1)) + '</pre><pre>' + esc(JSON.stringify(e.despues || null, null, 1)) + '</pre></div></details>' : '') + '</li>'; }).join('') + '</ul>'
        : vacio('Sin cambios con ese filtro.')) + '</div>';
    c.innerHTML = h;
  }).catch(function(e){ c.innerHTML = '<div class="bo-card">' + vacio(esc(e.message)) + '</div>'; });
}

/* ---------- eventos de Gestión (sección y cajón) ---------- */
function manejar(e){
  var t = e.target, b;
  if ((b = t.closest('[data-g-plan-nuevo]'))) return abrirPlan(null);
  if ((b = t.closest('[data-g-plan]'))) return abrirPlan(b.dataset.gPlan);
  if ((b = t.closest('[data-g-plan-menu]'))){ e.stopPropagation(); return menuPlan(b, b.dataset.gPlanMenu); }
  if ((b = t.closest('[data-g-plan-guardar]'))) return guardarPlan();
  if ((b = t.closest('[data-g-periodo-nuevo]'))) return abrirPeriodo(null);
  if ((b = t.closest('[data-g-periodo-guardar]'))) return guardarPeriodo(b.dataset.gPeriodoGuardar, b);
  if ((b = t.closest('[data-g-periodo]'))) return abrirPeriodo(b.dataset.gPeriodo);
  if ((b = t.closest('[data-g-camp-nueva]'))) return abrirCampana(null);
  if ((b = t.closest('[data-g-camp-guardar]'))) return guardarCampana(b);
  if ((b = t.closest('[data-g-camp-estado]'))) return estadoCampana(b.dataset.id, b.dataset.gCampEstado);
  if ((b = t.closest('[data-g-camp]'))) return abrirCampana(b.dataset.gCamp);
  if ((b = t.closest('[data-g-lim-guardar]'))) return guardarLimites(b);
  if ((b = t.closest('[data-g-sub-estado]'))){ g.subs.estado = b.dataset.gSubEstado; g.subs.limite = 40; return pintarTab(); }
  if ((b = t.closest('[data-g-sub-alerta]'))){ g.subs.alerta = g.subs.alerta ? '' : b.dataset.gSubAlerta; g.subs.limite = 40; return pintarTab(); }
  if ((b = t.closest('[data-g-mas]'))){ g.subs.limite += 120; return pintarTab(); }
  if ((b = t.closest('[data-g-vincular]'))) return vincularCliente();
  if ((b = t.closest('[data-g-subs-csv]'))) return U.csv('suscriptores_legalia.csv', ['Nombre', 'Correo', 'Plan', 'Periodo', 'Estado', 'Uso del mes', 'Cuota', '€/mes sin IVA', 'Alta', 'Renovación', 'Impago', 'Ejemplo'],
      (g.subsFilas || []).map(function(s){ return [s.nombre, s.email, s.plan_nombre, s.periodo, s.estado_txt, s.uso_mes, s.tope_mes, String(s.mensual).replace('.', ','), s.alta, s.renovacion, s.impago || '', s.demo ? 'Sí' : 'No']; }));
  if ((b = t.closest('[data-g-acc]'))){ e.stopPropagation(); return accionSub(b.dataset.id || (g.ficha && g.ficha.id), b.dataset.gAcc); }
  if ((b = t.closest('[data-g-sub]'))) return verSuscriptor(b.dataset.gSub);
  if ((b = t.closest('[data-g-plazos]'))){
    var d = leerForm($('gFormPlazos'));
    return api('/api/bo/negocio/impagos/plazos', { method: 'PUT', body: d }).then(function(){ P.toast('Plazos guardados.'); pintarTab(); }).catch(aviso);
  }
  if ((b = t.closest('[data-g-imp-csv]'))) return U.csv('impagos_legalia.csv', ['Nombre', 'Correo', 'Importe', 'Desde', 'Días', 'Fase', 'Intentos', 'Recordatorios', 'Ampliación (días)', 'Borrado previsto', 'Recuperado'],
      (g.impFilas || []).map(function(f){ return [f.nombre, f.email, String(f.importe).replace('.', ','), f.desde, f.dias, f.fase_txt, f.intentos, f.recordatorios, f.ampliacion_dias, f.borrado_previsto, f.recuperado_en || '']; }));
  if ((b = t.closest('[data-g-gestor-nuevo]'))) return P.modal({ titulo: 'Alta de gestor', texto: 'Tendrá los permisos del «gestor tipo»; después puedes ajustarlos. Comunícale la contraseña por un canal seguro: la cambiará al entrar.',
      campos: [{ etiqueta: 'Nombre y apellidos', valor: '' }, { etiqueta: 'Correo', valor: '' }, { etiqueta: 'Cargo', valor: 'Gestor' }, { etiqueta: 'Contraseña temporal', valor: '', secreto: true, ayuda: 'Mínimo 6 caracteres' }], boton: 'Dar de alta' })
    .then(function(v){ if (v) api('/api/bo/negocio/gestores', { method: 'POST', body: { nombre: v[0], email: v[1], cargo: v[2], password: v[3] } }).then(function(){ P.toast('Gestor dado de alta.'); pintarTab(); }).catch(aviso); });
  if ((b = t.closest('[data-g-gestor-guardar]'))) return guardarGestor(b.closest('tr'));
  if ((b = t.closest('[data-g-gestor-baja]'))){
    var tr = b.closest('tr'), activo = b.dataset.gGestorBaja === '1';
    return P.modal({ titulo: activo ? 'Reactivar la cuenta' : 'Dar de baja la cuenta', texto: activo ? 'Podrá volver a entrar; asígnale de nuevo un perfil.' : 'No podrá entrar y pierde sus permisos. Queda registrado.', boton: activo ? 'Reactivar' : 'Dar de baja', peligro: !activo })
      .then(function(ok){ if (ok) api('/api/bo/negocio/gestores/' + encodeURIComponent(tr.dataset.gCuenta) + '/baja', { method: 'POST', body: { activo: activo } }).then(function(){ P.toast('Hecho.'); pintarTab(); }).catch(aviso); });
  }
  if ((b = t.closest('[data-g-costes]'))){
    b.disabled = true;
    return api('/api/bo/negocio/costes', { method: 'PUT', body: leerForm($('gFormCostes')) }).then(function(r){
      P.toast('Costes guardados.' + (r.alertas.length ? ' Atención: ' + r.alertas.length + ' plan(es) quedan por debajo del margen mínimo.' : '')); recargar();
    }).catch(function(err){ b.disabled = false; $('gCostesErr').innerHTML = alerta('warning', esc(err.message)); });
  }
  if ((b = t.closest('[data-g-demo]'))){
    var crear = b.dataset.gDemo === '1';
    return P.modal({ titulo: crear ? 'Regenerar datos de demostración' : 'Quitar datos de demostración', texto: crear ? 'Se sustituyen los suscriptores de ejemplo por otros nuevos. Los clientes reales no se tocan.' : 'Se borran los suscriptores de ejemplo. El Dashboard mostrará solo los clientes reales.', boton: crear ? 'Regenerar' : 'Quitar', peligro: !crear })
      .then(function(ok){ if (ok) api('/api/bo/negocio/demo', { method: crear ? 'POST' : 'DELETE' }).then(function(r){ P.toast(crear ? r.creadas + ' suscriptores de ejemplo.' : r.quitados + ' suscriptores de ejemplo quitados.'); recargar(); }).catch(aviso); });
  }
}
$('bo-gestion').addEventListener('click', manejar);
$('boDrawer').addEventListener('click', function(e){ if (e.target.closest('#boDrawerCuerpo, #boDrawerPie')) manejar(e); });
$('bo-gestion').addEventListener('keydown', function(e){
  var tr = e.target.closest('tr[data-g-sub]');
  if (tr && (e.key === 'Enter' || e.key === ' ') && e.target === tr){ e.preventDefault(); verSuscriptor(tr.dataset.gSub); }
  if (e.target.id === 'gSubQ' && e.key === 'Enter'){ g.subs.q = e.target.value.trim(); g.subs.limite = 40; pintarTab(); }
  if (e.target.id === 'gRegQ' && e.key === 'Enter'){ g.reg.q = e.target.value.trim(); pintarTab(); }
});
$('bo-gestion').addEventListener('change', function(e){
  if (e.target.id === 'gSubPlan'){ g.subs.plan = e.target.value; g.subs.limite = 40; pintarTab(); }
  if (e.target.id === 'gRegMod'){ g.reg.modulo = e.target.value; pintarTab(); }
  if (e.target.matches('[data-g-perfil]')){ var tr = e.target.closest('tr'); tr.querySelectorAll('select[name^="perm."]').forEach(function(s){ s.disabled = e.target.value !== 'gestor'; }); }
});
$('bo-gestion').addEventListener('input', debounce(function(e){
  if (e.target.closest('#gFormCostes')){ var d = leerForm($('gFormCostes')), co = JSON.parse(JSON.stringify(g.cfg.costes)); Object.keys(d).forEach(function(k){ if (d[k] !== '') co[k] = Number(String(d[k]).replace(',', '.')); }); $('gCostesPrevia').innerHTML = previaCostes(co); }
}, 250));
$('boDrawer').addEventListener('input', function(e){
  if (e.target.closest('#gFormPlan')) simularPlan();
  if (e.target.closest('#gFormCamp')) simularCampana();
});
$('boDrawer').addEventListener('change', function(e){
  if (e.target.closest('#gFormPlan')){
    if (e.target.matches('[data-g-tipo-plan]')){ var d = leerForm($('gFormPlan')); g.plan = Object.assign(g.plan, { tipo: d.tipo, consultas: d.tipo === 'pago_unico' ? { total: 1, aclaraciones: 2 } : { mes: 20, dia: 5, semana: 10 }, validez_horas: 48, nombre: d.nombre, precio: d.precio });
      $('boDrawerCuerpo').innerHTML = formPlan(g.plan, true); }
    simularPlan();
  }
  if (e.target.closest('#gFormCamp')){ ajustarFormCampana(); simularCampana(); }
});

/* =====================================================================================
   DASHBOARD ECONÓMICO (diapositivas 19 y 20)
   ===================================================================================== */
function grafEquilibrio(eq, n, necesarios){
  var W = 620, H = 240, x0 = 52, x1 = 604, y0 = 16, y1 = 200, xmax = eq.x[eq.x.length - 1] || 1;
  var ymax = Math.max.apply(null, eq.aportacion.concat(eq.fijos).concat([1])) * 1.08;
  var X = function(v){ return x0 + (x1 - x0) * v / xmax; }, Y = function(v){ return y1 - (y1 - y0) * v / ymax; };
  var linea = function(arr, color, dash){ return '<path d="' + arr.map(function(v, i){ return (i ? 'L' : 'M') + X(eq.x[i]).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2.6"' + (dash ? ' stroke-dasharray="6 5"' : '') + '/>'; };
  var rejilla = [0, .25, .5, .75, 1].map(function(k){ var v = ymax * k; return '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="rgba(255,255,255,.07)"/><text x="' + (x0 - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" fill="#8fa7bf" font-size="10" text-anchor="end">' + ent(Math.round(v / 100) * 100) + '</text>'; }).join('');
  var ejes = eq.x.map(function(v){ return '<text x="' + X(v).toFixed(1) + '" y="' + (y1 + 16) + '" fill="#8fa7bf" font-size="10" text-anchor="middle">' + v + '</text>'; }).join('');
  var marca = function(v, color, txt, arriba){ if (v == null || v > xmax) return ''; return '<line x1="' + X(v).toFixed(1) + '" x2="' + X(v).toFixed(1) + '" y1="' + y0 + '" y2="' + y1 + '" stroke="' + color + '" stroke-dasharray="3 4"/><text x="' + (X(v) + 5).toFixed(1) + '" y="' + (arriba ? y0 + 12 : y0 + 28) + '" fill="' + color + '" font-size="11" font-weight="700">' + esc(txt) + '</text>'; };
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Aportación de los suscriptores frente a los costes fijos: el equilibrio está en ' + (necesarios || '—') + ' suscriptores y hoy hay ' + n + '">' +
    rejilla + ejes + '<text x="' + ((x0 + x1) / 2) + '" y="' + (H - 2) + '" fill="#8fa7bf" font-size="10" text-anchor="middle">suscriptores</text>' +
    linea(eq.fijos, '#ff8b94', true) + linea(eq.aportacion, '#d4a84f') + marca(necesarios, '#45c7e8', 'Equilibrio: ' + necesarios, true) + marca(n, '#49d17d', 'Hoy: ' + n) + '</svg>';
}
function grafBarras(datos){
  var W = 620, H = 200, x0 = 30, x1 = 610, y0 = 12, y1 = 170, n = datos.length || 1, max = Math.max.apply(null, datos.map(function(d){ return d.n; }).concat([1]));
  var bw = (x1 - x0) / n;
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Consultas por día, últimos ' + n + ' días">' +
    [0, .5, 1].map(function(k){ var y = y1 - (y1 - y0) * k; return '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + y + '" y2="' + y + '" stroke="rgba(255,255,255,.07)"/><text x="' + (x0 - 4) + '" y="' + (y + 4) + '" fill="#8fa7bf" font-size="10" text-anchor="end">' + Math.round(max * k) + '</text>'; }).join('') +
    datos.map(function(d, i){ var h = (y1 - y0) * d.n / max, x = x0 + i * bw + bw * .15; return '<rect x="' + x.toFixed(1) + '" y="' + (y1 - h).toFixed(1) + '" width="' + (bw * .7).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="#2d8cff"><title>' + esc(d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7) + ': ' + d.n + ' consultas') + '</title></rect>' +
      ((i % 5 === 0 || i === n - 1) ? '<text x="' + (x + bw * .35).toFixed(1) + '" y="' + (y1 + 16) + '" fill="#8fa7bf" font-size="10" text-anchor="middle">' + d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7) + '</text>' : ''); }).join('') + '</svg>';
}
function pintarEconomia(){
  var el = $('bo-economia'); U.cargando(el, 'Calculando');
  api('/api/bo/negocio/dashboard').then(function(d){
    var k = d.kpis, adm = perm('gestores') === 'editar';
    var h = d.demo ? alerta('info', '<b>Cifras de demostración</b> calculadas con el modelo: 252 suscriptores de ejemplo (60/30/10) con pago mensual y un 50 % de uso medio, más los clientes reales. En producción, el coste por consulta y el de OCI saldrán del consumo medido y de la facturación de Oracle.' + (adm ? ' <a href="#" data-g-ir="costes">Gestionar datos de ejemplo</a>' : '')) : '';
    h += '<div class="bo-grid g-kpis g-kpis6">' +
      U.kpi('fa-eur', 'Ingresos netos del mes', eur(k.ingresos_netos, 0), '<small>sin IVA</small>') +
      U.kpi('fa-pie-chart', 'Margen bruto', pct(k.margen_pct, 0), '<small class="' + (k.margen_pct >= k.margen_minimo_pct ? 'sube' : 'baja') + '">mínimo ' + pct(k.margen_minimo_pct, 0) + '</small>') +
      U.kpi('fa-line-chart', 'Resultado tras fijos', (k.resultado >= 0 ? '+' : '') + eur(k.resultado, 0), '<small class="' + (k.resultado >= 0 ? 'sube' : 'baja') + '">fijos ' + eur(k.fijos, 0) + '/mes</small>') +
      U.kpi('fa-users', 'Suscriptores', ent(k.suscriptores), '<small>necesarios: ' + (k.necesarios == null ? '—' : ent(k.necesarios)) + '</small>') +
      U.kpi('fa-comments-o', 'Consultas del mes', ent(k.consultas_mes), '<small>' + eur(k.coste_consulta) + ' por consulta</small>') +
      U.kpi('fa-tachometer', 'Uso medio de cuota', pct(k.uso_pct, 0), '<small>de las consultas incluidas</small>') + '</div>';
    var tot = d.planes.reduce(function(a, f){ a.s += f.suscriptores; a.i += f.ingresos; a.b += f.beneficio; a.c += f.consultas; a.n += f.incluidas; return a; }, { s: 0, i: 0, b: 0, c: 0, n: 0 });
    h += '<div class="bo-grid g-2e"><div class="bo-card"><div class="bo-cab"><h3>Por plan</h3><small class="g-gris">pago mensualizado</small></div><div class="bo-tabla-wrap"><table class="bo-tabla tarjetas"><thead><tr><th>Plan</th><th>Suscriptores</th><th>Ingresos</th><th>Uso cuota</th><th>Margen</th></tr></thead><tbody>' +
      d.planes.map(function(f){ return '<tr><td class="t-cab-movil"><b>' + esc(f.plan) + '</b></td><td data-label="Suscriptores">' + ent(f.suscriptores) + (tot.s ? ' <small>(' + Math.round(100 * f.suscriptores / tot.s) + ' %)</small>' : '') + '</td><td data-label="Ingresos">' + eur(f.ingresos, 0) + '</td><td data-label="Uso cuota">' + pct(f.uso_pct, 0) + '</td><td data-label="Margen">' + margenTag(f.margen_pct, f.margen_pct == null || f.margen_pct >= k.margen_minimo_pct) + '</td></tr>'; }).join('') +
      '<tr class="g-total"><td class="t-cab-movil"><b>Total</b></td><td data-label="Suscriptores"><b>' + ent(tot.s) + '</b></td><td data-label="Ingresos"><b>' + eur(tot.i, 0) + '</b></td><td data-label="Uso cuota"><b>' + pct(tot.n ? 100 * tot.c / tot.n : null, 0) + '</b></td><td data-label="Margen"><b>' + pct(tot.i ? 100 * tot.b / tot.i : null, 0) + '</b></td></tr></tbody></table></div>' +
      '<p class="bo-nota" style="padding:0 16px 14px">Margen bruto = ingresos netos − comisión de cobro − consultas a ' + eur(k.coste_consulta) + ', sobre ingresos netos. El resultado tras fijos resta ' + eur(k.fijos, 0) + ' de OCI y base jurídica.</p></div>' +
      '<div class="bo-card bo-pad bo-chart"><h3>Suscriptores necesarios para cubrir los fijos</h3><div class="bo-leyenda"><span><i style="background:#d4a84f"></i>Aportación de los suscriptores</span><span><i style="background:#ff8b94"></i>Costes fijos (OCI + base jurídica)</span></div>' + grafEquilibrio(d.equilibrio, k.suscriptores, k.necesarios) +
        '<div class="g-mini"><div><span>Aportación media</span><b>' + eur(k.aportacion_media) + '</b><small>por suscriptor y mes</small></div><div><span>Equilibrio</span><b>≈ ' + (k.necesarios == null ? '—' : ent(k.necesarios)) + '</b><small>suscriptores</small></div><div><span>Referencia OCI</span><b>≈ ' + (k.referencia_oci_suscriptores == null ? '—' : ent(k.referencia_oci_suscriptores)) + '</b><small>para 100.000 consultas/año</small></div></div></div></div>';
    var maxM = Math.max.apply(null, d.materias.map(function(m){ return m.n; }).concat([1])), totM = d.materias.reduce(function(a, m){ return a + m.n; }, 0) || 1;
    h += '<div class="bo-grid g-3"><div class="bo-card bo-pad bo-chart"><h3>Consultas por día (30 días)</h3>' + grafBarras(d.consultas_dia) + '</div>' +
      '<div class="bo-card bo-pad"><h3>Consultas por materia (mes)</h3>' + (d.materias.length ? d.materias.slice(0, 7).map(function(m){ return '<div class="bo-barra"><div><span>' + esc(m.materia) + '</span><b>' + Math.round(100 * m.n / totM) + ' %</b></div><div class="bo-meter gold"><i style="width:' + (100 * m.n / maxM) + '%"></i></div></div>'; }).join('') : '<p class="bo-nota">Sin consultas este mes.</p>') + '</div>' +
      '<div class="bo-card bo-pad" id="gAlertas"><h3>Alertas</h3>' + (d.alertas.length ? d.alertas.map(function(a){ return '<div class="g-alerta ' + a.nivel + '">' + icono(a.tipo === 'margen' ? 'fa-pie-chart' : a.tipo === 'oci' ? 'fa-cloud' : a.tipo === 'uso' ? 'fa-user-secret' : a.tipo === 'impago' ? 'fa-credit-card' : 'fa-bullhorn') + '<span>' + esc(a.texto) + '</span>' +
          (a.tipo === 'uso' ? '<button type="button" class="acc-link" data-g-ir="suscriptores" data-alerta="uso">Ver</button>' : a.tipo === 'impago' ? '<button type="button" class="acc-link" data-g-ir="impagos">Ver</button>' : a.tipo === 'margen' ? '<button type="button" class="acc-link" data-g-ir="planes">Ver</button>' : '') + '</div>'; }).join('')
        : '<div class="g-alerta ok">' + icono('fa-check') + '<span>Sin alertas: margen, OCI y uso dentro de lo previsto.</span></div>') + '</div></div>';
    var mv = d.movimiento, pr = d.pruebas, im = d.impagos;
    h += '<div class="bo-grid g-3c"><div class="bo-card bo-pad"><h3>Altas, bajas y conversión</h3><div class="g-mini g-mini2"><div><span>Altas del mes</span><b>' + ent(mv.altas) + '</b></div><div><span>Bajas del mes</span><b>' + ent(mv.bajas) + '</b></div><div><span>Abandono</span><b>' + pct(mv.abandono_pct) + '</b></div>' +
        '<div><span>Prueba → pago</span><b>' + pct(pr.conversion_pct, 0) + '</b><small>' + pr.convertidas + ' de ' + (pr.convertidas + pr.sin_convertir) + '</small></div><div><span>En prueba</span><b>' + ent(pr.en_curso) + '</b></div><div><span>Coste de captación</span><b>' + eur(pr.coste_captacion, 0) + '</b><small>OCI de las pruebas</small></div></div></div>' +
      '<div class="bo-card"><div class="bo-cab"><h3>Resultado de cada campaña</h3></div><div class="bo-tabla-wrap"><table class="bo-tabla compacta tarjetas"><thead><tr><th>Campaña</th><th>Usos</th><th>Pagan</th><th>Ingresos/mes</th></tr></thead><tbody>' +
        d.campanas.map(function(c){ return '<tr><td class="t-cab-movil"><b>' + esc(c.nombre) + '</b><br><small>' + esc(c.tipo) + (c.estado !== 'activa' ? ' · ' + esc(c.estado) : '') + '</small>' + (c.bajo_minimo ? ' ' + tag('Bajo mínimo', 't-orange') : '') + '</td><td data-label="Usos">' + ent(c.usos) + '</td><td data-label="Pagan">' + ent(c.pagan) + (c.conversion_pct != null ? ' <small>(' + c.conversion_pct + ' %)</small>' : '') + '</td><td data-label="Ingresos/mes">' + eur(c.ingresos_mes, 0) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="bo-card bo-pad"><h3>Impagos abiertos</h3><div class="g-mini g-mini2"><div><span>Abiertos</span><b>' + ent(im.abiertos) + '</b></div><div><span>Importe en riesgo</span><b>' + eur(im.importe_riesgo) + '</b></div>' +
        '<div><span>Reintentando</span><b>' + im.por_fase.reintentando + '</b></div><div><span>Suspendidos</span><b>' + im.por_fase.suspendido + '</b></div><div><span>Aviso de borrado</span><b>' + (im.por_fase.aviso_borrado + im.por_fase.pendiente_borrado) + '</b></div></div>' +
        (puedeVer('suscriptores') ? '<button type="button" class="bo-btn sec" style="margin-top:12px;width:100%" data-g-ir="impagos">Gestionar impagos</button>' : '') + '</div></div>';
    h += '<p class="bo-nota">Datos a ' + fechaCorta(d.hoy) + '. Se actualizan a diario. No incluye personal, captación ni pruebas gratuitas en el resultado.</p>';
    el.innerHTML = h;
    badges(d);
  }).catch(function(e){ el.innerHTML = '<div class="bo-card">' + vacio(esc(e.message)) + '</div>'; });
}
function badges(d){
  var altas = (d.alertas || []).filter(function(a){ return a.nivel === 'alta'; }).length;
  $('boCntEconomia').textContent = altas || '';
  $('boCntGestion').textContent = puedeVer('suscriptores') && d.impagos.abiertos ? d.impagos.abiertos : '';
  $('boCntGestion').title = 'Impagos abiertos';
}
BO.secciones.economia = pintarEconomia;
$('bo-economia').addEventListener('click', function(e){
  var b = e.target.closest('[data-g-ir]'); if (!b) return;
  e.preventDefault();
  if (b.dataset.alerta) { g.subs.alerta = b.dataset.alerta; g.subs.estado = ''; }
  ir(b.dataset.gIr);
});
// Insignias del menú al entrar (impagos abiertos y alertas altas): despacho.js llama a esto al conocer los permisos
BO.alNegocio = function(){ if (perm('dashboard') !== 'no') api('/api/bo/negocio/dashboard').then(badges).catch(function(){}); };
})();
