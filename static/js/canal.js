/* =====================  Mensajes con el despacho (portal del cliente)  =====================
   Canal privado cliente <-> abogado, separado de la conversación con el asistente Legal IA.
   API: GET/POST /api/mensajes · GET /api/mensajes/estado                                       */
(function(){
'use strict';
var P = window.LIA, esc = P.esc, api = P.api;
function $(id){ return document.getElementById(id); }
var panel = $('canalPanel'), chat = $('chatPanel'), hilo = $('canalHilo');
var estado = { abierto: false, sinLeer: 0, sondeo: null, ultimo: 0 };

function esCliente(){ return Sesion.token && Sesion.usuario && Sesion.usuario.rol === 'cliente'; }
function fecha(ts){
  var d = new Date(ts); if (isNaN(d)) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '') + ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function pintarBadge(n){
  estado.sinLeer = n;
  [$('canalSinLeer'), $('canalSinLeerSb')].forEach(function(b){ b.textContent = n ? String(n) : ''; });
  $('canalHeader').title = n ? n + ' mensaje' + (n === 1 ? '' : 's') + ' nuevo' + (n === 1 ? '' : 's') + ' del despacho' : 'Mensajes con el despacho';
}
function consultar(){
  if (!esCliente()) return;
  api('/api/mensajes/estado').then(function(d){
    if (estado.abierto){      // con el hilo abierto, los mensajes nuevos aparecen directamente
      if (d.sin_leer) api('/api/mensajes').then(function(x){ if (estado.abierto){ pintar(x); pintarBadge(0); } });
      return;
    }
    if (d.sin_leer > estado.sinLeer && estado.ultimo) P.toast('Tienes un mensaje nuevo del despacho.');
    estado.ultimo = Date.now();
    pintarBadge(d.sin_leer || 0);
  }).catch(function(){});
}
function burbuja(m){
  var mio = m.de === 'cliente', u = Sesion.usuario || {};
  var ref = m.consulta_numero ? '<button type="button" class="canal-ref" data-abrir-consulta="' + esc(m.consulta_id) + '" title="Abrir la consulta: ' + esc(m.consulta_titulo || '') + '"><span class="fa fa-link" aria-hidden="true"></span> ' + esc(m.consulta_numero) + '</button>' : '';
  return '<div class="canal-msg ' + (mio ? 'de-cliente' : 'de-despacho') + '"><div class="canal-av" aria-hidden="true">' + esc(P.iniciales(mio ? (u.nombre || 'Yo') : (m.autor || 'D'))) + '</div>' +
    '<div class="canal-burbuja"><div class="canal-cab"><b>' + esc(mio ? 'Tú' : (m.autor || 'Despacho')) + '</b><span>' + esc(fecha(m.ts)) + '</span>' + ref + '</div>' +
    '<div class="canal-txt"></div></div></div>';
}
function pintar(d){
  var ms = d.mensajes || [];
  hilo.innerHTML = ms.length ? ms.map(burbuja).join('')
    : '<div class="canal-vacio"><span class="fa fa-comments-o" aria-hidden="true"></span><b>Aún no hay mensajes</b><p>Cuando un abogado revise tu consulta te escribirá aquí. También puedes escribirle tú: indica sobre qué consulta es para que la localice antes.</p></div>';
  // el texto se inserta como texto (nunca como HTML)
  var nodos = hilo.querySelectorAll('.canal-txt');
  ms.forEach(function(m, i){ nodos[i].textContent = m.texto; });
  hilo.scrollTop = hilo.scrollHeight;
  if (d.despacho) $('canalDespacho').textContent = d.despacho;
}
function rellenarSobre(){
  var sel = $('canalSobre'), act = P.actual().chatId, l = P.listado() || {};
  var cs = (l.chats || []).slice();
  (l.expedientes || []).forEach(function(e){ (e.chats || []).forEach(function(c){ cs.push(c); }); });
  var vistos = {};
  sel.innerHTML = '<option value="">(general)</option>' + cs.filter(function(c){ if (vistos[c.id]) return false; vistos[c.id] = 1; return true; })
    .map(function(c){ return '<option value="' + esc(c.id) + '"' + (c.id === act ? ' selected' : '') + '>' + esc((c.numero ? c.numero + ' · ' : '') + (c.titulo || '').slice(0, 60)) + '</option>'; }).join('');
}
function abrir(){
  if (!esCliente()) return;
  estado.abierto = true;
  chat.hidden = true; panel.hidden = false;
  document.body.classList.add('canal-abierto');
  P.cerrarSidebarMovil();
  rellenarSobre();
  hilo.innerHTML = '<div class="canal-vacio">Cargando…</div>';
  api('/api/mensajes').then(function(d){ pintar(d); pintarBadge(0); }).catch(function(e){ hilo.innerHTML = '<div class="canal-vacio">' + esc(e.message) + '</div>'; });
  setTimeout(function(){ $('canalInput').focus(); }, 50);
}
function cerrar(){
  if (!estado.abierto) return;
  estado.abierto = false;
  panel.hidden = true; chat.hidden = false;
  document.body.classList.remove('canal-abierto');
}
$('abrirCanal').addEventListener('click', abrir);
$('canalHeader').addEventListener('click', function(){ estado.abierto ? cerrar() : abrir(); });
$('canalVolver').addEventListener('click', cerrar);
// Abrir una consulta o empezar otra vuelve al asistente
document.getElementById('sbBody').addEventListener('click', function(e){ if (e.target.closest('[data-chat]') && !e.target.closest('[data-menu-chat]')) cerrar(); }, true);
$('nuevaConsulta').addEventListener('click', cerrar, true);
$('logoPortal').addEventListener('click', cerrar, true);
hilo.addEventListener('click', function(e){
  var b = e.target.closest('[data-abrir-consulta]'); if (!b) return;
  cerrar(); P.abrirChat(b.dataset.abrirConsulta);
});
$('canalForm').addEventListener('submit', function(e){
  e.preventDefault();
  var t = $('canalInput'), texto = t.value.trim(); if (!texto) return;
  var btn = this.querySelector('.send-btn'); btn.disabled = true;
  api('/api/mensajes', { method: 'POST', body: { texto: texto, consulta_id: $('canalSobre').value || null } })
    .then(function(d){ t.value = ''; pintar(d); P.toast('Mensaje enviado al despacho.'); })
    .catch(function(err){ P.toast(err.message); })
    .then(function(){ btn.disabled = false; t.focus(); });
});
$('canalInput').addEventListener('keydown', function(e){
  if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); $('canalForm').requestSubmit(); }
});

// Arranque al entrar como cliente y aviso de mensajes nuevos cada 30 s
var iniciar = P.iniciarCliente;
P.iniciarCliente = function(){
  cerrar(); iniciar(); pintarBadge(0); estado.ultimo = 0; consultar();
  if (!estado.sondeo) estado.sondeo = setInterval(consultar, 30000);
};
})();
