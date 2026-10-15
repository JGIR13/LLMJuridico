/* Sesión de Legal IA: token del usuario (cliente o abogado) para todas las peticiones */
var Sesion = (function(){
  var LS_T = 'legalia_token', LS_U = 'legalia_sesion';
  var s = { token: null, usuario: null };
  function get(k){ try { return window.localStorage.getItem(k); } catch(e){ return null; } }
  function set(k, v){ try { if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch(e){} }
  s.token = get(LS_T);
  try { s.usuario = JSON.parse(get(LS_U) || 'null'); } catch(e){ s.usuario = null; }
  s.base = function(){
    var ep = get('legalia_endpoint');
    if (ep) return ep.replace(/\/api\/query\/?$/, '').replace(/\/$/, '');
    return /^https?:$/.test(location.protocol) ? location.origin : 'http://localhost:8000';
  };
  s.cabeceras = function(){ return s.token ? { 'Authorization': 'Bearer ' + s.token } : {}; };
  s.guardar = function(token, u){ s.token = token; s.usuario = u; set(LS_T, token); set(LS_U, JSON.stringify(u)); };
  s.guardarUsuario = function(u){ s.usuario = u; set(LS_U, JSON.stringify(u)); };
  s.borrar = function(){ s.token = null; s.usuario = null; set(LS_T, null); set(LS_U, null); };
  s.salir = function(){
    if (s.token) fetch(s.base() + '/api/auth/logout', { method: 'POST', headers: s.cabeceras() }).catch(function(){});
    s.borrar();
    if (window.Router) window.Router.login();
  };
  var avisada = false;
  s.caducada = function(){
    if (avisada) return;
    avisada = true;
    s.borrar();
    if (window.Router) window.Router.login('Tu sesión ha caducado o se cerró en otro sitio. Vuelve a entrar.');
    setTimeout(function(){ avisada = false; }, 1500);
  };
  return s;
})();
