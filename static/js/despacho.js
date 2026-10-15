/* =====================  Acceso, enrutado y backoffice del despacho  ===================== */
(function(){
'use strict';
var P = window.LIA, esc = P.esc, api = P.api;
function $(id){ return document.getElementById(id); }
var acceso = $('acceso'), vCli = $('vistaCliente'), vBo = $('vistaDespacho');

/* ---------- Enrutado entre acceso, vista cliente y backoffice ---------- */
function mostrar(v){
  acceso.hidden = v !== 'login'; vCli.hidden = v !== 'cliente'; vBo.hidden = v !== 'despacho';
  document.body.classList.toggle('v-cliente', v === 'cliente');
  document.body.classList.toggle('v-despacho', v === 'despacho');
  window.scrollTo(0, 0);
}
var Router = window.Router = {
  login: function(msg){
    mostrar('login'); pintarAcceso(); error(msg || '');
    document.title = 'Legal IA · Acceso';
    setTimeout(function(){ $('accBtn').focus(); }, 60);
  },
  entrar: function(u){
    if (u.rol === 'abogado'){ mostrar('despacho'); BO.iniciar(); }
    else { P.ponerModo('live'); mostrar('cliente'); P.iniciarCliente(); }
  }
};

/* ---------- Pantalla de acceso (demo: sin credenciales, solo se elige el perfil) ---------- */
var acc = { rol: 'cliente' };
function error(t){ $('accError').textContent = t || ''; }
function pintarAcceso(conservarError){
  document.querySelectorAll('.acceso-tabs button').forEach(function(b){
    var on = b.dataset.rol === acc.rol; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
  });
  $('accTitulo').textContent = acc.rol === 'abogado' ? 'Acceso profesional' : 'Bienvenido';
  $('accSub').innerHTML = acc.rol === 'abogado' ? 'Backoffice de <b>Despacho Demo</b>: consultas, clientes y casos.'
    : 'Accede a la <b>plataforma cognitiva jurídica</b> más avanzada.';
  $('accBtn').textContent = 'Iniciar sesión';
  if (!conservarError) error('');
}
document.querySelectorAll('.acceso-tabs button').forEach(function(b){
  b.addEventListener('click', function(){ acc.rol = b.dataset.rol; pintarAcceso(); });
});
$('formAcceso').addEventListener('submit', function(e){
  e.preventDefault();
  var btn = $('accBtn'); btn.disabled = true; btn.textContent = 'Entrando…'; error('');
  fetch(Sesion.base() + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol: acc.rol }) })
    .then(function(res){ return res.json().catch(function(){ return {}; }).then(function(d){ if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status)); return d; }); })
    .then(function(d){ Sesion.guardar(d.token, d.usuario); Router.entrar(d.usuario); })
    .catch(function(err){ error(err.message); })
    .then(function(){ btn.disabled = false; pintarAcceso(true); });
});
pintarAcceso();

/* =====================  Backoffice  ===================== */
var BO = window.BO = {};
var bo = { sec: 'dashboard', resumen: null, consultas: [], filtro: '', q: '', clientes: [], cliAbierto: null, chat: null, chatId: null,
           casoId: null, insightId: null, analytics: null, sim: null };
var ESTADO = { nueva: ['Nueva', 't-blue'], revisada: ['Revisada', 't-purple'], pendiente_doc: ['Pend. doc.', 't-orange'],
               contactada: ['Contactada', 't-gold'], derivada: ['Derivada', 't-green'], expediente: ['Expediente', 't-green'], descartada: ['Descartada', 't-gray'] };
var INTERES = { Alto: 't-green', Medio: 't-orange', Bajo: 't-gray' };
var PALETA = ['#2d8cff', '#74b7e8', '#d4a84f', '#e37b55', '#9b7cff', '#45d0b0', '#b7c3d0'];

function euros(n){ n = Number(n) || 0; return n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2, useGrouping: 'always' }) + '\u00a0€'; }
function fecha(ts){
  if (!ts) return '—'; var d = new Date(ts); if (isNaN(d)) return ts;
  var mismoAno = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: mismoAno ? undefined : 'numeric' }).replace('.', '') + ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function hace(ts){
  if (!ts) return '—'; var m = Math.round((Date.now() - new Date(ts)) / 60000);
  return m < 1 ? 'ahora mismo' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : 'hace ' + Math.round(m / 1440) + ' días';
}
function tagEstado(e){ var x = ESTADO[e] || ESTADO.nueva; return '<span class="bo-tag ' + x[1] + '">' + x[0] + '</span>'; }
function tagInteres(i){ return i ? '<span class="bo-tag ' + (INTERES[i] || 't-gray') + '">' + esc(i) + '</span>' : '<span class="bo-tag t-gray">Sin analizar</span>'; }
function av(n){ return '<span class="bo-av">' + esc(P.iniciales(n || '?')) + '</span>'; }
function cargando(el, t){ el.innerHTML = '<div class="bo-cargando"><span class="dots">' + esc(t || 'Cargando') + '</span></div>'; }
function variacion(hoy, ayer){
  if (!ayer) return hoy ? '<small class="sube">nuevo hoy</small>' : '<small>sin actividad</small>';
  var p = Math.round(100 * (hoy - ayer) / ayer);
  return '<small class="' + (p >= 0 ? 'sube' : 'baja') + '">' + (p >= 0 ? '↑ ' : '↓ ') + Math.abs(p) + ' % vs ayer</small>';
}
var ICONOS = { '💬': 'fa-comments-o', '💳': 'fa-credit-card', '€': 'fa-eur', '📈': 'fa-line-chart', '👤': 'fa-user-plus', '☆': 'fa-star-o',
  '⏱': 'fa-clock-o', '↻': 'fa-ticket', '⟳': 'fa-repeat', '📁': 'fa-folder-open-o', '◎': 'fa-bullseye', '⚖': 'fa-balance-scale',
  '📊': 'fa-bar-chart', '📄': 'fa-file-text-o', '⚡': 'fa-bolt', '↗': 'fa-line-chart', '👁': 'fa-eye', '✓': 'fa-check-circle-o', '⚠': 'fa-exclamation-triangle' };
function icono(ico){ var c = ICONOS[ico] || (/^fa-/.test(ico) ? ico : ''); return c ? '<span class="fa ' + c + '"></span>' : esc(ico); }
function kpi(ico, label, valor, pie){ return '<div class="bo-card bo-kpi"><div class="bo-kpi-cab"><label>' + esc(label) + '</label><span class="bo-kicon" aria-hidden="true">' + icono(ico) + '</span></div><strong>' + valor + '</strong>' + (pie || '') + '</div>'; }
function meter(label, v, cls, txt){
  return '<div class="bo-score"><div><span>' + esc(label) + '</span><b>' + (txt || (v + ' %')) + '</b></div><div class="bo-meter ' + (cls || '') + '" role="progressbar" aria-valuenow="' + v + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(label) + '"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></div></div>';
}
function nivel(v){ return v >= 75 ? 'Alta' : v >= 50 ? 'Media-Alta' : v >= 30 ? 'Media' : 'Baja'; }

/* Gráfico de líneas sencillo (SVG) */
function lineas(series, etiquetas){
  var W = 620, H = 220, x0 = 34, x1 = 606, y0 = 18, y1 = 188, n = etiquetas.length;
  var g = '<g stroke="rgba(255,255,255,.08)">' + [0, 1, 2, 3].map(function(k){ var y = y0 + k * (y1 - y0) / 3; return '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + y + '" y2="' + y + '"/>'; }).join('') + '</g>';
  series.forEach(function(s){
    var max = Math.max.apply(null, s.datos.concat([1]));
    var pts = s.datos.map(function(v, i){ return [x0 + i * (x1 - x0) / Math.max(n - 1, 1), y1 - (v / max) * (y1 - y0)]; });
    var d = pts.map(function(p, i){ return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    if (s.area) g += '<path d="' + d + ' L' + x1 + ',' + y1 + ' L' + x0 + ',' + y1 + ' Z" fill="' + s.color + '" opacity=".14"/>';
    g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round"/>';
    g += pts.map(function(p, i){ return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + s.color + '"><title>' + esc(etiquetas[i] + ' · ' + s.nombre + ': ' + s.fmt(s.datos[i])) + '</title></circle>'; }).join('');
  });
  var lab = etiquetas.map(function(t, i){ return (i % Math.ceil(n / 7) === 0 || i === n - 1) ? '<text x="' + (x0 + i * (x1 - x0) / Math.max(n - 1, 1)) + '" y="210" fill="#8fa7bf" font-size="10" text-anchor="middle">' + esc(t) + '</text>' : ''; }).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(series.map(function(s){ return s.nombre; }).join(' y ')) + '">' + g + lab + '</svg>';
}
function donut(items, centro){
  var total = items.reduce(function(a, x){ return a + x.n; }, 0) || 1, acc0 = 0;
  var stops = items.map(function(x, i){ var a = acc0; acc0 += 100 * x.n / total; return PALETA[i % PALETA.length] + ' ' + a.toFixed(1) + '% ' + acc0.toFixed(1) + '%'; });
  return '<div class="bo-donut" role="img" aria-label="' + esc(items.map(function(x){ return x.materia + ' ' + Math.round(100 * x.n / total) + ' %'; }).join(', ')) + '" data-centro="' + esc(centro) + '" style="background:conic-gradient(' + (stops.join(',') || 'rgba(255,255,255,.08) 0 100%') + ')"></div>';
}

function saludo(){
  var h = new Date().getHours(), u = Sesion.usuario || {};
  return (h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches') + ', ' + (u.nombre || '').split(' ')[0];
}
BO.iniciar = function(){
  var u = Sesion.usuario || {};
  $('boNombre').textContent = u.nombre || ''; $('boCargo').textContent = u.cargo || 'Abogado';
  $('boIni').textContent = P.iniciales(u.nombre || '?');
  document.title = 'Legal IA · Backoffice';
  if (P.store.get('legalia_bo_nav') === 'min' && window.innerWidth > 1100) vBo.classList.add('nav-min');
  api('/api/bo/administracion').then(function(a){
    bo.admin = a;
    $('boEntorno').hidden = !a.entorno || a.entorno === 'PROD'; $('boEntorno').textContent = a.entorno;
    $('boVersion').textContent = a.entorno || '';
    $('boDespacho').textContent = $('boPieDespacho').textContent = a.despacho || 'Despacho Demo';
  }).catch(function(){});
  BO.negocio = null;
  api('/api/bo/negocio/yo').then(function(y){ BO.negocio = y; }).catch(function(){ BO.negocio = { perfil: 'sin_acceso', permisos: {} }; })
    .then(function(){
      var pm = (BO.negocio || {}).permisos || {};
      var verGestion = Object.keys(pm).some(function(k){ return pm[k] && pm[k] !== 'no'; });
      document.querySelector('.bo-item[data-sec="economia"]').closest('li').hidden = !(pm.dashboard && pm.dashboard !== 'no');
      document.querySelector('.bo-item[data-sec="gestion"]').closest('li').hidden = !verGestion;
      ir(P.store.get('legalia_bo_sec') || 'dashboard');
      if (BO.alNegocio) BO.alNegocio();
    });
  refrescarContadores();
};
function refrescarContadores(){
  return api('/api/bo/resumen').then(function(r){
    bo.resumen = r;
    var nAl = r.alertas.reduce(function(a, x){ return a + (x.tipo === 'sin_analizar' ? 0 : x.n); }, 0);
    $('boAlertasN').textContent = nAl;
    $('boCntConsultas').textContent = r.kpis.pendientes || '';
    return r;
  });
}
var SUBT = { dashboard: 'Centro de operaciones jurídicas inteligentes', economia: 'Datos económicos y de producción: margen, equilibrio, uso, campañas e impagos',
  gestion: 'Planes, periodos, campañas, límites, suscriptores, impagos y permisos: el despacho lo configura sin desarrollos', consultas: 'Bandeja profesional de consultas: pago, estado e interés de cada caso',
  casos: 'Ficha del caso, señales detectadas por la IA y acciones del despacho', clientes: 'Historial de chat de cada cliente con su análisis emocional y la extracción automática',
  analytics: 'Indicadores de servicio, calidad de las respuestas y proyección',
  insight: 'Inteligencia cognitiva aplicada a cada conversación', supervision: 'Trazabilidad de cada respuesta de la IA, métricas de calidad y validación profesional',
  administracion: 'Configuración vigente de la plataforma y estado de los servicios' };
var TITULOS = { dashboard: 'Panel de control', consultas: 'Consultas', casos: 'Casos y expedientes', clientes: 'Clientes e historial',
  economia: 'Dashboard', gestion: 'Gestión', analytics: 'Informes y analytics', insight: 'LEGAL INSIGHT™', supervision: 'Supervisión de la IA', administracion: 'Administración' };
BO.secciones = BO.secciones || {};
function ir(sec, sub){
  if (sec === 'monetizacion') sec = 'gestion';          // la antigua «Monetización» es ahora Gestión
  if (!$('bo-' + sec)) sec = 'dashboard';
  var item = document.querySelector('.bo-item[data-sec="' + sec + '"]');
  if (item && item.closest('li').hidden) sec = 'dashboard';
  bo.sec = sec; P.store.set('legalia_bo_sec', sec);
  document.querySelectorAll('.bo-item').forEach(function(b){ var on = b.dataset.sec === sec; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  document.querySelectorAll('.bo-sec').forEach(function(s){ s.classList.toggle('on', s.id === 'bo-' + sec); });
  $('boSubtitulo').textContent = SUBT[sec] || '';
  $('boTitulo').textContent = $('boMiga').textContent = TITULOS[sec] || '';
  document.title = (TITULOS[sec] || 'Backoffice') + ' · Legal IA';
  vBo.classList.remove('menu-abierto');
  window.scrollTo(0, 0);
  var pintar = { dashboard: pintarDashboard, consultas: pintarConsultas, casos: pintarCasos, clientes: pintarClientes,
     analytics: pintarAnalytics, insight: pintarInsight, supervision: pintarSupervision, administracion: pintarAdministracion }[sec] || BO.secciones[sec];
  if (pintar) pintar(sub);
}
BO.ir = ir;
document.querySelectorAll('.bo-item').forEach(function(b){ b.addEventListener('click', function(){ ir(b.dataset.sec); }); });
$('boYo').addEventListener('click', function(e){
  e.stopPropagation();
  P.menuPop(e.currentTarget, [
    { texto: 'Administración', accion: function(){ ir('administracion'); } },
    '-',
    { texto: 'Cerrar sesión', accion: function(){ Sesion.salir(); } }
  ]);
});
$('logoDespacho').addEventListener('click', function(e){ e.preventDefault(); ir('dashboard'); });
$('boRefrescar').addEventListener('click', function(){ refrescarContadores(); ir(bo.sec); P.toast('Datos actualizados.'); });
$('boMenuMovil').addEventListener('click', function(){
  if (window.innerWidth <= 1100){ vBo.classList.toggle('menu-abierto'); return; }
  vBo.classList.toggle('nav-min'); P.store.set('legalia_bo_nav', vBo.classList.contains('nav-min') ? 'min' : '');
});
document.querySelectorAll('.bo-item').forEach(function(b){ b.title = b.textContent.trim(); });
$('boAlertas').addEventListener('click', function(){ ir('dashboard'); setTimeout(function(){ var a = $('boAlertasCard'); if (a) a.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300); });
$('boBuscar').addEventListener('keydown', function(e){ if (e.key === 'Enter'){ bo.q = this.value.trim(); bo.filtro = ''; ir('consultas'); } });

/* ---------- Panel de control ---------- */
function pintarDashboard(){
  var el = $('bo-dashboard'); if (!bo.resumen) cargando(el, 'Calculando indicadores');
  var econ = (BO.negocio && BO.negocio.permisos && BO.negocio.permisos.dashboard === 'ver') ? api('/api/bo/negocio/dashboard').catch(function(){ return null; }) : Promise.resolve(null);
  Promise.all([refrescarContadores(), econ]).then(function(res){
    var r = res[0], ec = res[1], ek = ec ? ec.kpis : null;
    var k = r.kpis;
    var evo = r.evolucion, etiquetas = evo.map(function(d){ return d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7); });
    var tipos = r.tipologia.slice(0, 6), totalT = r.tipologia.reduce(function(a, x){ return a + x.n; }, 0);
    var maxE = Math.max(r.embudo[0].n, 1);
    var h = '<div class="bo-card bo-pad bo-exec"><div class="bo-exec-ico" aria-hidden="true"><span class="fa fa-magic"></span></div><div><h3 class="bo-exec-tit">' + esc(saludo()) + ' · Resumen ejecutivo IA</h3><p>' + esc(r.resumen) + '</p></div></div>';
    h += '<div class="bo-grid g-kpis g-kpis7">' +
      kpi('💬', 'Consultas hoy', k.consultas_hoy, variacion(k.consultas_hoy, k.consultas_ayer)) +
      kpi('✓', 'Consultas respondidas', k.pagadas_hoy, variacion(k.pagadas_hoy, k.pagadas_ayer)) +
      (ek ? kpi('👤', 'Suscriptores activos', ek.suscriptores.toLocaleString('es-ES'), '<small>' + (ek.necesarios ? 'equilibrio: ' + ek.necesarios : '') + '</small>') +
            kpi('€', 'Ingresos netos del mes', euros(Math.round(ek.ingresos_netos)), '<small>sin IVA · margen ' + Math.round(ek.margen_pct || 0) + ' %</small>')
          : kpi('📁', 'Expedientes', k.expedientes, '<small>abiertos</small>') + kpi('◎', 'Valor potencial', euros(k.valor_potencial), '<small>casos de interés alto</small>')) +
      kpi('👤', 'Clientes nuevos hoy', k.nuevos_clientes_hoy, '<small>' + k.clientes + ' clientes en total</small>') +
      kpi('☆', 'Casos interés alto', k.interes_alto, '<small>según el análisis IA</small>') +
      kpi('⏱', 'Pendientes de revisión', k.pendientes, k.pendientes ? '<small class="baja">requieren atención</small>' : '<small class="sube">al día</small>') + '</div>';
    h += '<div class="bo-grid g-3">' +
      '<div class="bo-card bo-pad bo-chart"><h3>Consultas y preguntas (14 días)</h3><div class="bo-leyenda"><span><i style="background:#2d8cff"></i>Consultas nuevas</span><span><i style="background:#d4a84f"></i>Preguntas de clientes</span></div>' +
        lineas([{ nombre: 'Consultas nuevas', datos: evo.map(function(d){ return d.consultas; }), color: '#2d8cff', area: true, fmt: function(v){ return v; } },
                { nombre: 'Preguntas', datos: evo.map(function(d){ return d.mensajes; }), color: '#d4a84f', fmt: function(v){ return v; } }], etiquetas) + '</div>' +
      '<div class="bo-card bo-pad"><h3>Tipología de consultas</h3>' + (tipos.length ? '<div class="bo-donut-wrap">' + donut(tipos, totalT + '\nTotal') + '<div class="bo-lista">' +
        tipos.map(function(t, i){ return '<div class="bo-lista-fila"><span><i style="background:' + PALETA[i % PALETA.length] + '"></i>' + esc(t.materia) + '</span><b>' + Math.round(100 * t.n / totalT) + ' %</b></div>'; }).join('') + '</div></div>'
        : '<div class="bo-vacio">Aún no hay consultas.</div>') + '</div>' +
      '<div class="bo-card bo-pad"><h3>Embudo de conversión</h3><div class="bo-embudo">' + r.embudo.map(function(e, i){
          var w = Math.max(38, 92 * e.n / maxE);
          return '<div class="bo-embudo-paso" style="width:' + w + '%;background:linear-gradient(90deg,' + ['#2457d4,#2b91e8', '#278bdd,#37a9df', '#2ca2c5,#41bdc1', '#48c1a1,#69d6b5'][i] + ')"><span>' + esc(e.etapa) + '</span><b>' + e.n + '</b></div>'; }).join('') +
        '</div><p class="bo-nota" style="text-align:center">Conversión a expediente: <b class="n-green">' + (r.embudo[0].n ? (100 * r.embudo[3].n / r.embudo[0].n).toFixed(1).replace('.', ',') : '0') + ' %</b></p></div></div>';
    h += '<div class="bo-grid g-2"><div class="bo-card"><div class="bo-cab"><h3>Consultas recientes</h3><button type="button" class="bo-btn sec" data-ir="consultas">Ver todas</button></div>' + tablaConsultas(r.recientes, true) + '</div>' +
      '<div class="bo-grid" style="margin:0"><div class="bo-card bo-pad" id="boAlertasCard"><h3>Alertas inteligentes</h3>' + r.alertas.map(function(a){
          return '<button type="button" class="bo-fila" data-alerta="' + a.tipo + '"><span>' + esc(a.texto) + '</span><b class="n-' + a.color + '">' + a.n + '</b></button>'; }).join('') + '</div>' +
        '<div class="bo-card bo-pad"><h3>Actividad del despacho (hoy)</h3>' + (r.actividad.length ? r.actividad.map(function(a){ return '<div class="bo-fila"><span>' + esc(a.texto) + '</span><b>' + a.n + '</b></div>'; }).join('')
          : '<div class="bo-nota">Sin actividad todavía hoy.</div>') + '</div></div></div>';
    h += '<div class="bo-grid g-kpis">' + (ek ? kpi('↗', 'Resultado tras fijos', (ek.resultado >= 0 ? '+' : '') + euros(Math.round(ek.resultado)), '<small>fijos ' + euros(ek.fijos) + '/mes</small>') : '') +
      kpi('⟳', 'Clientes recurrentes', k.recurrentes, '<small>con más de una consulta</small>') +
      kpi('📁', 'Expedientes', k.expedientes, '<small>abiertos</small>') +
      kpi('◎', 'Valor potencial', euros(k.valor_potencial), '<small>casos de interés alto</small>') +
      kpi('⚖', 'Respaldo jurisprudencial', k.respaldo_pct == null ? '—' : k.respaldo_pct + ' %', '<small>de las respuestas</small>') + '</div>';
    if (ec) h += '<p class="bo-nota">Suscriptores e importes del modelo de suscripción' + (ec.demo ? ' (incluye datos de demostración)' : '') + '. Detalle en <a href="#" data-ir="economia">Dashboard</a>.</p>';
    $('bo-dashboard').innerHTML = h;
  }).catch(function(e){ el.innerHTML = '<div class="bo-card bo-vacio">No se pudo cargar el panel: ' + esc(e.message) + '</div>'; });
}
var ALERTA_FILTRO = { pendientes: 'nueva', documentacion: 'doc_pendiente', plazos: 'plazo_riesgo', sin_asignar: 'interes_alto', sin_analizar: 'sin_analizar' };
vBo.addEventListener('click', function(e){
  var t;
  if ((t = e.target.closest('[data-ir]'))){ ir(t.dataset.ir); return; }
  if ((t = e.target.closest('[data-alerta]'))){
    if (t.dataset.alerta === 'mensajes'){
      api('/api/bo/clientes').then(function(d){
        var c = d.clientes.find(function(x){ return x.mensajes_sin_leer; });
        if (c){ bo.cliAbierto = c.id; bo.chatId = null; bo.chat = null; bo.convTab = 'canal'; }
        ir('clientes');
      });
      return;
    }
    bo.filtro = ALERTA_FILTRO[t.dataset.alerta] || ''; bo.q = ''; ir('consultas'); return;
  }
  if ((t = e.target.closest('[data-caso]'))){ e.stopPropagation(); abrirCaso(t.dataset.caso); return; }
  if ((t = e.target.closest('[data-conv]'))){ abrirConversacion(t.dataset.conv, t.dataset.cli); return; }
});
vBo.addEventListener('keydown', function(e){
  var tr = e.target.closest('tr[data-caso]');
  if (tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); abrirCaso(tr.dataset.caso); }
});

function tagPlan(sub){
  if (!sub) return '<span class="bo-tag t-gray">Sin plan</span>';
  var cls = sub.estado === 'activa' ? 't-gold' : sub.estado === 'suspendida' || sub.estado === 'uso_indebido' ? 't-red' : 't-gray';
  return '<span class="bo-tag ' + cls + '" title="' + esc(sub.estado || '') + '">' + esc(sub.plan || '—') + '</span>';
}
function tablaConsultas(filas, corta){
  if (!filas.length) return '<div class="bo-vacio">No hay consultas' + (bo.q || bo.filtro ? ' con ese filtro' : ' todavía') + '. Cuando un cliente escriba en Legal IA aparecerá aquí.</div>';
  return '<div class="bo-tabla-wrap"><table class="bo-tabla tarjetas"><thead><tr>' + (corta ? '' : '<th>Nº consulta</th>') + '<th>Cliente</th><th>Consulta</th><th>Fecha</th><th>Plan</th><th>Recurrente</th><th>Interés</th><th>Estado</th>' + (corta ? '' : '<th></th>') + '</tr></thead><tbody>' +
    filas.map(function(f){
      return '<tr data-caso="' + esc(f.id) + '" tabindex="0">' + (corta ? '' : '<td class="t-ref" data-label="Nº consulta">' + esc(f.ref) + '</td>') +
        '<td class="t-cab-movil"><div class="bo-cli">' + av(f.cliente.nombre) + '<span>' + esc(f.cliente.nombre) + '</span></div></td>' +
        '<td class="t-ancha" data-label="Consulta"><b style="font-weight:600">' + esc(f.materia) + '</b><br><small style="color:var(--ink-faint)">' + esc(f.titulo.slice(0, 60)) + '</small></td>' +
        '<td data-label="Fecha">' + esc(fecha(f.actualizado)) + '</td><td data-label="Plan">' + tagPlan(f.suscripcion) + '</td>' +
        '<td data-label="Recurrente">' + (f.recurrente ? '<span class="bo-tag t-green">Sí</span>' : '<span class="bo-tag t-gray">No</span>') + '</td>' +
        '<td data-label="Interés">' + tagInteres(f.interes) + '</td><td data-label="Estado"><span class="bo-estado-cel">' + tagEstado(f.estado) + (f.despacho_mensajes ? '<span title="El despacho ha escrito al cliente" aria-label="El despacho ha escrito al cliente">✉</span>' : '') + '</span></td>' +
        (corta ? '' : '<td class="t-acc-movil"><button type="button" class="bo-btn sec sm" data-caso="' + esc(f.id) + '">Abrir</button></td>') + '</tr>';
    }).join('') + '</tbody></table></div>';
}

/* ---------- Consultas ---------- */
var FILTROS = [['', 'Todas'], ['nueva', 'Nuevas'], ['pendiente_doc', 'Pend. doc.'], ['interes_alto', 'Interés alto'], ['doc_pendiente', 'Documentación incompleta'],
               ['plazo_riesgo', 'Plazos en riesgo'], ['sin_analizar', 'Sin analizar'], ['expediente', 'Expedientes'], ['descartada', 'Descartadas']];
function filtrar(filas){
  var f = bo.filtro;
  if (f === 'doc_pendiente') filas = filas.filter(function(x){ return x.doc_pendiente; });
  else if (f === 'plazo_riesgo') filas = filas.filter(function(x){ return x.plazo_riesgo; });
  else if (f === 'sin_analizar') filas = filas.filter(function(x){ return x.pagada && !x.analizada; });
  else if (f === 'interes_alto') filas = filas.filter(function(x){ return x.interes === 'Alto'; });
  else if (f) filas = filas.filter(function(x){ return x.estado === f; });
  return filas;
}
function pintarConsultas(){
  var el = $('bo-consultas'); cargando(el, 'Cargando la bandeja');
  api('/api/bo/consultas?q=' + encodeURIComponent(bo.q || '')).then(function(d){
    bo.consultas = d.consultas;
    var filas = filtrar(d.consultas);
    bo.filasVisibles = filas;
    el.innerHTML = '<div class="bo-card t-IRR-region"><div class="bo-cab"><h3>Bandeja de consultas</h3></div>' +
      '<div class="t-IRR-toolbar"><label class="t-IRR-search"><span class="fa fa-search" aria-hidden="true"></span><input type="search" id="irBuscar" value="' + esc(bo.q || '') + '" placeholder="Buscar: cliente, materia, texto…" aria-label="Buscar en consultas"></label>' +
      '<button type="button" class="t-Button" data-ir-ir><span class="fa fa-arrow-right" aria-hidden="true"></span> Ir</button>' +
      '<button type="button" class="t-Button" data-acciones-ir aria-haspopup="menu"><span class="fa fa-cog" aria-hidden="true"></span> Acciones <span class="fa fa-angle-down" aria-hidden="true"></span></button></div>' +
      '<div class="bo-filtros t-IRR-filtros" role="group" aria-label="Filtros">' + FILTROS.map(function(x){ return '<button type="button" class="bo-chip' + (bo.filtro === x[0] ? ' on' : '') + '" data-filtro="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
      (bo.q ? '<button type="button" class="bo-chip on" data-limpiarq>«' + esc(bo.q) + '» <span class="fa fa-times" aria-hidden="true"></span></button>' : '') + '</div>' +
      tablaConsultas(filas, false) + '<div class="t-IRR-pagination">' + (filas.length ? 'Filas 1 - ' + filas.length + ' de ' + filas.length : '') + '</div></div>';
  }).catch(function(e){ el.innerHTML = '<div class="bo-card bo-vacio">' + esc(e.message) + '</div>'; });
}
function csv(nombre, cab, filas){
  var q = function(v){ v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var txt = '\ufeff' + [cab].concat(filas).map(function(f){ return f.map(q).join(';'); }).join('\r\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
$('bo-consultas').addEventListener('keydown', function(e){ if (e.target.id === 'irBuscar' && e.key === 'Enter'){ bo.q = e.target.value.trim(); pintarConsultas(); } });
$('bo-consultas').addEventListener('click', function(e){
  if (e.target.closest('[data-ir-ir]')){ bo.q = $('irBuscar').value.trim(); pintarConsultas(); return; }
  var ac = e.target.closest('[data-acciones-ir]');
  if (ac){
    e.stopPropagation();
    P.menuPop(ac, [
      { texto: 'Descargar CSV', accion: function(){
        csv('consultas_legalia.csv', ['Nº consulta', 'Cliente', 'Materia', 'Consulta', 'Actualizada', 'Plan', 'Recurrente', 'Interés', 'Estado'],
          (bo.filasVisibles || []).map(function(f){ return [f.ref, f.cliente.nombre, f.materia, f.titulo, f.actualizado, f.suscripcion ? f.suscripcion.plan : 'Sin plan', f.recurrente ? 'Sí' : 'No', f.interes, f.estado_txt]; }));
      } },
      { texto: 'Restablecer filtros', accion: function(){ bo.filtro = ''; bo.q = ''; $('boBuscar').value = ''; pintarConsultas(); } }
    ]);
    return;
  }
  var b = e.target.closest('[data-filtro]'); if (b){ bo.filtro = b.dataset.filtro; pintarConsultas(); return; }
  if (e.target.closest('[data-limpiarq]')){ bo.q = ''; $('boBuscar').value = ''; pintarConsultas(); }
});

/* ---------- Casos / expedientes ---------- */
function abrirCaso(id){ bo.casoId = id; bo.casoDetalle = true; ir('casos'); }
function estrecho(){ return window.matchMedia('(max-width: 1100px)').matches; }
function pintarCasos(){
  var el = $('bo-casos');
  var lista = function(){
    var filas = bo.consultas;
    return '<div class="bo-card md-lista"><div class="bo-cab"><h3>Casos</h3><span class="bo-tag t-gray">' + filas.length + '</span></div><div class="bo-lista-casos">' + (filas.length ? filas.map(function(f){
      return '<button type="button" class="bo-cli-item' + (f.id === bo.casoId ? ' on' : '') + '" data-caso="' + esc(f.id) + '"><div class="bo-cli">' + av(f.cliente.nombre) + '<div style="min-width:0"><b>' + esc(f.cliente.nombre) + '</b><small>' + esc(f.ref) + ' · ' + esc(f.materia) + '</small></div></div>' +
        '<div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">' + tagEstado(f.estado) + tagInteres(f.interes) + (f.expediente_id ? '<span class="bo-tag t-gold">Expediente</span>' : '') + '</div></button>'; }).join('') : '<div class="bo-vacio">Sin casos.</div>') + '</div></div>';
  };
  var seguir = function(){
    if (!bo.casoId && bo.consultas.length && !estrecho()) bo.casoId = bo.consultas[0].id;
    el.classList.toggle('md-detalle', !!(bo.casoDetalle && bo.casoId));
    if (!bo.casoId){ el.innerHTML = '<div class="bo-grid g-caso bo-md">' + lista() + '<div class="bo-card bo-vacio md-detalle-panel">' + (bo.consultas.length ? 'Elige un caso para ver su ficha.' : 'Aún no hay casos. Aparecerán cuando los clientes hagan consultas.') + '</div></div>'; return; }
    var volver = '<button type="button" class="bo-volver" data-volver-casos><span class="fa fa-arrow-left" aria-hidden="true"></span> Todos los casos</button>';
    el.innerHTML = '<div class="bo-grid g-caso bo-md">' + lista() + '<div class="bo-card md-detalle-panel" style="grid-column:span 2">' + '<div class="bo-cargando"><span class="dots">Cargando el caso</span></div></div></div>';
    api('/api/bo/chats/' + bo.casoId).then(function(c){ bo.chat = c; el.innerHTML = '<div class="bo-grid g-caso bo-md">' + lista() + '<div class="md-detalle-panel md-pila">' + volver + '<div class="g-caso-ficha">' + fichaCaso(c) + '</div></div></div>';
        if (bo.casoDetalle && estrecho()) window.scrollTo(0, 0); })
      .catch(function(e){ el.innerHTML = '<div class="bo-grid g-caso bo-md">' + lista() + '<div class="bo-card bo-vacio md-detalle-panel" style="grid-column:span 2">' + volver + esc(e.message) + '</div></div>'; });
  };
  if (!bo.consultas.length) api('/api/bo/consultas').then(function(d){ bo.consultas = d.consultas; seguir(); }); else seguir();
}
function fichaCaso(c){
  var f = c.fila, a = c.analisis && !c.analisis.error ? c.analisis : null, g = c.gestion || {};
  var cli = c.cliente || {}, docs = c.documentos || [];
  var opts = function(lista, sel){ return lista.map(function(x){ return '<option value="' + x[0] + '"' + (x[0] === sel ? ' selected' : '') + '>' + x[1] + '</option>'; }).join(''); };
  var perfil = '<div class="bo-card bo-pad bo-perfil"><div class="bo-perfil-cab"><div class="bo-perfil-av">' + esc(P.iniciales(cli.nombre || '?')) + '</div><div><h3>' + esc(cli.nombre || 'Sin cliente') + '</h3><p>' + esc(f.ref) + ' · ' + esc(f.materia) + '</p></div></div>' +
    '<div class="bo-info"><div><span>Plan</span><b>' + tagPlan(f.suscripcion) + (f.suscripcion && BO.negocio && BO.negocio.permisos.suscriptores !== 'no' ? ' <button type="button" class="acc-link" data-ver-sub="' + esc(f.suscripcion.id) + '">Ficha</button>' : '') + '</b></div>' +
    '<div><span>Contacto</span><b>' + esc(cli.email || '—') + (cli.telefono ? '<br>' + esc(cli.telefono) : '') + '</b></div>' +
    '<div><span>Cliente recurrente</span><b>' + (f.recurrente ? 'Sí' : 'No') + '</b></div>' +
    '<div><span>Mensajes / documentos</span><b>' + f.mensajes + ' / ' + f.documentos + '</b></div>' +
    '<div><span>Valor potencial</span><b>' + (a && a.valor_potencial_eur ? euros(a.valor_potencial_eur) : '—') + '</b></div>' +
    '<div><span>Interés</span><b><select class="bo-sel" data-gest="interes" aria-label="Interés"><option value="">—</option>' + opts([['Alto', 'Alto'], ['Medio', 'Medio'], ['Bajo', 'Bajo']], f.interes) + '</select></b></div>' +
    '<div><span>Estado</span><b><select class="bo-sel" data-gest="estado" aria-label="Estado">' + opts(Object.keys(ESTADO).map(function(k){ return [k, ESTADO[k][0]]; }), f.estado) + '</select></b></div>' +
    '<div><span>Asignado</span><b>' + esc(g.asignado || 'Sin asignar') + '</b></div>' +
    (c.expediente ? '<div><span>Expediente</span><b>' + esc(c.expediente.titulo) + '</b></div>' : '') + '</div>' +
    '<h3 class="bo-sub">Acciones del despacho</h3><div class="bo-acciones">' +
    '<button type="button" class="bo-btn ancho" data-accion="contactar">Contactar al cliente</button>' +
    '<button type="button" class="bo-btn sec" data-accion="documentacion">Pedir documentación</button>' +
    '<button type="button" class="bo-btn sec" data-conv="' + esc(c.id) + '" data-cli="' + esc(cli.id || '') + '">Ver conversación</button>' +
    (g.asignado === (Sesion.usuario || {}).nombre ? '' : '<button type="button" class="bo-btn sec" data-accion="asignar">Asignármelo</button>') +
    (c.expediente_id ? '' : '<button type="button" class="bo-btn sec" data-accion="expediente">Abrir expediente</button>') +
    (f.estado === 'descartada' ? '' : '<button type="button" class="bo-btn peligro ancho" data-accion="descartar">Descartar consulta</button>') + '</div></div>';
  var ia = '<div class="bo-card bo-pad"><h3>Resumen IA de la consulta<button type="button" class="bo-btn sec bo-acc" data-accion="analizar">' + (a ? 'Reanalizar' : 'Analizar con IA') + '</button></h3>' +
    (a ? (f.analisis_desactualizado ? '<div class="bo-aviso">Hay mensajes nuevos desde el último análisis.</div>' : '') +
      '<div class="bo-burbuja">' + esc(a.resumen) + '</div>' +
      ((a.senales || []).length ? '<div class="bo-burbuja ia"><b>Señales relevantes:</b> ' + esc(a.senales.join(' · ')) + '</div>' : '') +
      (a.proxima_accion ? '<div class="bo-burbuja"><b>Próxima acción recomendada:</b> ' + esc(a.proxima_accion) + '</div>' : '') +
      ((a.plazos || []).length ? '<div class="bo-burbuja"><b>Plazos:</b><ul>' + a.plazos.map(function(p){ return '<li>' + esc(p.descripcion) + ' — ' + esc(p.fecha_limite || 'No consta') + ' <span class="bo-tag ' + (p.riesgo === 'alto' ? 't-red' : p.riesgo === 'medio' ? 't-orange' : 't-gray') + '">riesgo ' + esc(p.riesgo || '—') + '</span></li>'; }).join('') + '</ul></div>' : '') +
      ((a.documentacion_pendiente || []).length ? '<div class="bo-burbuja"><b>Documentación pendiente:</b> ' + esc(a.documentacion_pendiente.join(' · ')) + '</div>' : '') +
      '<p class="bo-nota">Análisis del ' + esc(fecha(a.generado)) + '' + '</p>'
      : '<div class="bo-vacio">Esta consulta aún no se ha analizado. El análisis extrae los datos del caso, el estado emocional del cliente, los plazos y la próxima acción recomendada.</div>') +
    '<h3 class="bo-sub">Notas internas</h3>' + ((g.notas || []).slice(-5).reverse().map(function(n){ return '<div class="bo-nota-int"><small>' + esc(n.autor) + ' · ' + esc(fecha(n.ts)) + '</small>' + esc(n.texto) + '</div>'; }).join('') || '<p class="bo-nota">Sin notas. Solo las ve el despacho.</p>') +
    '<div class="bo-conv-pie" style="padding:8px 0 0;border:none"><textarea id="boNota" placeholder="Añadir una nota interna…" aria-label="Nota interna"></textarea><button type="button" class="bo-btn sec" data-accion="nota">Guardar</button></div>' +
    '<h3 class="bo-sub">Documentos del cliente</h3>' + (docs.length ? docs.map(function(d){
      return '<div class="bo-fila"><span><b>' + esc(d.tipo || 'Documento') + '</b> · ' + esc(d.titulo || d.nombre) + '</span><a class="bo-btn sec" target="_blank" rel="noopener" href="' + esc(Sesion.base() + '/api/chats/' + c.id + '/documentos/' + d.id + '/archivo?t=' + encodeURIComponent(Sesion.token || '')) + '">Ver</a></div>'; }).join('')
      : '<p class="bo-nota">El cliente no ha aportado documentos.</p>') + '</div>';
  return perfil + ia;
}
$('bo-casos').addEventListener('change', function(e){
  var s = e.target.closest('[data-gest]'); if (!s) return;
  var cambio = {}; cambio[s.dataset.gest] = s.value;
  gestion(bo.casoId, cambio, 'Caso actualizado.');
});
$('bo-casos').addEventListener('click', function(e){
  if (e.target.closest('[data-volver-casos]')){ bo.casoDetalle = false; $('bo-casos').classList.remove('md-detalle'); window.scrollTo(0, 0); return; }
  var vs = e.target.closest('[data-ver-sub]'); if (vs && BO.verSuscriptor){ BO.verSuscriptor(vs.dataset.verSub); return; }
  var b = e.target.closest('[data-accion]'); if (!b || !bo.chat) return;
  var c = bo.chat, cli = c.cliente || {}, a = c.analisis || {};
  var acc = b.dataset.accion;
  if (acc === 'analizar') return analizar(c.id, b, pintarCasos);
  if (acc === 'asignar') return gestion(c.id, { asignado: (Sesion.usuario || {}).nombre, estado: c.fila.estado === 'nueva' ? 'revisada' : null }, 'Caso asignado a ti.');
  if (acc === 'descartar') return P.modal({ titulo: 'Descartar la consulta', texto: 'Quedará marcada como descartada en la bandeja. El cliente no recibe ningún aviso.', boton: 'Descartar', peligro: true })
    .then(function(ok){ if (ok) gestion(c.id, { estado: 'descartada' }, 'Consulta descartada.'); });
  if (acc === 'nota'){ var t = $('boNota').value.trim(); if (t) gestion(c.id, { nota: t }, 'Nota guardada.'); return; }
  if (acc === 'expediente') return P.modal({ titulo: 'Convertir a expediente', texto: 'Se abrirá un expediente con esta consulta y sus documentos. El cliente lo verá en su historial.',
      campos: [{ etiqueta: 'Nombre del expediente', valor: (cli.nombre ? cli.nombre.split(' ')[0] + ' · ' : '') + c.fila.materia }], boton: 'Crear expediente' })
    .then(function(v){ if (!v) return; api('/api/bo/chats/' + c.id + '/expediente', { method: 'POST', body: { titulo: v[0] } }).then(function(){ P.toast('Expediente creado.'); recargarCaso(); }).catch(function(e){ P.toast(e.message); }); });
  if (acc === 'contactar' || acc === 'documentacion'){
    var nombre = (cli.nombre || '').split(' ')[0];
    var texto = acc === 'documentacion'
      ? 'Hola ' + nombre + ', para poder valorar tu caso necesitamos que nos aportes: ' + ((a.documentacion_pendiente || []).join(', ') || 'la documentación que tengas sobre el asunto') + '. Puedes adjuntarla con el clip dentro de tu consulta en Legal IA. Gracias.'
      : 'Hola ' + nombre + ', soy ' + ((Sesion.usuario || {}).nombre || 'tu abogado') + ', de Despacho Demo. He revisado tu consulta y me gustaría hablar contigo. ¿Te viene bien una llamada hoy o mañana?';
    return P.modal({ titulo: acc === 'documentacion' ? 'Solicitar documentación' : 'Contactar al cliente', texto: 'Le llegará a «Mensajes con el despacho», aparte de su conversación con Legal IA, con referencia a ' + (c.numero || 'esta consulta') + '.',
      campos: [{ etiqueta: 'Mensaje', multilinea: true, valor: texto }], boton: 'Enviar' }).then(function(v){
      if (!v || !v[0]) return;
      api('/api/bo/chats/' + c.id + '/mensaje', { method: 'POST', body: { texto: v[0], estado: acc === 'documentacion' ? 'pendiente_doc' : 'contactada' } })
        .then(function(){ P.toast('Mensaje enviado al cliente.'); recargarCaso(); }).catch(function(e){ P.toast(e.message); });
    });
  }
});
function recargarCaso(){ api('/api/bo/consultas').then(function(d){ bo.consultas = d.consultas; pintarCasos(); refrescarContadores(); }); }
function gestion(id, cambios, msg){
  Object.keys(cambios).forEach(function(k){ if (cambios[k] == null) delete cambios[k]; });
  return api('/api/bo/chats/' + id + '/gestion', { method: 'PATCH', body: cambios }).then(function(){ P.toast(msg); recargarCaso(); }).catch(function(e){ P.toast(e.message); });
}
function analizar(id, btn, despues){
  if (btn){ btn.disabled = true; btn.textContent = 'Analizando…'; }
  return api('/api/bo/chats/' + id + '/analisis', { method: 'POST' }).then(function(c){
    P.toast('Conversación analizada.');
    var i = bo.consultas.findIndex(function(x){ return x.id === id; }); if (i >= 0) bo.consultas[i] = c.fila;
    refrescarContadores(); if (despues) despues(c);
    return c;
  }).catch(function(e){ P.toast(e.message); if (btn){ btn.disabled = false; btn.textContent = 'Analizar con IA'; } });
}

/* ---------- Clientes e historial (análisis emocional + extracción automática) ---------- */
function pintarClientes(){
  var el = $('bo-clientes');
  if (!el.firstChild) el.innerHTML = '<div class="bo-grid g-cli bo-md"><div class="bo-card md-lista" id="boCliLista"></div><div class="md-detalle-panel md-pila"><button type="button" class="bo-volver" data-volver-cli><span class="fa fa-arrow-left" aria-hidden="true"></span> Todos los clientes</button><div class="bo-card bo-conv" id="boConv"></div></div><div id="boCliIA" class="md-detalle-panel"></div></div>';
  el.classList.toggle('md-detalle', !!bo.cliDetalle);
  cargando($('boCliLista'), 'Cargando clientes');
  api('/api/bo/clientes').then(function(d){
    // Primero los clientes con mensajes sin leer
    bo.clientes = d.clientes.slice().sort(function(a, b){ return (b.mensajes_sin_leer ? 1 : 0) - (a.mensajes_sin_leer ? 1 : 0); });
    // No se abre ningún cliente por defecto: abrirlo marcaría sus mensajes como leídos sin que el abogado los haya elegido
    pintarListaClientes();
    if (bo.chatId) abrirConversacion(bo.chatId, bo.cliAbierto, true); else pintarConvVacia();
  }).catch(function(e){ $('boCliLista').innerHTML = '<div class="bo-vacio">' + esc(e.message) + '</div>'; });
}
function pintarListaClientes(){
  var q = P.store.get('legalia_bo_qcli') || '';
  var lista = bo.clientes.filter(function(c){ return !q || (c.nombre + ' ' + c.email).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
  $('boCliLista').innerHTML = '<div class="bo-cab"><h3>Clientes <span class="bo-tag t-gray">' + bo.clientes.length + '</span></h3></div>' +
    '<div style="padding:10px 12px"><label class="bo-buscar" style="width:100%"><input id="boQCli" type="search" value="' + esc(q) + '" placeholder="Buscar cliente…" aria-label="Buscar cliente"></label></div>' +
    '<div class="bo-clientes">' + (lista.length ? lista.map(function(c){
      var ab = c.id === bo.cliAbierto;
      return '<button type="button" class="bo-cli-item' + (ab ? ' on' : '') + '" data-cliab="' + esc(c.id) + '" aria-expanded="' + ab + '"><div class="bo-cli">' + av(c.nombre) +
        '<div style="min-width:0;flex:1"><b>' + esc(c.nombre) + '</b><small>' + c.consultas + ' consulta' + (c.consultas === 1 ? '' : 's') + ' · ' + esc(c.ultima_actividad ? hace(c.ultima_actividad) : 'sin actividad') + '</small></div>' +
        (c.mensajes_sin_leer ? '<span class="bo-badge-msg" title="Mensajes del cliente sin leer"><span class="fa fa-envelope" aria-hidden="true"></span> ' + c.mensajes_sin_leer + '</span>' : '') +
        (c.interes ? tagInteres(c.interes) : '') + '</div></button>' + (ab ? '<div class="bo-cli-chats" id="boCliChats"><div class="bo-nota" style="padding:6px 12px">Cargando…</div></div>' : '');
    }).join('') : '<div class="bo-vacio">Ningún cliente coincide.</div>') + '</div>';
  if (bo.cliAbierto) cargarChatsCliente(bo.cliAbierto);
}
function cargarChatsCliente(cid){
  api('/api/bo/clientes/' + cid).then(function(d){
    var cont = $('boCliChats'); if (!cont) return;
    var cli = (bo.clientes || []).find(function(x){ return x.id === cid; }) || {};
    cont.innerHTML = '<button type="button" class="bo-cli-chat canal' + (!bo.chatId ? ' on' : '') + '" data-canal-cli="' + esc(cid) + '"><span class="fa fa-envelope-o" aria-hidden="true"></span><span>Mensajes con el cliente</span>' + (cli.mensajes_sin_leer ? '<b class="bo-badge-msg">' + cli.mensajes_sin_leer + '</b>' : '') + '</button>' +
      (cli.suscripcion ? '<div class="bo-cli-plan"><span class="bo-tag t-gold">' + esc(cli.suscripcion.plan) + '</span>' + (BO.verSuscriptor && BO.negocio && BO.negocio.permisos.suscriptores !== 'no' ? '<button type="button" class="acc-link" data-ver-sub="' + esc(cli.suscripcion.id) + '">Ver suscripción</button>' : '') + '</div>' : '') +
      (d.consultas.length ? d.consultas.map(function(f){
      return '<button type="button" class="bo-cli-chat' + (f.id === bo.chatId ? ' on' : '') + '" data-conv="' + esc(f.id) + '" data-cli="' + esc(cid) + '"><span>' + esc(f.titulo) + '</span>' + (f.analizada ? '<b class="n-green" title="Analizada">●</b>' : '') + '</button>';
    }).join('') : '<div class="bo-nota" style="padding:6px 12px">Este cliente aún no ha hecho consultas.</div>');
  });
}
$('bo-clientes').addEventListener('click', function(e){
  if (e.target.closest('[data-volver-cli]')){ bo.cliDetalle = false; $('bo-clientes').classList.remove('md-detalle'); window.scrollTo(0, 0); return; }
  if (e.target.closest('[data-canal-cli]')){
    bo.chatId = null; bo.chat = null; bo.convTab = 'canal'; bo.cliDetalle = true;
    $('bo-clientes').classList.add('md-detalle'); if (estrecho()) window.scrollTo(0, 0);
    document.querySelectorAll('.bo-cli-chat').forEach(function(x){ x.classList.toggle('on', x.hasAttribute('data-canal-cli')); });
    pintarCentro(); $('boCliIA').innerHTML = ''; return;
  }
  var b = e.target.closest('[data-cliab]');
  if (b){
    var otro = bo.cliAbierto !== b.dataset.cliab;
    bo.cliAbierto = otro ? b.dataset.cliab : null; pintarListaClientes();
    if (otro && (!bo.chat || (bo.chat.cliente || {}).id !== bo.cliAbierto)){ bo.chatId = null; bo.chat = null; bo.convTab = 'canal'; pintarConvVacia(); }
    else if (!bo.cliAbierto && !bo.chat) pintarConvVacia();
    return;
  }
  if (e.target.closest('.bo-cli-chat, .canal-ref')) bo.convTab = 'bot';
  if ((b = e.target.closest('[data-reanalizar]'))) return analizar(bo.chatId, b, function(){ abrirConversacion(bo.chatId, bo.cliAbierto, true); cargarChatsCliente(bo.cliAbierto); });
  if ((b = e.target.closest('[data-usar-resp]'))){ usarEnMensaje(b.dataset.usarResp); return; }
  if ((b = e.target.closest('[data-enviar-cli]'))) return enviarAlCliente();
  if ((b = e.target.closest('[data-conv-tab]'))){ bo.convTab = b.dataset.convTab; pintarCentro(); return; }
  if ((b = e.target.closest('[data-ver-insight]'))){ bo.insightId = bo.chatId; ir('insight'); }
  if ((b = e.target.closest('[data-ver-sub]')) && BO.verSuscriptor){ BO.verSuscriptor(b.dataset.verSub); return; }
  if (e.target.closest('a.cite-ref')) e.preventDefault();
});
$('bo-clientes').addEventListener('input', function(e){
  if (e.target.id === 'boQCli'){ P.store.set('legalia_bo_qcli', e.target.value); var pos = e.target.selectionStart; pintarListaClientes(); var n = $('boQCli'); n.focus(); n.setSelectionRange(pos, pos); }
});
function pintarConvVacia(){
  bo.chat = null;
  if (bo.cliAbierto){ pintarCentro(); }
  else $('boConv').innerHTML = '<div class="bo-vacio" style="margin:auto">Elige un cliente y una de sus consultas para ver la conversación, su análisis emocional y los datos extraídos.</div>';
  $('boCliIA').innerHTML = '';
}
function abrirConversacion(chatId, cliId, sinIr){
  bo.chatId = chatId; if (cliId) bo.cliAbierto = cliId;
  if (!sinIr) bo.cliDetalle = true;
  var secCli = $('bo-clientes'); if (secCli && bo.cliDetalle){ secCli.classList.add('md-detalle'); if (estrecho()) window.scrollTo(0, 0); }
  if (!sinIr && bo.sec !== 'clientes'){ ir('clientes'); return; }
  if (!$('boConv')) return;
  document.querySelectorAll('.bo-cli-chat').forEach(function(x){ x.classList.toggle('on', x.dataset.conv === chatId); });
  cargando($('boConv'), 'Cargando la conversación');
  api('/api/bo/chats/' + chatId).then(function(c){ bo.chat = c; pintarCentro(); pintarPanelIA(c); })
    .catch(function(e){ $('boConv').innerHTML = '<div class="bo-vacio">' + esc(e.message) + '</div>'; });
}
function pintarConversacion(c){   // devuelve el HTML (solo lectura)
  var cli = c.cliente || {}, ini = P.iniciales(cli.nombre || '?'), dia = '';
  var cuerpo = (c.mensajes || []).map(function(m){
    var d = (m.ts || '').slice(0, 10), sep = '';
    if (d && d !== dia){ dia = d; sep = '<div class="bo-ts">' + esc(new Date(m.ts).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })) + '</div>'; }
    var hora = m.ts ? new Date(m.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
    if (m.rol === 'usuario') return sep + '<div class="msg user"><div class="avatar user">' + esc(ini) + '</div><div class="bubble"><div class="bo-txt">' + esc(m.texto) + '</div><div class="bo-hora">' + esc(hora) + '</div></div></div>';
    var r = m.respuesta || {};
    return sep + '<div class="msg bot"><div class="avatar bot">P</div><div class="bubble">' + (r.answer || '<p>(sin respuesta)</p>') + '<div class="bo-hora">' + esc(hora) +
      ((r.trazabilidad || {}).base_respuesta ? ' · respaldo: ' + esc(r.trazabilidad.base_respuesta) : '') +
      (r.correlation_id ? ' · <button type="button" class="bo-traza" data-evidencia="' + esc(r.correlation_id) + '" title="Ver la traza completa de esta respuesta"><span class="fa fa-search-plus" aria-hidden="true"></span> Traza</button>' : '') + '</div></div></div>';
  }).join('');
  return '<div class="bo-conv-cuerpo" aria-label="Conversación del cliente con Legal IA (solo lectura)">' + (cuerpo || '<div class="bo-vacio">Sin mensajes.</div>') + '</div>' +
    '<div class="bo-conv-solo">Conversación entre el cliente y el asistente Legal IA · solo lectura. Para escribir al cliente usa «Mensajes con el cliente».</div>';
}

/* Columna central: pestañas «Conversación con Legal IA» (solo lectura) y «Mensajes con el cliente» (canal aparte) */
function pintarCentro(){
  var cli = (bo.clientes || []).find(function(x){ return x.id === bo.cliAbierto; }) || (bo.chat && bo.chat.cliente) || {};
  if (!bo.chat && !cli.id){ $('boConv').innerHTML = '<div class="bo-vacio" style="margin:auto">Elige un cliente.</div>'; return; }
  var tab = bo.chat ? (bo.convTab || 'bot') : 'canal';
  var nMsg = cli.mensajes_sin_leer || 0;
  var cab = bo.chat
    ? '<div><h3>' + esc(bo.chat.titulo) + '</h3><span class="bo-nota" style="margin:0">' + esc(cli.nombre || '') + ' · ' + esc(bo.chat.fila.ref) + ' · ' + esc(bo.chat.fila.materia) + '</span></div>' +
      '<div style="display:flex;gap:6px">' + tagEstado(bo.chat.fila.estado) + '<button type="button" class="bo-btn sec" data-caso="' + esc(bo.chat.id) + '">Ficha del caso</button></div>'
    : '<div><h3>' + esc(cli.nombre || '') + '</h3><span class="bo-nota" style="margin:0">' + esc(cli.email || '') + '</span></div>';
  $('boConv').innerHTML = '<div class="bo-cab">' + cab + '</div>' +
    '<div class="t-Tabs bo-conv-tabs" role="tablist">' +
      (bo.chat ? '<button type="button" role="tab" aria-selected="' + (tab === 'bot') + '" class="' + (tab === 'bot' ? 'on' : '') + '" data-conv-tab="bot"><span class="fa fa-commenting-o" aria-hidden="true"></span> Conversación con Legal IA</button>' : '') +
      '<button type="button" role="tab" aria-selected="' + (tab === 'canal') + '" class="' + (tab === 'canal' ? 'on' : '') + '" data-conv-tab="canal"><span class="fa fa-envelope-o" aria-hidden="true"></span> Mensajes con el cliente' + (nMsg ? ' <em>' + nMsg + '</em>' : '') + '</button></div>' +
    '<div id="boConvVista"></div>';
  if (tab === 'bot'){
    $('boConvVista').outerHTML = pintarConversacion(bo.chat);
    var cuerpoEl = $('boConv').querySelector('.bo-conv-cuerpo'); if (cuerpoEl) cuerpoEl.scrollTop = cuerpoEl.scrollHeight;
  } else pintarCanalBO(cli.id);
}
function burbujaCanal(m, cliNombre){
  var mio = m.de === 'despacho';
  var ref = m.consulta_numero ? '<button type="button" class="canal-ref" data-conv="' + esc(m.consulta_id) + '" data-cli="' + esc(bo.cliAbierto || '') + '" title="' + esc(m.consulta_titulo || '') + '"><span class="fa fa-link" aria-hidden="true"></span> ' + esc(m.consulta_numero) + '</button>' : '';
  return '<div class="canal-msg ' + (mio ? 'de-despacho' : 'de-cliente') + '"><div class="canal-av" aria-hidden="true">' + esc(P.iniciales(mio ? (m.autor || 'D') : cliNombre)) + '</div>' +
    '<div class="canal-burbuja"><div class="canal-cab"><b>' + esc(mio ? (m.autor || 'Despacho') : cliNombre) + '</b><span>' + esc(fecha(m.ts)) + '</span>' + ref + '</div><div class="bo-txt">' + esc(m.texto) + '</div>' +
    (mio ? '<div class="canal-leido">' + (m.leido_cliente ? '<span class="fa fa-check" aria-hidden="true"></span> Leído' : 'Enviado') + '</div>' : '') + '</div></div>';
}
function pintarCanalBO(cid){
  var v = $('boConvVista'); if (!v) return;
  v.innerHTML = '<div class="bo-cargando"><span class="dots">Cargando mensajes</span></div>';
  api('/api/bo/clientes/' + cid + '/mensajes').then(function(d){
    var cli = (bo.clientes || []).find(function(x){ return x.id === cid; }) || {};
    if (cli.mensajes_sin_leer){ cli.mensajes_sin_leer = 0; pintarListaClientes(); refrescarContadores(); var em = $('boConv').querySelector('[data-conv-tab=canal] em'); if (em) em.remove(); }
    var sel = bo.chat ? bo.chat.id : '';
    v.innerHTML = '<div class="bo-conv-cuerpo canal-cuerpo">' + (d.mensajes.length ? d.mensajes.map(function(m){ return burbujaCanal(m, cli.nombre || 'Cliente'); }).join('')
        : '<div class="bo-vacio">Aún no hay mensajes con ' + esc(cli.nombre || 'este cliente') + '. Lo que escribas aquí le llegará a «Mensajes con el despacho», aparte de su conversación con Legal IA.</div>') + '</div>' +
      '<div class="bo-conv-pie canal-pie"><div class="canal-sobre"><label for="boMsgSobre">Sobre</label><select id="boMsgSobre" class="bo-sel"><option value="">(general)</option>' +
        d.consultas.map(function(c){ return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.numero + ' · ' + c.titulo.slice(0, 50)) + '</option>'; }).join('') + '</select></div>' +
      '<textarea id="boMsgCli" placeholder="Escribe al cliente…" aria-label="Mensaje al cliente"></textarea><button type="button" class="bo-btn" data-enviar-cli><span class="fa fa-paper-plane" aria-hidden="true"></span> Enviar</button></div>';
    var c = v.querySelector('.canal-cuerpo'); c.scrollTop = c.scrollHeight;
    if (bo.borradorMsg){ $('boMsgCli').value = bo.borradorMsg; bo.borradorMsg = ''; $('boMsgCli').focus(); }
  }).catch(function(e){ v.innerHTML = '<div class="bo-vacio">' + esc(e.message) + '</div>'; });
}
function usarEnMensaje(texto){
  bo.convTab = 'canal'; bo.borradorMsg = texto; pintarCentro();
}
function enviarAlCliente(){
  var t = $('boMsgCli'), texto = t.value.trim(); if (!texto) return;
  var sobre = $('boMsgSobre') ? $('boMsgSobre').value : '';
  t.disabled = true;
  var estado = (bo.chat && sobre === bo.chat.id && bo.chat.fila.estado === 'nueva') ? 'contactada' : null;
  api('/api/bo/clientes/' + bo.cliAbierto + '/mensajes', { method: 'POST', body: { texto: texto, consulta_id: sobre || null, estado: estado } })
    .then(function(){ P.toast('Mensaje enviado al cliente.'); refrescarContadores(); if (estado && bo.chat) bo.chat.fila.estado = 'contactada'; pintarCentro(); })
    .catch(function(e){ P.toast(e.message); t.disabled = false; });
}
function pintarPanelIA(c){
  var a = c.analisis && !c.analisis.error ? c.analisis : null, el = $('boCliIA');
  if (!a){
    el.innerHTML = '<div class="bo-card bo-pad"><h3>Análisis IA</h3><div class="bo-vacio" style="padding:14px 4px">Analiza la conversación para obtener la <b>extracción automática</b> de los datos del caso y el <b>análisis emocional</b> del cliente.</div>' +
      '<button type="button" class="bo-btn" style="width:100%" data-reanalizar>Analizar con IA</button></div>';
    return;
  }
  var e = a.emocional || {};
  el.innerHTML = (c.fila.analisis_desactualizado ? '<div class="bo-aviso">Hay mensajes nuevos desde el último análisis. <button type="button" class="acc-link" data-reanalizar>Reanalizar</button></div>' : '') +
    '<div class="bo-grid" style="margin:0"><div class="bo-card bo-pad"><h3>Extracción automática<button type="button" class="bo-btn sec bo-acc" data-reanalizar>Reanalizar</button></h3><div class="bo-info" style="margin-top:0">' +
      '<div><span>Materia</span><b>' + esc(a.materia || '—') + '</b></div><div><span>Área</span><b>' + esc(a.area || '—') + '</b></div>' +
      (a.extraccion || []).map(function(x){ return '<div><span>' + esc(x.campo) + '</span><b>' + esc(x.valor) + '</b></div>'; }).join('') +
      '<div><span>Interés</span><b>' + tagInteres(a.interes) + '</b></div><div><span>Complejidad</span><b>' + esc(a.complejidad || '—') + '</b></div></div></div>' +
    '<div class="bo-card bo-pad"><h3>Análisis emocional IA</h3><div>' + (e.emociones || []).map(function(x){ return '<span class="bo-emo">' + esc(x) + '</span>'; }).join('') + '</div>' +
      meter('Preocupación detectada', e.preocupacion, 'red', nivel(e.preocupacion) + ' · ' + e.preocupacion + ' %') +
      meter('Urgencia percibida', e.urgencia_percibida, 'gold', nivel(e.urgencia_percibida) + ' · ' + e.urgencia_percibida + ' %') +
      meter('Confianza en la conversación', e.confianza, 'green') +
      meter('Riesgo de abandono', e.riesgo_abandono, '', nivel(e.riesgo_abandono) + ' · ' + e.riesgo_abandono + ' %') +
      (e.conclusion ? '<div class="bo-conclusion"><b>Conclusión IA:</b> ' + esc(e.conclusion) + '</div>' : '') + '</div>' +
    (e.respuesta_recomendada ? '<div class="bo-card bo-pad"><h3>Respuesta recomendada · empatía controlada</h3><div class="bo-burbuja ia">«' + esc(e.respuesta_recomendada) + '»</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="bo-btn sec" data-usar-resp="' + esc(e.respuesta_recomendada) + '">Usar en el mensaje</button><button type="button" class="bo-btn sec" data-ver-insight>Ver en INSIGHT™</button></div></div>' : '') +
    '<p class="bo-nota">Análisis del ' + esc(fecha(a.generado)) + '' + '. Es una estimación de la IA para adaptar la atención; revísala con criterio profesional.</p></div>';
}

/* ---------- Informes y analytics ---------- */
function pintarAnalytics(){
  var el = $('bo-analytics'); cargando(el, 'Calculando métricas');
  Promise.all([api('/api/bo/analytics'), bo.resumen ? Promise.resolve(bo.resumen) : refrescarContadores()]).then(function(x){
    var a = x[0], r = x[1];
    var resp = a.respuestas || 0, bases = a.respaldo || {};
    var respaldadas = (bases.jurisprudencia || 0) + (bases.doctrina || 0) + (bases.parcial || 0);
    var pct = function(n){ return resp ? Math.round(100 * n / resp) : 0; };
    var barras = function(obj){ var tot = Object.keys(obj).reduce(function(t, k){ return t + obj[k]; }, 0) || 1;
      return Object.keys(obj).sort(function(p, q){ return obj[q] - obj[p]; }).map(function(k){ return '<div class="bo-barra"><div><span>' + esc(k) + '</span><b>' + Math.round(100 * obj[k] / tot) + ' %</b></div><div class="bo-meter gold"><i style="width:' + (100 * obj[k] / tot) + '%"></i></div></div>'; }).join('') || '<p class="bo-nota">Sin datos todavía.</p>'; };
    var mat = {}; (a.materias || []).forEach(function(m){ mat[m.materia] = m.n; });
    var recos = [];
    if (r.kpis.pendientes) recos.push(['Alta', 'Revisar las ' + r.kpis.pendientes + ' consultas pendientes de revisión.']);
    var al = {}; r.alertas.forEach(function(x){ al[x.tipo] = x.n; });
    if (al.plazos) recos.push(['Alta', 'Atender ' + al.plazos + ' casos con plazos en riesgo.']);
    if (al.sin_asignar) recos.push(['Alta', 'Asignar abogado a ' + al.sin_asignar + ' casos de interés alto.']);
    if (al.documentacion) recos.push(['Media', 'Solicitar la documentación pendiente en ' + al.documentacion + ' casos.']);
    if (al.sin_analizar) recos.push(['Media', 'Analizar ' + al.sin_analizar + ' conversaciones con la IA para priorizarlas.']);
    if (resp && pct(respaldadas) < 80) recos.push(['Media', 'Activar más fuentes de jurisprudencia: solo el ' + pct(respaldadas) + ' % de las respuestas tiene respaldo.']);
    recos.push(['Info', 'Activar el seguimiento automático de clientes recurrentes.']);
    var evo = r.evolucion, etq = evo.map(function(d){ return d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7); });
    el.innerHTML = '<div class="bo-grid g-kpis">' + kpi('📊', 'Respuestas generadas', resp, '<small>' + r.kpis.consultas_total + ' consultas</small>') +
        kpi('⏱', 'Tiempo medio de respuesta', a.tiempo_medio_s == null ? '—' : String(a.tiempo_medio_s).replace('.', ',') + ' s', '<small>mediana ' + (a.tiempo_mediana_s == null ? '—' : String(a.tiempo_mediana_s).replace('.', ',') + ' s') + '</small>') +
        kpi('⚖', 'Con respaldo jurisprudencial', pct(respaldadas) + ' %', '<small>' + respaldadas + ' de ' + resp + '</small>') +
        kpi('👤', 'Derivadas a abogado', a.derivadas_pct + ' %', '<small>derivadas o expediente</small>') +
        kpi('📄', 'Documentos analizados', a.documentos, '<small>aportados por clientes</small>') +
        kpi('⚡', 'Sin búsqueda nueva', a.sin_busqueda, '<small>reutilizan jurisprudencia</small>') + '</div>' +
      '<div class="bo-grid g-3"><div class="bo-card bo-pad bo-chart"><h3>Actividad del servicio (14 días)</h3><div class="bo-leyenda"><span><i style="background:#2d8cff"></i>Consultas nuevas</span><span><i style="background:#49d17d"></i>Preguntas de clientes</span></div>' +
          lineas([{ nombre: 'Consultas nuevas', datos: evo.map(function(d){ return d.consultas; }), color: '#2d8cff', area: true, fmt: function(v){ return v; } },
                  { nombre: 'Preguntas', datos: evo.map(function(d){ return d.mensajes; }), color: '#49d17d', fmt: function(v){ return v; } }], etq) +
          '<p class="bo-nota">La economía del servicio (ingresos, margen, equilibrio y uso de cuota) está en <a href="#" data-ir="economia">Dashboard</a>.</p></div>' +
        '<div class="bo-card bo-pad"><h3>Materias más consultadas</h3>' + barras(mat) + '<h3 style="margin-top:14px">Fuentes que respaldan las respuestas</h3>' + barras(a.fuentes || {}) + '</div>' +
        '<div class="bo-card bo-pad"><h3>Recomendaciones IA</h3>' + recos.map(function(x){ return '<div class="bo-reco"><span class="bo-prio ' + (x[0] === 'Alta' ? 't-red' : x[0] === 'Media' ? 't-orange' : 't-blue') + '">' + x[0] + '</span><span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div></div>' +
      '<div class="bo-card bo-pad"><h3>Calidad de las respuestas</h3>' + barras({ 'Respaldada por jurisprudencia': bases.jurisprudencia || 0, 'Criterios generales (doctrina)': bases.doctrina || 0, 'Respaldada en parte': bases.parcial || 0, 'Sin respaldo': bases.conocimiento_general || 0 }) + '</div>';
  }).catch(function(e){ el.innerHTML = '<div class="bo-card bo-vacio">' + esc(e.message) + '</div>'; });
}

/* ---------- LEGAL INSIGHT™ ---------- */
function pintarInsight(){
  var el = $('bo-insight'); cargando(el, 'Preparando INSIGHT');
  api('/api/bo/consultas').then(function(d){
    bo.consultas = d.consultas;
    var analizadas = d.consultas.filter(function(f){ return f.analizada; });
    if (!bo.insightId && analizadas.length) bo.insightId = analizadas[0].id;
    var selector = '<div class="bo-card bo-pad" style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>Conversación</b><select class="bo-sel" id="boInsSel" style="flex:1;min-width:220px" aria-label="Conversación a analizar">' +
      d.consultas.map(function(f){ return '<option value="' + esc(f.id) + '"' + (f.id === bo.insightId ? ' selected' : '') + '>' + esc(f.cliente.nombre + ' · ' + f.materia + ' · ' + f.titulo.slice(0, 50)) + (f.analizada ? '' : ' (sin analizar)') + '</option>'; }).join('') +
      '</select><button type="button" class="bo-btn" id="boInsAnalizar">Analizar / actualizar</button></div>';
    if (!d.consultas.length){ el.innerHTML = '<div class="bo-card bo-vacio">Aún no hay conversaciones que analizar.</div>'; return; }
    if (!bo.insightId) bo.insightId = d.consultas[0].id;
    el.innerHTML = selector + '<div id="boInsCuerpo"></div>';
    cargarInsight();
  });
}
function cargarInsight(){
  var cuerpo = $('boInsCuerpo'); cargando(cuerpo, 'Cargando');
  api('/api/bo/chats/' + bo.insightId).then(function(c){
    var a = c.analisis && !c.analisis.error ? c.analisis : null;
    if (!a){ cuerpo.innerHTML = '<div class="bo-card bo-vacio">Esta conversación aún no se ha analizado. Pulsa «Analizar / actualizar» para generar su INSIGHT™.</div>'; return; }
    var ins = a.insight || {}, e = a.emocional || {}, rd = ins.radar || {}, cli = c.cliente || {}, per = ins.perfil || {};
    var ejes = [['comprension', 'Comprensión jurídica'], ['confianza', 'Confianza'], ['colaboracion', 'Colaboración'], ['claridad', 'Claridad narrativa'],
                ['preparacion_doc', 'Preparación doc.'], ['urgencia', 'Urgencia'], ['abandono', 'Abandono'], ['estres', 'Estrés']];
    var R = 140, cx = 210, cy = 180;
    var punto = function(i, v){ var ang = -Math.PI / 2 + i * 2 * Math.PI / 8; return [cx + Math.cos(ang) * R * v / 100, cy + Math.sin(ang) * R * v / 100]; };
    var anillos = [100, 75, 50].map(function(v){ return '<polygon points="' + ejes.map(function(_, i){ return punto(i, v).join(','); }).join(' ') + '" fill="none" stroke="rgba(255,255,255,' + (v === 100 ? .12 : .08) + ')"/>'; }).join('');
    var radios = ejes.map(function(_, i){ var p = punto(i, 100); return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="rgba(255,255,255,.1)"/>'; }).join('');
    var forma = ejes.map(function(x, i){ return punto(i, rd[x[0]] || 0).map(function(n){ return n.toFixed(1); }).join(','); }).join(' ');
    var puntos = ejes.map(function(x, i){ var p = punto(i, rd[x[0]] || 0); return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4.5" fill="#f0cf7a"><title>' + esc(x[1] + ': ' + (rd[x[0]] || 0) + ' %') + '</title></circle>'; }).join('');
    var textos = ejes.map(function(x, i){ var p = punto(i, 122); return '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4).toFixed(1) + '" fill="#dbe8f6" font-size="11.5" text-anchor="middle">' + esc(x[1]) + '</text>'; }).join('');
    var radar = '<svg viewBox="0 0 420 360" role="img" aria-label="Gemelo cognitivo: ' + esc(ejes.map(function(x){ return x[1] + ' ' + (rd[x[0]] || 0) + ' %'; }).join(', ')) + '"><defs><radialGradient id="boRadarG" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#45c7e8" stop-opacity=".25"/><stop offset="100%" stop-color="#45c7e8" stop-opacity="0"/></radialGradient></defs>' +
      anillos + radios + '<polygon points="' + forma + '" fill="url(#boRadarG)" stroke="#45c7e8" stroke-width="2.5"/>' + puntos + textos + '</svg>';
    var color = ins.score >= 75 ? 'var(--green)' : ins.score >= 50 ? 'var(--gold)' : 'var(--red)';
    var indice = [['Comprensión jurídica', rd.comprension, 'green'], ['Ansiedad / presión emocional', e.estres, 'red'], ['Confianza en el proceso', e.confianza, ''],
                  ['Preparación documental', rd.preparacion_doc, 'green'], ['Urgencia objetiva', e.urgencia_objetiva, 'gold'], ['Urgencia percibida', e.urgencia_percibida, 'red'], ['Riesgo de abandono', e.riesgo_abandono, '']];
    $('boInsCuerpo').innerHTML =
      '<div class="bo-card bo-pad bo-hero"><div class="bo-hero-txt"><h3 class="bo-hero-tit"><span>LEGAL INSIGHT™</span> · Centro de inteligencia cognitiva</h3>' +
        '<p class="bo-hero-resumen">' + esc(a.resumen) + '</p><div class="bo-meta"><div><label>Ciudadano</label><b>' + esc(cli.nombre || '—') + '</b></div><div><label>Caso</label><b>' + esc(c.expediente ? c.expediente.titulo : c.fila.ref) + '</b></div>' +
        '<div><label>Materia</label><b>' + esc(a.materia || c.fila.materia) + '</b></div><div><label>Última interacción</label><b>' + esc(hace(c.actualizado)) + '</b></div></div></div>' +
      '<div class="bo-ring-wrap"><div class="bo-ring" style="background:conic-gradient(' + color + ' 0 ' + ins.score + '%, rgba(255,255,255,.08) ' + ins.score + '% 100%)" data-v="' + ins.score + '\n/100" role="img" aria-label="Insight score ' + ins.score + ' sobre 100"></div>' +
        '<div class="bo-ring-txt"><h3>INSIGHT SCORE™</h3><p class="bo-nota" style="margin:0">' + esc(ins.texto ? ins.texto.split('. ')[0] + '.' : '') + '</p><div class="bo-mini">' +
        '<div><label>Confianza IA</label><b>' + ins.confianza_ia + ' %</b></div><div><label>Madurez procesal</label><b>' + ins.madurez_procesal + ' %</b></div>' +
        '<div><label>Consistencia documental</label><b>' + ins.consistencia_documental + ' %</b></div><div><label>Preparación jurídica</label><b>' + ins.preparacion_juridica + ' %</b></div></div></div></div></div>' +
      '<div class="bo-grid g-3" style="grid-template-columns:.95fr 1.05fr .95fr"><div class="bo-card bo-pad bo-radar"><h3>Gemelo cognitivo jurídico</h3>' + radar + '</div>' +
        '<div class="bo-card bo-pad"><h3>Índice cognitivo jurídico</h3>' + indice.map(function(x){ return meter(x[0], x[1] || 0, x[2]); }).join('') + '</div>' +
        '<div class="bo-card bo-pad"><h3>Inteligencia explicable</h3>' + ((ins.explicable || []).map(function(x){ return '<div class="bo-expl"><div class="tick">✓</div><div><b>' + esc(x.senal) + '</b><small>' + esc(x.detalle) + '</small></div><span class="bo-tag ' + (x.pct >= 80 ? 't-green' : 't-blue') + '">' + x.pct + ' %</span></div>'; }).join('') || '<p class="bo-nota">Sin señales.</p>') + '</div></div>' +
      '<div class="bo-grid g-2"><div class="bo-pila"><div class="bo-card bo-pad"><h3>✦ Insight IA</h3><p style="color:#dbe8f6;line-height:1.62;font-size:13.5px;margin:0">' + esc(ins.texto || '') + '</p>' +
          (e.respuesta_recomendada ? '<div class="bo-conclusion"><b>Frase recomendada:</b> «' + esc(e.respuesta_recomendada) + '»</div>' : '') + '</div>' +
      '<div class="bo-card bo-pad"><h3>Evolución cognitiva del ciudadano</h3><div class="bo-timeline">' + ((ins.evolucion || []).map(function(x){ return '<div class="bo-paso"><small>' + esc(x.fecha) + '</small><b>' + esc(x.titulo) + '</b><span>' + esc(x.detalle) + '</span></div>'; }).join('') || '<p class="bo-nota">Sin evolución registrada.</p>') + '</div></div>' + '</div>' +
        '<div class="bo-card bo-pad"><h3>Perfil conversacional y estrategia</h3>' +
          [['Canal recomendado', per.canal], ['Tono recomendado', per.tono], ['Nivel técnico', per.nivel_tecnico], ['Frecuencia de seguimiento', per.frecuencia], ['Próxima acción', per.proxima_accion || a.proxima_accion], ['Responsable', (c.gestion || {}).asignado || 'Sin asignar']]
            .map(function(x){ return '<div class="bo-fila"><span>' + x[0] + '</span><b>' + esc(x[1] || '—') + '</b></div>'; }).join('') +
          '<div class="bo-mini" style="margin-top:12px"><div><label>Complejidad</label><b>' + esc(a.complejidad || '—') + '</b></div><div><label>Duración estimada</label><b>' + esc(ins.duracion_estimada || '—') + '</b></div>' +
          '<div><label>Probabilidad de recurso</label><b>' + ins.probabilidad_recurso + ' %</b></div><div><label>Abogado senior</label><b>' + esc(ins.abogado_senior || '—') + '</b></div></div></div></div>' +
      '<p class="bo-nota">Estimaciones de la IA a partir de la conversación y los documentos (' + esc(fecha(a.generado)) + '' + '). Sirven para adaptar la atención, no sustituyen el criterio profesional.</p>';
  });
}
$('bo-insight').addEventListener('change', function(e){ if (e.target.id === 'boInsSel'){ bo.insightId = e.target.value; cargarInsight(); } });
$('bo-insight').addEventListener('click', function(e){ var b = e.target.closest('#boInsAnalizar'); if (b) analizar(bo.insightId, b, function(){ pintarInsight(); }); });

/* ---------- Supervisión de la IA (APEX: página 50 · Informe interactivo + cajón de detalle) ---------- */
var VALID = { aceptada: ['Aceptada', 't-green'], corregida: ['Corregida', 't-orange'], rechazada: ['Rechazada', 't-red'], insuficiente: ['Fundamentación insuficiente', 't-purple'] };
var BASE_TXT = { jurisprudencia: ['Jurisprudencia', 't-green'], doctrina: ['Doctrina', 't-blue'], parcial: ['Parcial', 't-orange'], conocimiento_general: ['Sin respaldo', 't-red'] };
function tagValid(v){ var x = VALID[v]; return x ? '<span class="bo-tag ' + x[1] + '">' + x[0] + '</span>' : '<span class="bo-tag t-gray">Pendiente</span>'; }
function tagBase(b){ var x = BASE_TXT[b]; return x ? '<span class="bo-tag ' + x[1] + '">' + x[0] + '</span>' : '<span class="bo-tag t-gray">—</span>'; }
function tagEstadoEj(e){ var x = { OK: ['OK', 't-green'], ERROR: ['Error', 't-red'], DEGRADADO: ['Degradado', 't-orange'], SIN_RESPUESTA: ['Sin respuesta', 't-orange'] }[e] || [e || '—', 't-gray'];
  return '<span class="bo-tag ' + x[1] + '" title="' + (e === 'DEGRADADO' ? 'La IA o la fuente de jurisprudencia no respondieron; el cliente recibió un mensaje de contingencia' : '') + '">' + x[0] + '</span>'; }
function seg(ms){ return ms == null ? '—' : (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }
function metrica(label, valor, objetivo, ok){
  return '<div class="bo-card bo-kpi"><div class="bo-kpi-cab"><label>' + esc(label) + '</label><span class="bo-kicon ' + (ok == null ? 'neutro' : ok ? 'ok' : 'ko') + '" aria-hidden="true">' +
    (ok == null ? '<span class="fa fa-minus"></span>' : ok ? '<span class="fa fa-check"></span>' : '<span class="fa fa-exclamation"></span>') + '</span></div>' +
    '<strong>' + valor + '</strong><small class="' + (ok == null ? '' : ok ? 'sube' : 'baja') + '">' + esc(objetivo) + '</small></div>';
}
var SUP_FILTROS = [['', 'Todas'], ['pendiente', 'Sin validar'], ['aceptada', 'Aceptadas'], ['corregida', 'Corregidas'], ['rechazada', 'Rechazadas'], ['insuficiente', 'Insuficientes'], ['DEGRADADO', 'Degradadas'], ['ERROR', 'Con error']];
function pintarSupervision(){
  var el = $('bo-supervision'); cargando(el, 'Cargando las ejecuciones');
  api('/api/bo/supervision?estado=' + encodeURIComponent(bo.supFiltro || '') + '&q=' + encodeURIComponent(bo.supQ || '')).then(function(d){
    var m = d.metricas, f = d.filas;
    bo.supFilas = f;
    $('boCntSupervision').textContent = m.ejecuciones && m.validadas < m.ejecuciones ? (m.ejecuciones - m.validadas) : '';
    var h = '<div class="bo-grid g-kpis g-kpis7">' +
      metrica('Ejecuciones registradas', m.ejecuciones, 'con evidencia completa', null) +
      metrica('Flujo E2E sin error', m.e2e_ok_pct == null ? '—' : m.e2e_ok_pct + ' %', 'objetivo ≥ 95 %', m.e2e_ok_pct == null ? null : m.e2e_ok_pct >= 95) +
      metrica('Latencia p95', m.p95_s == null ? '—' : String(m.p95_s).replace('.', ',') + ' s', 'objetivo < 10 s (texto)', m.p95_s == null ? null : m.p95_s < 10) +
      metrica('Con evidencia jurídica', m.con_evidencia_pct == null ? '—' : m.con_evidencia_pct + ' %', 'respuestas respaldadas', null) +
      metrica('Aceptadas por abogado', m.aceptadas_pct == null ? '—' : m.aceptadas_pct + ' %', 'objetivo ≥ 80 % · ' + m.validadas + ' validadas', m.aceptadas_pct == null ? null : m.aceptadas_pct >= 80) +
      metrica('Citas no localizadas', m.citas_no_encontradas, 'en el texto de la resolución', m.citas_no_encontradas === 0) +
      metrica('Errores', m.errores, 'objetivo 0 Sev-1', m.errores === 0) + '</div>';
    h += '<div class="bo-card t-IRR-region"><div class="bo-cab"><h3>Ejecuciones de la IA</h3></div>' +
      '<div class="t-IRR-toolbar"><label class="t-IRR-search"><span class="fa fa-search" aria-hidden="true"></span><input type="search" id="supBuscar" value="' + esc(bo.supQ || '') + '" placeholder="Buscar: Nº de consulta, Correlation ID, cliente, texto…" aria-label="Buscar ejecuciones"></label>' +
      '<button type="button" class="t-Button" data-sup-ir><span class="fa fa-arrow-right" aria-hidden="true"></span> Ir</button>' +
      '<button type="button" class="t-Button" data-sup-csv><span class="fa fa-download" aria-hidden="true"></span> Descargar CSV</button></div>' +
      '<div class="bo-filtros t-IRR-filtros">' + SUP_FILTROS.map(function(x){ return '<button type="button" class="bo-chip' + ((bo.supFiltro || '') === x[0] ? ' on' : '') + '" data-sup-filtro="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (!f.length) h += '<div class="bo-vacio">No hay ejecuciones' + (bo.supFiltro || bo.supQ ? ' con ese filtro' : ' todavía. Cada respuesta de Legal IA deja aquí su evidencia') + '.</div>';
    else h += '<div class="bo-tabla-wrap"><table class="bo-tabla"><thead><tr><th>Fecha</th><th>Nº consulta</th><th>Cliente</th><th>Consulta</th><th>Respaldo</th><th>Evidencias</th><th>Tiempo</th><th>Estado</th><th>Validación</th></tr></thead><tbody>' +
      f.map(function(x){
        return '<tr data-evidencia="' + esc(x.correlation_id) + '" tabindex="0"><td>' + esc(fecha(x.timestamp)) + '</td><td><b>' + esc(x.case_id || '—') + '</b><br><small class="t-mono">' + esc((x.correlation_id || '').slice(0, 12)) + '…</small></td>' +
          '<td>' + esc(x.cliente) + '</td><td class="t-celda-larga"><b>' + esc(x.materia || '—') + '</b><br><small>' + esc(x.entrada) + '</small></td>' +
          '<td>' + tagBase(x.base) + (x.respaldo ? ' <span class="bo-tag t-orange" title="La fuente principal no aportó jurisprudencia y se consultó el CENDOJ">CENDOJ</span>' : '') + '</td>' +
          '<td>' + x.evidencias + ' / ' + x.fuentes + '</td><td>' + seg(x.ms_total) + '</td>' +
          '<td>' + tagEstadoEj(x.estado) + '</td>' +
          '<td>' + tagValid(x.validacion) + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="t-IRR-pagination">Filas 1 - ' + f.length + ' de ' + f.length + '</div>';
    h += '</div><p class="bo-nota">Cada ejecución guarda su <b>Evidence Pack</b> (entrada, perfil del caso, Top-K, evidencias, modelo, versión de prompts, salida, consumo, Case ID y Correlation ID) con huella SHA-256. En OCI se exportará al bucket protegido de auditoría.</p>';
    el.innerHTML = h;
  }).catch(function(e){ el.innerHTML = '<div class="bo-card bo-vacio">' + esc(e.message) + '</div>'; });
}
$('bo-supervision').addEventListener('click', function(e){
  var b;
  if ((b = e.target.closest('[data-sup-filtro]'))){ bo.supFiltro = b.dataset.supFiltro; pintarSupervision(); return; }
  if (e.target.closest('[data-sup-ir]')){ bo.supQ = $('supBuscar').value.trim(); pintarSupervision(); return; }
  if (e.target.closest('[data-sup-csv]')){
    csv('supervision_ia_legalia.csv', ['Fecha', 'Nº consulta', 'Correlation ID', 'Cliente', 'Materia', 'Consulta', 'Respaldo', 'Evidencias', 'Fragmentos', 'Tiempo (ms)', 'Llamadas IA', 'Estado', 'Validación'],
      (bo.supFilas || []).map(function(x){ return [x.timestamp, x.case_id, x.correlation_id, x.cliente, x.materia, x.entrada, x.base, x.evidencias, x.fuentes, x.ms_total, x.llamadas_ia, x.estado, x.validacion || 'pendiente']; }));
    return;
  }
});
$('bo-supervision').addEventListener('keydown', function(e){
  if (e.target.id === 'supBuscar' && e.key === 'Enter'){ bo.supQ = e.target.value.trim(); pintarSupervision(); return; }
  var tr = e.target.closest('tr[data-evidencia]');
  if (tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); abrirEvidencia(tr.dataset.evidencia); }
});
vBo.addEventListener('click', function(e){
  var t = e.target.closest('[data-evidencia]');
  if (t){ e.stopPropagation(); abrirEvidencia(t.dataset.evidencia); return; }
  if (e.target.closest('[data-cerrar-drawer]')) cerrarDrawer();
});
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !$('boDrawer').hidden) cerrarDrawer(); });

var drawerOrigen = null;
function abrirDrawer(titulo, html, opc){
  opc = opc || {};
  if ($('boDrawer').hidden) drawerOrigen = document.activeElement;
  $('boDrawerTit').textContent = titulo; $('boDrawerCuerpo').innerHTML = html;
  $('boDrawerPie').innerHTML = opc.pie || ''; $('boDrawerPie').hidden = !opc.pie;
  $('boDrawer').className = 't-Drawer' + (opc.clase ? ' ' + opc.clase : '');
  $('boDrawerCuerpo').scrollTop = 0;
  $('boDrawer').hidden = false; document.body.classList.add('t-drawer-abierto');
  setTimeout(function(){ var b = $('boDrawer').querySelector('.t-Dialog-header button'); if (b) b.focus(); }, 30);
}
function cerrarDrawer(){
  $('boDrawer').hidden = true; $('boDrawerPie').hidden = true; $('boDrawerPie').innerHTML = ''; document.body.classList.remove('t-drawer-abierto');
  if (drawerOrigen && drawerOrigen.focus) drawerOrigen.focus();
}
function filaInfo(k, v){ return '<div><span>' + esc(k) + '</span><b>' + v + '</b></div>'; }
function bloque(titulo, cuerpo){ return '<section class="t-Drawer-sec"><h3>' + esc(titulo) + '</h3>' + cuerpo + '</section>'; }
function lista(arr){ return (arr && arr.length) ? '<ul class="t-lista">' + arr.map(function(x){ return '<li>' + esc(typeof x === 'string' ? x : JSON.stringify(x)) + '</li>'; }).join('') + '</ul>' : '<p class="bo-nota">—</p>'; }
function abrirEvidencia(cid){
  abrirDrawer('Traza de la respuesta', '<div class="bo-cargando"><span class="dots">Cargando la evidencia</span></div>');
  api('/api/bo/supervision/' + encodeURIComponent(cid)).then(function(ev){
    var pc = ev.perfil_caso || {}, rec = ev.recuperacion || {}, sal = ev.salida || {}, tz = sal.trazabilidad || {}, mod = ev.modelo || {}, ver = ev.versiones || {}, con = ev.consumo || {};
    var h = '<div class="bo-info t-Drawer-cab">' +
      filaInfo('Nº de consulta (Case ID)', esc(ev.case_id || '—')) + filaInfo('Correlation ID', '<span class="t-mono">' + esc(ev.correlation_id) + '</span>') +
      filaInfo('Fecha', esc(fecha(ev.timestamp))) + filaInfo('Estado', tagEstadoEj(ev.estado)) +
      filaInfo('Validación', tagValid((ev.validacion || {}).resultado)) + '</div>';
    h += bloque('Entrada del cliente', '<div class="bo-burbuja">' + esc(ev.entrada || '') + '</div>' +
      ((ev.documentos || []).length ? '<p class="bo-nota">Documentos en el contexto: ' + esc(ev.documentos.map(function(d){ return d.nombre + (d.tipo ? ' (' + d.tipo + ')' : ''); }).join(', ')) + '</p>' : ''));
    h += bloque('Perfil del caso (' + esc(ver.version_perfil_caso || 'LCP') + ')',
      '<div class="bo-info">' + filaInfo('Materia', esc(pc.materia || '—')) + filaInfo('Jurisdicción', esc(pc.jurisdiccion || rec.jurisdiccion || '—')) + '</div>' +
      (pc.consulta_juridica ? '<div class="bo-burbuja ia">' + esc(pc.consulta_juridica) + '</div>' : '') +
      '<h4>Hechos relevantes</h4>' + lista(pc.hechos_relevantes) + '<h4>Cuestiones jurídicas</h4>' + lista(pc.cuestiones_juridicas) +
      ((pc.datos_que_faltan || []).length ? '<h4>Datos que faltan</h4>' + lista(pc.datos_que_faltan) : ''));
    var errs = rec.errores || {};
    h += bloque('Recuperación (' + esc(ver.version_recuperacion || 'RETRIEVAL') + ')',
      '<div class="bo-info">' + filaInfo('Fuente', esc((rec.fuentes || []).join(', ') || '—')) + filaInfo('Búsqueda nueva', rec.busqueda_realizada === false ? 'No (jurisprudencia ya consultada)' : 'Sí') +
      filaInfo('Resultados de la fuente', esc(rec.total == null ? '—' : rec.total)) + filaInfo('Resoluciones leídas', esc(rec.descargadas == null ? '—' : rec.descargadas)) +
      (rec.respaldo ? filaInfo('Último recurso', esc(rec.respaldo.usada) + ' · ' + esc(rec.respaldo.motivo)) : '') + '</div>' +
      (Object.keys(errs).length ? '<div class="bo-aviso">' + Object.keys(errs).map(function(k){ return '<b>' + esc(k) + ':</b> ' + esc(errs[k]); }).join('<br>') + '</div>' : '') +
      ((rec.intentos || []).length ? '<h4>Consultas enviadas</h4><ul class="t-lista">' + rec.intentos.map(function(i){ return '<li>' + esc(i.proveedor ? i.proveedor + ' · ' : '') + esc(i.query || i.roj || i.ecli || '') + (i.jurisdiccion ? ' · ' + esc(i.jurisdiccion) : '') + ' → ' + (i.error ? 'error' : (i.total || 0) + ' resultados') + '</li>'; }).join('') + '</ul>' : ''));
    var tk = ev.top_k || [];
    h += bloque('Top-K (' + tk.length + ' fragmentos)', tk.length ? '<div class="bo-tabla-wrap"><table class="bo-tabla compacta"><thead><tr><th>#</th><th>Resolución</th><th>Puntuación</th><th>Usada</th></tr></thead><tbody>' +
      tk.map(function(x, i){ return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(x.resolucion || '') + '</b><br><small>' + esc([x.organo, x.fecha].filter(Boolean).join(' · ')) + '</small></td><td>' + (x.score == null ? '—' : Number(x.score).toFixed(3)) + '</td><td>' + (x.usada ? '<span class="bo-tag t-green">Sí</span>' : '<span class="bo-tag t-gray">No</span>') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="bo-nota">Sin fragmentos recuperados.</p>');
    var evs = ev.evidencias || [];
    h += bloque('Conjunto de evidencias (' + evs.length + ')', evs.length ? evs.map(function(x){
      return '<div class="t-evidencia"><b>' + esc(x.resolucion || '') + '</b> ' + (x.cita_estado === 'literal' ? '<span class="bo-tag t-green">cita literal</span>' : x.cita_estado === 'parcial' ? '<span class="bo-tag t-orange">cita aproximada</span>' : x.cita_estado === 'no_encontrada' ? '<span class="bo-tag t-red">cita no localizada</span>' : '') +
        (x.aporta ? '<p>' + esc(x.aporta) + '</p>' : '') + (x.cita ? '<blockquote>«' + esc(x.cita) + '»</blockquote>' : '') + '</div>'; }).join('')
      : '<p class="bo-nota">La respuesta no se apoya en resoluciones concretas (orientación general).</p>');
    h += bloque('Salida', '<div class="bo-info">' + filaInfo('Base de la respuesta', tagBase(tz.base_respuesta)) + filaInfo('Citas literales / aproximadas / no localizadas',
      (tz.citas_literales || 0) + ' / ' + (tz.citas_parciales || 0) + ' / ' + (tz.citas_no_encontradas || 0)) + '</div>' +
      '<div class="bo-burbuja t-salida">' + esc(sal.texto || '(sin texto)') + '</div>' +
      ((sal.inconsistencias || []).length ? '<h4>Inconsistencias detectadas</h4>' + lista(sal.inconsistencias) : ''));
    var ms = con.ms || {};
    h += bloque('Modelo, versiones y consumo', '<div class="bo-info">' + filaInfo('Modelo', esc([mod.proveedor, mod.modelo].filter(Boolean).join(' · ') || '—')) +
      filaInfo('Prompts', esc(ver.version_prompts || '—')) + filaInfo('Tiempo total', seg(con.ms_total)) +
      Object.keys(ms).map(function(k){ return filaInfo('· ' + k.replace(/_/g, ' '), seg(ms[k])); }).join('') +
      filaInfo('Llamadas a la IA', esc(con.llamadas_ia == null ? '—' : con.llamadas_ia)) + filaInfo('Tamaño del prompt', esc((con.caracteres_prompt || 0).toLocaleString('es-ES')) + ' caracteres') +
      filaInfo('Huella SHA-256', '<span class="t-mono" title="' + esc(ev.integridad_sha256 || '') + '">' + esc((ev.integridad_sha256 || '').slice(0, 16)) + '…</span>') + '</div>' +
      (ev.error ? '<div class="bo-aviso"><b>Error:</b> ' + esc(ev.error.slice(-600)) + '</div>' : ''));
    var v = ev.validacion || {};
    h += bloque('Validación profesional', (v.resultado ? '<p class="bo-nota">' + tagValid(v.resultado) + ' por ' + esc(v.autor || '') + ' el ' + esc(fecha(v.fecha)) + (v.comentario ? ': «' + esc(v.comentario) + '»' : '') + '</p>' : '') +
      '<div class="t-validar" data-cid="' + esc(ev.correlation_id) + '">' +
      Object.keys(VALID).map(function(k){ return '<button type="button" class="t-Button' + (v.resultado === k ? ' t-Button--hot' : '') + '" data-validar="' + k + '">' + VALID[k][0] + '</button>'; }).join('') +
      '<textarea id="valComentario" placeholder="Comentario para el registro (opcional)" aria-label="Comentario de la validación">' + esc(v.comentario || '') + '</textarea></div>' +
      '<p class="bo-nota">«Error jurídico material»: un error u omisión que cambiaría la orientación, aplicaría normativa o jurisprudencia inaplicable o llevaría a una conclusión incorrecta. El estilo se registra como observación menor.</p>');
    if (ev.consulta_id) h += '<div class="t-Drawer-pie"><button type="button" class="t-Button" data-caso="' + esc(ev.consulta_id) + '"><span class="fa fa-folder-open-o" aria-hidden="true"></span> Abrir el caso</button></div>';
    $('boDrawerTit').textContent = 'Traza · ' + (ev.case_id || ev.correlation_id);
    $('boDrawerCuerpo').innerHTML = h;
  }).catch(function(e){ $('boDrawerCuerpo').innerHTML = '<div class="bo-vacio">' + esc(e.message) + '</div>'; });
}
$('boDrawer').addEventListener('click', function(e){
  var b = e.target.closest('[data-validar]');
  if (b){
    var cid = b.closest('.t-validar').dataset.cid;
    api('/api/bo/supervision/' + encodeURIComponent(cid) + '/validacion', { method: 'POST', body: { resultado: b.dataset.validar, comentario: ($('valComentario').value || '').trim() } })
      .then(function(){ P.toast('Validación registrada.'); abrirEvidencia(cid); if (bo.sec === 'supervision') pintarSupervision(); })
      .catch(function(err){ P.toast(err.message); });
    return;
  }
  if (e.target.closest('[data-caso]')){ cerrarDrawer(); }
});

/* ---------- Administración (APEX: página 90 · la configuración vive en legalia.conf / LEGALIA_PARAMETROS) ---------- */
var NOMBRE_SERV = { cendoj: 'CENDOJ (buscador público)', proveedorb: 'Base jurídica comercial B', proveedora: 'Base jurídica comercial A', gemini: 'Motor de IA' };
bo.pruebas = bo.pruebas || {};
function filaFuente(a, k){
  var f = (a.fuentes || {})[k] || {}, cat = (a.catalogo || {})[k] || {};
  var pr = bo.pruebas[k] || (a.pruebas || {})[k];          // la última prueba hecha desde esta pantalla manda
  var principal = a.fuente_juridica === k;
  var rol = principal ? '<span class="bo-tag t-green">Principal</span>'
    : k === 'cendoj' ? '<span class="bo-tag t-blue" title="Se consulta si la principal no aporta jurisprudencia aplicable">Último recurso</span>'
    : '<span class="bo-tag t-gray">Disponible</span>';
  var cred = k === 'cendoj' ? '<span class="bo-tag t-gray">No necesita</span>' : (f.credenciales ? '<span class="bo-tag t-green">Configuradas</span>' : '<span class="bo-tag t-orange">Faltan</span>');
  var ok = pr && pr.ok;
  var estado = '<div class="t-prueba' + (pr ? (pr.ok ? ' ok' : ' err') : '') + '" id="prueba-' + k + '" aria-live="polite">' + (pr ? esc(pr.mensaje) : 'Sin probar en esta sesión.') + '</div>';
  var tip = ok ? '' : ' title="Pulsa antes «Probar»: solo se puede usar una fuente con conexión correcta"';
  var acc = '<button type="button" class="t-Button" data-probar="' + k + '"><span class="fa fa-plug" aria-hidden="true"></span> Probar</button>' +
    (principal ? '' : '<button type="button" class="t-Button t-Button--hot" data-principal="' + k + '"' + (ok ? '' : ' disabled') + tip + '>Usar como principal</button>') +
    (principal || k === 'cendoj' ? '' : '<button type="button" class="t-Button t-Button--danger" data-quitar="' + k + '" title="Quitar esta fuente"><span class="fa fa-trash-o" aria-hidden="true"></span><span class="u-VisuallyHidden">Quitar</span></button>');
  return '<tr><td><b>' + esc(cat.nombre || NOMBRE_SERV[k]) + '</b><br><small>' + esc(cat.tipo || '') + '</small></td><td>' + rol + '</td><td>' + cred + '</td>' +
    '<td class="t-fuente-conexion">' + estado + '</td><td><div class="t-fuente-acc">' + acc + '</div></td></tr>';
}
function pintarAdministracion(){
  var el = $('bo-administracion'); cargando(el, 'Leyendo la configuración');
  api('/api/bo/administracion').then(function(a){
    bo.admin = a;
    var disp = a.disponibles || ['cendoj', 'proveedorb', 'proveedora'];
    var ver = a.versiones || {};
    var verWeb = (document.querySelector('meta[name="legalia-version"]') || {}).content || '';
    var h = (verWeb && a.version && a.version.indexOf(verWeb.split(' ')[0]) !== 0
      ? '<div class="t-Alert t-Alert--warning"><span class="fa fa-exclamation-triangle" aria-hidden="true"></span><div><b>El servidor sigue con la versión anterior (' + esc(a.version.split(' ')[0]) + ').</b> La pantalla es la ' + esc(verWeb.split(' ')[0]) + ': cierra la ventana del servidor y vuelve a arrancar <code>el servidor</code>; hasta entonces estos botones no funcionarán.</div></div>' : '') +
      '<div class="t-Alert t-Alert--info"><span class="fa fa-info-circle" aria-hidden="true"></span><div><b>Fuente de jurisprudencia.</b> Cada consulta se busca en la fuente <b>principal</b>. Si no aporta resoluciones aplicables, se consulta el <b>CENDOJ</b>; solo si tampoco hay, se responde sin respaldo jurisprudencial. Cada respuesta indica de qué fuente salió. Para elegir una fuente, su prueba de conexión debe ser correcta; el cambio se aplica al momento y queda en <code>legalia.conf</code>.</div></div>';
    h += '<div class="bo-card t-IRR-region"><div class="bo-cab"><h3>Fuentes de jurisprudencia</h3>' +
      '<button type="button" class="t-Button t-Button--hot" data-anadir-fuente title="Dar de alta una fuente o cambiar sus credenciales"><span class="fa fa-plus" aria-hidden="true"></span> Añadir fuente</button></div>' +
      '<div class="bo-tabla-wrap"><table class="bo-tabla t-fuentes"><thead><tr><th>Fuente</th><th>Uso</th><th>Credenciales</th><th>Conexión</th><th>Acciones</th></tr></thead><tbody>' +
      disp.map(function(k){ return filaFuente(a, k); }).join('') + '</tbody></table></div>' +
      '<p class="bo-nota" style="padding:0 16px 14px">Las resoluciones de fuentes comerciales no se guardan después de cada consulta. La traza de cada respuesta en «Supervisión de la IA» indica de qué fuente salió.</p></div>';
    h += '<div class="bo-grid g-2b">' +
      '<div class="bo-card bo-pad"><h3>Plataforma</h3><div class="bo-info">' + filaInfo('Entorno', '<span class="bo-tag t-gold">' + esc(a.entorno || '—') + '</span>') + filaInfo('Despacho', esc(a.despacho || '—')) +
        filaInfo('Versión', esc(a.version || '—')) + filaInfo('Motor de IA', esc([a.ia && a.ia.proveedor, a.ia && a.ia.modelo].filter(Boolean).join(' · ') || '—') + (a.ia_configurada ? '' : ' <span class="bo-tag t-orange">sin clave</span>')) +
        filaInfo('Prompts', esc(ver.version_prompts || '—')) + filaInfo('Perfil del caso', esc(ver.version_perfil_caso || '—')) + filaInfo('Recuperación', esc(ver.version_recuperacion || '—')) + '</div>' +
        '<div style="margin-top:12px"><button type="button" class="t-Button" data-probar="gemini"><span class="fa fa-plug" aria-hidden="true"></span> Probar el motor de IA</button><div class="t-prueba" id="prueba-gemini" aria-live="polite"></div></div></div>' +
      '<div class="bo-card bo-pad"><h3>Equivalencia en OCI</h3><div class="bo-info">' +
        filaInfo('Portal y backoffice', 'Oracle APEX + ORDS') + filaInfo('Datos y vectores', 'Autonomous Database 23ai · AI Vector Search') + filaInfo('IA generativa', 'OCI Generative AI · Cohere (eu-frankfurt-1)') +
        filaInfo('Documentos', 'Object Storage + Document Understanding') + filaInfo('Voz', 'OCI Speech STT (opcional)') + filaInfo('Secretos', 'OCI Vault') + filaInfo('Evidencias', 'Bucket legalia-audit-evidence (retención bloqueada)') + '</div></div></div>';
    el.innerHTML = h;
  }).catch(function(e){ el.innerHTML = '<div class="bo-card bo-vacio">' + esc(e.message) + '</div>'; });
}
function anadirFuente(){
  var a = bo.admin || {}, disp = a.disponibles || [], cat = a.catalogo || {};
  // Todo el catálogo: las que ya están se pueden volver a dar de alta para cambiar sus credenciales
  var opciones = Object.keys(cat).filter(function(k){ return k !== 'cendoj' || disp.indexOf('cendoj') < 0; });
  var nuevas = opciones.filter(function(k){ return disp.indexOf(k) < 0; });
  P.modal({ titulo: 'Añadir fuente de jurisprudencia', boton: 'Continuar',
    texto: nuevas.length ? 'Elige la fuente que quieres dar de alta.' : 'Todas las fuentes del catálogo están ya añadidas. Puedes elegir una para cambiar sus credenciales.',
    campos: [{ etiqueta: 'Fuente', tipo: 'select', valor: (nuevas[0] || opciones[0]),
      opciones: opciones.map(function(k){ return { valor: k, texto: cat[k].nombre + (disp.indexOf(k) >= 0 ? ' (ya añadida · cambiar credenciales)' : '') }; }) }] })
  .then(function(v){
    if (!v || !v[0]) return;
    var k = v[0], c = cat[k];
    var campos = c.campos.map(function(x){ return { etiqueta: x.etiqueta, valor: x.secreto ? '' : (x.defecto || ''), secreto: !!x.secreto,
      ayuda: x.secreto ? (((a.fuentes || {})[k] || {}).credenciales ? 'Déjalo vacío para mantener la actual' : 'Se guarda en el servidor y no se vuelve a mostrar') : '' }; });
    var paso2 = campos.length ? P.modal({ titulo: c.nombre, texto: 'Introduce las credenciales que te ha dado el proveedor. Al guardar se prueba la conexión.', boton: 'Guardar y probar', campos: campos })
      : Promise.resolve([]);
    return paso2.then(function(vals){
      if (!vals) return;
      var datos = {}; c.campos.forEach(function(x, i){ datos[x.clave] = vals[i]; });
      P.toast('Probando la conexión con ' + c.nombre + '…');
      return api('/api/bo/administracion/fuentes', { method: 'POST', body: { fuente: k, datos: datos } }).then(function(r){
        if (r.prueba) bo.pruebas[k] = { ok: !!r.prueba.ok, mensaje: r.prueba.mensaje || '' };
        P.toast(r.prueba && r.prueba.ok ? c.nombre + ': conexión correcta.' : c.nombre + ' guardada, pero la prueba falló. Revisa las credenciales.');
        pintarAdministracion();
      });
    });
  }).catch(function(e){ P.toast(e.message); });
}
$('bo-administracion').addEventListener('click', function(e){
  var b;
  if (e.target.closest('[data-anadir-fuente]')) return anadirFuente();
  if ((b = e.target.closest('[data-principal]'))){
    var k = b.dataset.principal, nom = ((bo.admin.catalogo || {})[k] || {}).nombre || k;
    P.modal({ titulo: 'Usar ' + nom + ' como fuente principal', texto: 'Se repetirá la prueba de conexión y, si es correcta, todas las consultas nuevas buscarán primero en ' + nom + '.', boton: 'Confirmar' }).then(function(ok){
      if (!ok) return;
      b.disabled = true;
      api('/api/bo/administracion/uso', { method: 'POST', body: { fuente: k, uso: 'principal' } })
        .then(function(){ P.toast(nom + ' es ahora la fuente principal.'); pintarAdministracion(); })
        .catch(function(err){ P.toast(/404|Not Found/i.test(err.message) ? 'El servidor no tiene esta función: reinícialo con el servidor.' : err.message); pintarAdministracion(); });
    });
    return;
  }
  if ((b = e.target.closest('[data-quitar]'))){
    var q = b.dataset.quitar, nq = ((bo.admin.catalogo || {})[q] || {}).nombre || q;
    P.modal({ titulo: 'Quitar ' + nq, texto: 'Dejará de estar disponible y se borrarán las credenciales guardadas desde aquí (las de config.env no se tocan).', boton: 'Quitar', peligro: true }).then(function(ok){
      if (!ok) return;
      api('/api/bo/administracion/fuentes/' + q, { method: 'DELETE' }).then(function(){ P.toast(nq + ' quitada.'); pintarAdministracion(); }).catch(function(err){ P.toast(err.message); });
    });
    return;
  }
  b = e.target.closest('[data-probar]'); if (!b) return;
  var kp = b.dataset.probar, out = $('prueba-' + kp);
  b.disabled = true; out.className = 't-prueba'; out.textContent = 'Probando…';
  api('/api/bo/administracion/probar/' + kp, { method: 'POST' }).then(function(r){
    out.className = 't-prueba ' + (r.ok ? 'ok' : 'err'); out.textContent = r.mensaje || (r.ok ? 'Correcto.' : 'Sin respuesta.');
    if (kp !== 'gemini'){
      bo.pruebas[kp] = { ok: !!r.ok, mensaje: r.mensaje || '' };
      var bp = document.querySelector('[data-principal="' + kp + '"]');      // se habilita sin repintar la tabla
      if (bp){ bp.disabled = !r.ok; bp.title = r.ok ? '' : 'La prueba de conexión no es correcta'; }
    }
  }).catch(function(err){ out.className = 't-prueba err'; out.textContent = err.message; }).then(function(){ b.disabled = false; });
});

/* ---------- Utilidades que comparte la pestaña Gestión (gestion.js) ---------- */
BO.util = { $: $, esc: esc, api: api, euros: euros, fecha: fecha, hace: hace, kpi: kpi, meter: meter, lineas: lineas, donut: donut,
  cargando: cargando, abrirDrawer: abrirDrawer, cerrarDrawer: cerrarDrawer, csv: csv, PALETA: PALETA, filaInfo: filaInfo };

/* ---------- Arranque ---------- */
if (Sesion.token){
  fetch(Sesion.base() + '/api/auth/yo', { headers: Sesion.cabeceras() }).then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d){ Sesion.guardarUsuario(d.usuario); Router.entrar(d.usuario); })
    .catch(function(e){ Sesion.borrar(); Router.login(/401/.test(e.message) ? 'Tu sesión ha caducado. Vuelve a entrar.' : ''); });
} else {
  Router.login();
}
})();
