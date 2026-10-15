(function(){
'use strict';

/* ======================================================================
   CONTRATO ESPERADO CON EL BACKEND (modo "Conectado")
   ----------------------------------------------------------------------
   Backend: RAG-PROTOTIPO/server.py  (python server.py → http://localhost:8000)

   Request  →  POST {endpoint}
     { "query": "<texto del usuario>",
       "top_k": 5,
       "system_prompt": "<persona editable en Configuración>" }

   Response ←  200 OK
     { "answer": "<respuesta en HTML>",
       "answer_text": "<texto crudo del LLM, o null si no hay LLM>",
       "sources": [
         { "id": "STS_2919_2026_frag3", "title": "STS 2919/2026",
           "court": "Tribunal Supremo. Sala de lo Social",
           "date": "17/06/2026", "score": 0.61,          ← similitud coseno
           "snippet": "<extracto>", "text": "<fragmento completo>",
           "fragmento_num": 3, "url": "/sentencias/STS_2919_2026.pdf" }
       ],
       "prompt": "<prompt exacto enviado al LLM>",
       "llm": { "provider": "none|ollama|anthropic", "model": "...", "error": null },
       "timings_ms": { "retrieval": 120, "llm": 0 } }

   GET {endpoint sin /query}/health → estado (nº de sentencias, LLM activo…)
   ====================================================================== */

var DEFAULT_PERSONA = "Eres un asistente jurídico de Legal IA. Un ciudadano sin formación " +
  "legal te describe su problema en lenguaje cotidiano. Tu tarea:\n" +
  "1) Identifica la materia y los hechos relevantes.\n" +
  "2) Contrasta la consulta contra los fragmentos de jurisprudencia recuperados (CONTEXTO).\n" +
  "3) Responde en lenguaje claro y no técnico, como lo haría un abogado explicando el caso a un cliente.\n" +
  "4) Cita únicamente las sentencias del CONTEXTO que uses; nunca inventes referencias.\n" +
  "5) Si el CONTEXTO no cubre el caso, dilo explícitamente, pero da igualmente una orientación " +
  "general basada en la normativa española, sin inventar sentencias.\n" +
  "6) Si una resolución del CONTEXTO resuelve un caso con hechos idénticos a la consulta, responde " +
  "de forma definitiva según su fallo, sin lenguaje ambiguo ('éxito incierto', 'camino complejo').\n" +
  "7) Distingue siempre lo que alega una parte de lo que decide el Tribunal: el resultado lo marca el fallo.\n" +
  "8) Sé fiel al tono del Tribunal: si rechaza un argumento con contundencia, transmítelo igual, sin " +
  "empatizar con lo que el Tribunal desestimó.";

var LS = {
  endpoint: 'legalia_endpoint', topk: 'legalia_topk', mode: 'legalia_mode', persona: 'legalia_persona'
};

var els = {
  endpoint: document.getElementById('endpointInput'),
  topk: document.getElementById('topKInput'),
  persona: document.getElementById('personaInput'),
  modeMockBtn: document.getElementById('modeMockBtn'),
  modeLiveBtn: document.getElementById('modeLiveBtn'),
  modePill: document.getElementById('modePill'),
  modePillText: document.getElementById('modePillText'),
  connStatus: document.getElementById('connStatus'),
  testConnBtn: document.getElementById('testConnBtn'),
  configToggle: document.getElementById('configToggle'),
  configPanel: document.getElementById('configPanel'),
  advToggle: document.getElementById('advToggle'),
  advBody: document.getElementById('advBody'),
  advArrow: document.getElementById('advArrow'),
  inspectorToggle: document.getElementById('inspectorToggle'),
  inspector: document.getElementById('inspector'),
  thread: document.getElementById('thread'),
  emptyState: document.getElementById('emptyState'),
  form: document.getElementById('chatForm'),
  input: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn'),
  panelBody: document.getElementById('panelBody'),
  panelQ: document.getElementById('panelQ'),
  consola: document.getElementById('consola'),
  cBusqueda: document.getElementById('c-busqueda'),
  cRecuperacion: document.getElementById('c-recuperacion'),
  cPrompt: document.getElementById('c-prompt'),
  cRaw: document.getElementById('c-raw'),
  cTiempos: document.getElementById('c-tiempos'),
  cVivo: document.getElementById('c-vivo'),
  sidebar: document.getElementById('sidebar'),
  sbBody: document.getElementById('sbBody'),
  chatPanel: document.getElementById('chatPanel'),
  chatTitle: document.getElementById('chatTitle'),
  expChip: document.getElementById('expChip'),
  guardarExp: document.getElementById('guardarExp'),
  attachBtn: document.getElementById('attachBtn'),
  fileInput: document.getElementById('fileInput'),
  subidas: document.getElementById('subidas'),
  expBody: document.getElementById('expBody'),
  expCnt: document.getElementById('expCnt')
};

var store = {
  get: function(k){ try { return window.localStorage.getItem(k); } catch(e){ return null; } },
  set: function(k, v){ try { window.localStorage.setItem(k, v); } catch(e){} }
};

// Si la página la sirve server.py (http://localhost:8000), arranca ya conectada
// contra ese mismo servidor. Abierta desde disco (file://) arranca en simulado.
var SERVED_BY_BACKEND = /^https?:$/.test(location.protocol);
var DEFAULT_ENDPOINT = SERVED_BY_BACKEND ? location.origin + '/api/query' : 'http://localhost:8000/api/query';

var state = {
  mode: store.get(LS.mode) || (SERVED_BY_BACKEND ? 'live' : 'mock'),
  endpoint: store.get(LS.endpoint) || DEFAULT_ENDPOINT,
  topk: parseInt(store.get(LS.topk) || '5', 10),
  persona: store.get(LS.persona) || DEFAULT_PERSONA
};

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function healthUrl(){ return state.endpoint.replace(/\/query\/?$/, '/health'); }
function absoluteUrl(path){
  if (!path) return null;
  try { return new URL(path, state.endpoint).href; } catch(e){ return null; }
}

els.endpoint.value = state.endpoint;
els.topk.value = state.topk;
els.persona.value = state.persona;
els.advBody.style.display = 'none';

function applyMode(mode){
  state.mode = mode;
  store.set(LS.mode, mode);
  els.modeMockBtn.classList.toggle('active', mode === 'mock');
  els.modeLiveBtn.classList.toggle('active', mode === 'live');
  els.modePill.className = 'pill ' + mode;
  els.modePillText.textContent = mode === 'mock' ? 'Modo simulado' : 'Modo conectado';
  els.connStatus.className = 'conn-status';
  els.connStatus.textContent = mode === 'mock'
    ? 'Modo simulado: no se llama a ningún backend, se usan 8 sentencias de ejemplo embebidas en este fichero.'
    : 'Modo conectado: Legal IA usa el servidor ' + state.endpoint.replace(/\/api\/query\/?$/, '') + '. Las claves y fuentes se configuran abajo.';
}
applyMode(state.mode);

els.modeMockBtn.addEventListener('click', function(){ applyMode('mock'); });
els.modeLiveBtn.addEventListener('click', function(){ applyMode('live'); });
els.endpoint.addEventListener('change', function(){ state.endpoint = els.endpoint.value.trim() || DEFAULT_ENDPOINT; els.endpoint.value = state.endpoint; store.set(LS.endpoint, state.endpoint); applyMode(state.mode); });
els.topk.addEventListener('change', function(){ state.topk = Math.min(15, Math.max(1, parseInt(els.topk.value,10) || 5)); els.topk.value = state.topk; store.set(LS.topk, String(state.topk)); });
els.persona.addEventListener('change', function(){ state.persona = els.persona.value; store.set(LS.persona, state.persona); });

els.configToggle.addEventListener('click', function(){
  els.configPanel.classList.toggle('open');
  els.configToggle.classList.toggle('active');
});
els.advToggle.addEventListener('click', function(){
  var open = els.advBody.style.display !== 'none';
  els.advBody.style.display = open ? 'none' : 'block';
  els.advArrow.textContent = open ? '▾' : '▴';
});
els.inspectorToggle.addEventListener('click', function(){
  els.inspector.classList.toggle('hidden');
  els.inspectorToggle.classList.toggle('active');
});

/* Consola técnica: desplegable inferior, redimensionable y maximizable */
function setConsola(open){
  els.consola.classList.toggle('open', open);
  els.consola.setAttribute('aria-hidden', open ? 'false' : 'true');
  document.getElementById('consolaToggle').classList.toggle('active', open);
  document.getElementById('consolaHandle').style.display = open ? 'none' : '';
  store.set('legalia_consola', open ? '1' : '0');
}
function selectCtab(name){
  document.querySelectorAll('.ctab').forEach(function(t){
    var on = t.dataset.ctab === name;
    t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.cpanel').forEach(function(p){ p.classList.toggle('active', p.id === 'c-' + name); });
  store.set('legalia_ctab', name);
}
function alturaConsola(px){
  var max = window.innerHeight - 40;
  px = Math.max(140, Math.min(max, px));
  els.consola.style.height = px + 'px';
  return px;
}
document.querySelectorAll('.ctab').forEach(function(t){ t.addEventListener('click', function(){ selectCtab(t.dataset.ctab); }); });
document.getElementById('consolaToggle').addEventListener('click', function(){ setConsola(!els.consola.classList.contains('open')); });
document.getElementById('consolaHandle').addEventListener('click', function(){ setConsola(true); });
document.getElementById('consolaClose').addEventListener('click', function(){ setConsola(false); });
document.getElementById('consolaMax').addEventListener('click', function(){
  var max = els.consola.classList.toggle('max');
  if (max){ els.consola.dataset.prev = els.consola.style.height || ''; els.consola.style.height = ''; }
  else els.consola.style.height = els.consola.dataset.prev || '';
});
(function(){
  var tir = document.getElementById('consolaTirador'), arrastrando = false;
  tir.addEventListener('pointerdown', function(e){
    arrastrando = true; tir.setPointerCapture(e.pointerId);
    els.consola.classList.remove('max'); els.consola.classList.add('sin-anim');
    e.preventDefault();
  });
  tir.addEventListener('pointermove', function(e){ if (arrastrando) alturaConsola(window.innerHeight - e.clientY); });
  tir.addEventListener('pointerup', function(){
    if (!arrastrando) return;
    arrastrando = false; els.consola.classList.remove('sin-anim');
    store.set('legalia_consola_h', String(parseInt(els.consola.style.height, 10) || ''));
  });
  tir.addEventListener('dblclick', function(){ document.getElementById('consolaMax').click(); });
  tir.tabIndex = 0;
  tir.addEventListener('keydown', function(e){   // accesible con teclado: flechas arriba/abajo
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    var h = els.consola.getBoundingClientRect().height + (e.key === 'ArrowUp' ? 40 : -40);
    store.set('legalia_consola_h', String(alturaConsola(h)));
  });
  var h = parseInt(store.get('legalia_consola_h') || '', 10);
  if (h) alturaConsola(h);
})();
document.addEventListener('keydown', function(e){
  if (e.ctrlKey && e.altKey && (e.key === 'c' || e.key === 'C')){ e.preventDefault(); setConsola(!els.consola.classList.contains('open')); }
  if (e.key === 'Escape' && els.consola.classList.contains('open') && !document.querySelector('.modal-fondo')) setConsola(false);
});
setConsola(store.get('legalia_consola') === '1');
selectCtab(store.get('legalia_ctab') || 'vivo');

els.testConnBtn.addEventListener('click', function(){
  els.connStatus.className = 'conn-status';
  els.connStatus.textContent = 'Probando conexión con ' + healthUrl() + ' …';
  fetch(healthUrl()).then(function(res){
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function(h){
    var llm = h.llm || {};
    var llmTxt = (!llm.provider || llm.provider === 'none')
      ? 'sin LLM (solo recuperación)'
      : llm.provider + (llm.model ? ' / ' + llm.model : '');
    els.connStatus.className = 'conn-status ok';
    var fuenteTxt = h.fuente === 'cendoj'
      ? 'Fuente: CENDOJ en vivo (' + (h.cendoj && h.cendoj.ok ? 'servicio activo' : 'servicio NO disponible') + ') · ' + h.sentencias + ' resoluciones en caché'
      : h.sentencias + ' sentencias · ' + h.fragmentos + ' fragmentos';
    els.connStatus.className = 'conn-status ' + (h.fuente === 'cendoj' && !(h.cendoj && h.cendoj.ok) ? 'err' : 'ok');
    els.connStatus.textContent = 'Conexión correcta · ' + fuenteTxt + ' · LLM: ' + llmTxt +
      (h.embeddings_normalizados === false ? ' · Aviso: base creada con el ingest antiguo, conviene re-ejecutar ingest.py' : '');
  }).catch(function(err){
    els.connStatus.className = 'conn-status err';
    els.connStatus.textContent = 'No se pudo conectar (' + err.message + '). Revisa que el backend esté levantado y acepte CORS.';
  });
});

/* -----------------------  Base de sentencias de ejemplo (modo simulado)  ----------------------- */
var MOCK_DB = [
  { id:'STS-1452-2021', title:'STS 1452/2021', court:'Tribunal Supremo, Sala de lo Social', date:'14/05/2021',
    kw:['despido','carta','escrito','improcedente','notificacion','verbal'],
    snippet:'La ausencia de comunicación escrita del despido, con expresión de los hechos que lo motivan, determina por sí sola la improcedencia salvo prueba en contrario del empleador.' },
  { id:'SAP-MAD-220-2022', title:'SAP Madrid 220/2022', court:'Audiencia Provincial de Madrid', date:'02/03/2022',
    kw:['despido','carga','prueba','empleador','disciplinario'],
    snippet:'La carga de acreditar la causa disciplinaria del despido corresponde íntegramente a la empresa; la mera alegación genérica no es suficiente.' },
  { id:'STS-645-2020', title:'STS 645/2020', court:'Tribunal Supremo, Sala Primera', date:'20/11/2020',
    kw:['arrendamiento','alquiler','renta','subida','vivienda','actualizacion'],
    snippet:'La actualización de la renta arrendaticia fuera de los índices legalmente previstos y sin pacto expreso carece de eficacia frente al arrendatario.' },
  { id:'SAP-BCN-88-2019', title:'SAP Barcelona 88/2019', court:'Audiencia Provincial de Barcelona', date:'15/02/2019',
    kw:['arrendamiento','alquiler','desahucio','renta','notificacion'],
    snippet:'La subida de renta debe notificarse con la antelación y forma legalmente exigidas; su incumplimiento impide reclamar la diferencia.' },
  { id:'STS-310-2018', title:'STS 310/2018', court:'Tribunal Supremo, Sala Primera', date:'08/06/2018',
    kw:['compraventa','vehiculo','coche','garantia','vicio','defecto','averia'],
    snippet:'La aparición de una avería grave en los primeros días tras la entrega hace presumir que el defecto era preexistente, correspondiendo al vendedor probar lo contrario.' },
  { id:'SAP-VAL-142-2020', title:'SAP Valencia 142/2020', court:'Audiencia Provincial de Valencia', date:'19/09/2020',
    kw:['compraventa','vehiculo','segunda mano','garantia','reparacion'],
    snippet:'En la compraventa entre particulares de vehículos de segunda mano, la garantía legal de conformidad es exigible salvo pacto expreso y visible en contrario.' },
  { id:'STS-90-2019', title:'STS 90/2019', court:'Tribunal Supremo, Sala de lo Civil', date:'11/02/2019',
    kw:['herencia','legitima','testamento','heredero'],
    snippet:'La preterición no intencional de un legitimario da lugar a la anulación de la institución de heredero en cuanto perjudique su legítima.' },
  { id:'STSJ-MAD-77-2021', title:'STSJ Madrid 77/2021', court:'Tribunal Superior de Justicia de Madrid', date:'23/04/2021',
    kw:['laboral','ere','indemnizacion','despido colectivo'],
    snippet:'La falta de causa económica acreditada documentalmente en el despido colectivo determina su nulidad, no solo su improcedencia.' }
];

function normalize(s){
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function retrieveMock(query, topK){
  var q = normalize(query);
  var scored = MOCK_DB.map(function(doc){
    var hits = doc.kw.filter(function(k){ return q.indexOf(normalize(k)) !== -1; }).length;
    var base = hits > 0 ? 0.62 + hits * 0.09 : 0.30 + Math.random() * 0.15;
    var jitter = (Math.random() - 0.5) * 0.03;
    var score = Math.max(0.28, Math.min(0.97, base + jitter));
    return Object.assign({score: score}, doc);
  });
  scored.sort(function(a,b){ return b.score - a.score; });
  return scored.slice(0, topK);
}

function buildPrompt(query, fragments){
  var ctx = fragments.map(function(f, i){
    return '[' + (i+1) + '] ' + f.title + ' — ' + f.court + ' (' + f.date + ')\n"' + f.snippet + '"';
  }).join('\n\n');
  return state.persona + '\n\n' +
    '--- CONTEXTO RECUPERADO (jurisprudencia, top ' + fragments.length + ') ---\n' + ctx + '\n' +
    '--- FIN CONTEXTO ---\n\n' +
    'CONSULTA DEL USUARIO:\n' + query;
}

function composeMockAnswer(query, fragments){
  var relevant = fragments.filter(function(f){ return f.score >= 0.6; });
  if (!relevant.length){
    return '<p>Con la información disponible en la base de sentencias de prueba no encuentro jurisprudencia claramente aplicable a tu caso. Esto es solo una simulación local — con la base real de 50 sentencias la cobertura será mayor.</p>';
  }
  var lead = relevant[0];
  var html = '<p>Por lo que describes, tu situación se parece a casos donde los tribunales han resuelto lo siguiente: ' + lead.snippet.toLowerCase().charAt(0).toUpperCase() + lead.snippet.slice(1).toLowerCase().replace(/\.$/,'') + '.</p>';
  if (relevant.length > 1){
    html += '<p>Además, ' + relevant[1].title + ' refuerza este criterio en un supuesto similar.</p>';
  }
  html += '<p><em>Simulación local — respuesta generada por reglas simples, no por un modelo real.</em></p>';
  return html;
}

/* -----------------------  Render del chat  ----------------------- */
function showThread(){ els.emptyState.style.display = 'none'; }

function citeChip(f){
  var tip = esc([f.court, f.date].filter(Boolean).join(' · '));
  if (f.n != null)   // resolución citada en la respuesta: abre su tarjeta en «Fuentes»
    return '<button type="button" class="cite-chip" data-n="' + esc(f.n) + '" title="' + tip + ' · ver en Fuentes">' + esc(f.title) + '</button>';
  var url = absoluteUrl(f.url);
  return url
    ? '<a class="cite-chip" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + tip + ' · abrir la resolución">' + esc(f.title) + ' ↗</a>'
    : '<span class="cite-chip" title="' + tip + '">' + esc(f.title) + '</span>';
}

// Un chip por sentencia aunque se hayan recuperado varios fragmentos suyos.
function uniqueByTitle(fragments){
  var seen = {};
  return fragments.filter(function(f){
    if (seen[f.title]) return false;
    seen[f.title] = true;
    return true;
  });
}

function addUserMsg(text){
  showThread();
  var row = document.createElement('div');
  row.className = 'msg user';
  row.innerHTML = '<div class="avatar user">' + esc(iniciales(usuario.nombre)) + '</div><div class="bubble"></div>';
  row.querySelector('.bubble').textContent = text;
  els.thread.appendChild(row);
  scrollBottom();
  return row;
}

// Fase legible a partir de las líneas que va escribiendo el servidor
function faseDesdeLineas(lineas){
  var fase = '', sinBuscar = false;
  (lineas || []).forEach(function(l){
    if (/Búsqueda de jurisprudencia DESACTIVADA/.test(l)){ sinBuscar = true; fase = 'Repasando la jurisprudencia ya consultada'; }
    if (sinBuscar && /\[Gemini\].*enviando/.test(l)) fase = 'Redactando la respuesta';
    if (/Reformulaci|Contexto:/.test(l)) fase = 'Entendiendo tu consulta';
    if (/\[(CENDOJ|Base comercial B|Base comercial A)\].*(Búsqueda|búsqueda|resultados)/.test(l)) fase = 'Buscando resoluciones de los tribunales';
    if (/candidatos|Reordenados/.test(l)) fase = 'Comparando las resoluciones encontradas';
    if (/Selección por el modelo/.test(l)) fase = 'Eligiendo las resoluciones más parecidas a tu caso';
    if (/fragmentos|Lectura e indexado/.test(l)) fase = 'Leyendo las resoluciones elegidas';
    if (/Lectura e indexado/.test(l)) fase = 'Redactando la respuesta';
    if (/saturado|sin cuota/.test(l)) fase = 'Hay mucha demanda; seguimos con tu respuesta';
    if (/Segunda pasada|sin respaldo teniendo/.test(l)) fase = 'Revisando que la respuesta se apoye en las resoluciones';
    if (/Respuesta lista/.test(l)) fase = 'Respuesta lista';
  });
  return fase;
}

function addTyping(){
  var row = document.createElement('div');
  row.className = 'msg bot';
  row.innerHTML = '<div class="avatar bot">P</div><div class="typing-wrap"><div class="typing"><span></span><span></span><span></span></div>' +
    '<div class="typing-status" role="status" aria-live="polite"></div></div>';
  els.thread.appendChild(row);
  scrollBottom();
  // Contador visible: una consulta al CENDOJ + Gemini puede tardar 1-3 minutos.
  var t0 = Date.now(), status = row.querySelector('.typing-status');
  row._lineas = [];
  function tick(){
    var s = Math.round((Date.now() - t0) / 1000);
    var fase = state.mode === 'mock' ? '' : (row._fase || faseDesdeLineas(row._lineas) ||
      (!state.buscar ? 'Preparando la respuesta' : s < 10 ? 'Entendiendo tu consulta' : s < 60 ? 'Buscando y leyendo resoluciones de los tribunales' : 'Redactando la respuesta'));
    if (s > 150 && fase !== 'Respuesta lista') fase += ' (está tardando más de lo normal)';
    status.textContent = fase ? fase + '… ' + s + ' s' : '';
  }
  tick();
  row._timer = window.setInterval(tick, 1000);
  row._tick = tick;
  return row;
}

// Cada pregunta/respuesta guarda sus propias fuentes, prompt y JSON,
// para que el inspector muestre siempre las de la respuesta seleccionada.
var turns = [];

function alertasRespuesta(raw){
  if (!raw) return '';
  var h = '';
  var inc = raw.inconsistencias || [];
  if (inc.length)
    h += '<div class="resp-alerta incons" role="note"><span class="resp-sec-title">Hay datos que no cuadran</span><ul>' +
      inc.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  var docs = raw.documentacion_solicitada || [];
  if (docs.length)
    h += '<div class="resp-alerta docs" role="note"><span class="resp-sec-title">Para afinar la respuesta, aporta si puedes:</span>' +
      docs.map(function(d){
        return '<div class="pedir"><div>' + esc(d.documento) + (d.motivo ? '<small>' + esc(d.motivo) + '</small>' : '') + '</div>' +
          (state.mode === 'live' ? '<button type="button" class="btn-sec adjuntar">Adjuntar</button>' : '') + '</div>';
      }).join('') + '</div>';
  return h;
}

function addBotMsg(html, fragments, turnIdx, footInfo){
  var row = document.createElement('div');
  row.className = 'msg bot';
  var cites = (fragments && fragments.length)
    ? '<div class="cites"><span class="cites-label">Ver en Fuentes:</span>' + uniqueByTitle(fragments).map(citeChip).join('') + '</div>' : '';
  var ya = {}; (fragments || []).forEach(function(f){ ya[f.title] = 1; });
  var conc = [];
  (fragments || []).forEach(function(f){ (f.concordantes || []).forEach(function(c){ if (!ya[c.title]){ ya[c.title] = 1; conc.push(c); } }); });
  if (conc.length)
    cites += '<div class="cites"><span class="cites-label">Misma doctrina:</span>' + conc.map(citeChip).join('') + '</div>';
  var foot = '', alertas = '';
  if (turnIdx != null){
    row.dataset.turn = turnIdx;
    var raw = turns[turnIdx] && turns[turnIdx].raw;
    alertas = alertasRespuesta(raw);
    var t = raw && raw.timings_ms;
    var NOMBRES = { reformulacion: 'reformulación', cendoj_busqueda: 'búsqueda CENDOJ', cendoj_descarga: 'descarga CENDOJ',
                    retrieval: 'búsqueda local', llm: 'respuesta del modelo' };
    var desglose = t ? Object.keys(t).map(function(k){ return (NOMBRES[k] || k) + ': ' + (t[k] / 1000).toFixed(1).replace('.', ',') + ' s'; }).join(' · ') : '';
    var b = raw && raw.busqueda, badge = '';
    if (b) badge = b.realizada ? '<span class="busq-badge" title="Se buscó jurisprudencia nueva para esta pregunta"><span class="fa fa-balance-scale" aria-hidden="true"></span> Con jurisprudencia</span>'
      : '<span class="busq-badge reuso" title="Búsqueda desactivada: se usó la jurisprudencia ya consultada en esta conversación">Sin búsqueda nueva' +
        (b.previas_usadas ? ' · ' + b.previas_usadas + (b.previas_usadas === 1 ? ' resolución ya consultada' : ' resoluciones ya consultadas') : '') + '</span>';
    var ref = raw && raw.case_id ? '<span class="ref-consulta" title="Referencia para el despacho">' + esc(raw.case_id) + '</span>' : '';
    foot = '<div class="bubble-foot"><span>' + badge + ref + '</span>' +
      '<button type="button" class="src-btn">Ver fuentes</button></div>';
  }
  row.innerHTML = '<div class="avatar bot">P</div><div class="bubble">' + html + alertas + cites + foot + '</div>';
  var btn = row.querySelector('.src-btn');
  if (btn) btn.addEventListener('click', function(){ showTurn(turnIdx); abrirPanel('fuentes'); });
  els.thread.appendChild(row);
  scrollBottom();
  return row;
}

function scrollBottom(){ els.thread.scrollTop = els.thread.scrollHeight; }

function shortQ(q){ return '«' + (q.length > 120 ? q.slice(0, 120) + '…' : q) + '»'; }

function queryHeader(turnIdx){
  var t = turns[turnIdx];
  var q = t.query.length > 140 ? t.query.slice(0, 140) + '…' : t.query;
  return '<div class="insp-query"><b>Pregunta ' + (turnIdx + 1) + ':</b> «' + esc(q) + '»</div>';
}

function showTurn(turnIdx){
  var t = turns[turnIdx];
  if (!t) return;
  document.querySelectorAll('.msg.bot.active').forEach(function(r){ r.classList.remove('active'); });
  var row = els.thread.querySelector('.msg.bot[data-turn="' + turnIdx + '"]');
  if (row) row.classList.add('active');
  renderInspector(t.fragments, t.prompt, t.raw, turnIdx);
}

function showPendingInspector(turnIdx){
  document.querySelectorAll('.msg.bot.active').forEach(function(r){ r.classList.remove('active'); });
  var head = queryHeader(turnIdx);
  els.panelQ.textContent = shortQ(turns[turnIdx].query);
  els.panelBody.innerHTML = '<div class="inspector-empty"><span class="dots">Buscando resoluciones judiciales para tu consulta</span><br>' +
    'Aquí aparecerán las resoluciones en las que se apoye la respuesta.</div>';
  var TXT = {
    cBusqueda: 'La consulta reformulada, las búsquedas enviadas al CENDOJ y los candidatos encontrados',
    cRecuperacion: 'Los fragmentos de las resoluciones que se pasan al modelo, con su puntuación',
    cPrompt: 'El prompt completo que se envía al modelo',
    cRaw: 'El JSON completo que devuelve el servidor',
    cTiempos: 'El tiempo de cada fase y el modelo que ha respondido'
  };
  Object.keys(TXT).forEach(function(k){
    els[k].innerHTML = head + '<div class="placeholder"><span class="dots">Consulta en curso</span><br>' + TXT[k] +
      ' se mostrará aquí al terminar. Mientras tanto, sigue el progreso en directo en la pestaña <button type="button" class="link-ctab" data-ir="vivo">Consola</button>.</div>';
  });
  els.cVivo.innerHTML = head + '<pre class="vivo" aria-live="off"><span class="placeholder dots">Esperando las primeras líneas del servidor</span></pre>';
}

// Consola en vivo: colorea las líneas por origen
function pintarLineas(lineas){
  if (!lineas || !lineas.length) return '';
  return lineas.map(function(l){
    var cls = /ERROR|Error|error|falló|\[AVISO\]/.test(l) ? 'l-err' : /^\[CENDOJ\]|\[CENDOJ\]/.test(l) ? 'l-cendoj'
      : /\[Gemini\]/.test(l) ? 'l-gemini' : /\[Legal IA\]|\[Documentos\]/.test(l) ? 'l-par' : '';
    return '<span class="' + cls + '">' + esc(l) + '</span>';
  }).join('\n');
}
function renderVivo(cabecera, lineas, enCurso){
  var pre = els.cVivo.querySelector('pre.vivo');
  if (!pre){
    els.cVivo.innerHTML = (cabecera || '') + '<pre class="vivo"></pre>';
    pre = els.cVivo.querySelector('pre.vivo');
  }
  var abajo = els.cVivo.scrollHeight - els.cVivo.scrollTop - els.cVivo.clientHeight < 40;
  pre.innerHTML = lineas && lineas.length ? pintarLineas(lineas) + (enCurso ? '\n<span class="placeholder dots">en curso</span>' : '')
    : '<span class="placeholder' + (enCurso ? ' dots' : '') + '">' + (enCurso ? 'Esperando las primeras líneas del servidor'
      : 'No hay registro en directo de esta respuesta (se cargó del historial). El detalle completo está en los ficheros de registros/.') + '</span>';
  if (abajo) els.cVivo.scrollTop = els.cVivo.scrollHeight;
}

function fmtScore(x){ return typeof x === 'number' ? x.toFixed(2).replace('.', ',') : '—'; }

function fragMeta(f){
  var meta = [f.court, f.date, f.seccion].filter(Boolean);
  if (f.fragmento_num != null) meta.push('fragmento ' + (f.total_fragmentos ? (f.fragmento_num + 1) + ' de ' + f.total_fragmentos : f.fragmento_num));
  return meta.join(' · ');
}

// Texto con la cita subrayada; si ventana>0, solo un trozo alrededor de ella.
function markedText(f, ventana){
  var t = f.text || f.snippet || '';
  if (f.cita_inicio == null || f.cita_fin == null) return esc(ventana ? (f.snippet || t) : t);
  var a = f.cita_inicio, b = f.cita_fin, ini = 0, fin = t.length;
  if (ventana){
    ini = Math.max(0, a - ventana); fin = Math.min(t.length, b + ventana);
    while (ini > 0 && /\S/.test(t.charAt(ini - 1))) ini--;
    while (fin < t.length && /\S/.test(t.charAt(fin))) fin++;
  }
  return (ini > 0 ? '…' : '') + esc(t.slice(ini, a)) + '<mark>' + esc(t.slice(a, b)) + '</mark>' +
    esc(t.slice(b, fin)) + (fin < t.length ? '…' : '');
}

function whyRetrieved(f){
  if (f.motivo === 'referencia') return 'Recuperada porque la pregunta cita esta resolución por su número.';
  var como = f.via === 'ambas' ? 'Encontrado por significado y por términos'
    : f.via === 'términos' ? 'Encontrado por coincidencia de términos'
    : 'Encontrado por significado';
  var det = [];
  if (typeof f.score === 'number'){
    var sim = 'similitud semántica ' + fmtScore(f.score) + (f.relevancia ? ' (' + f.relevancia + ')' : '');
    if (f.via_semantica || f.via) sim += ' con ' + ((f.via_semantica || f.via) === 'consulta jurídica' ? 'la consulta jurídica' : 'tu pregunta');
    det.push(sim);
  }
  if (f.puesto_semantico) det.push('puesto ' + f.puesto_semantico + ' por significado');
  if (f.puesto_terminos) det.push('puesto ' + f.puesto_terminos + ' por términos');
  return como + (det.length ? ': ' + det.join(' · ') : '') + '.';
}

function fragCard(f, turnIdx, traced){
  var url = absoluteUrl(f.url);
  var used = traced && f.usada;
  var head = '<div class="frag-head"><span class="frag-title">' +
    (f.n != null ? '<span class="nbadge">' + f.n + '</span>' : '') + esc(f.title) + '</span>' +
    (f.motivo === 'referencia' ? '<span class="frag-score">cita directa</span>'
      : '<span class="frag-score" title="Similitud coseno">' + fmtScore(f.score) +
        (f.relevancia ? '<span class="rel ' + f.relevancia + '">' + f.relevancia + '</span>' : '') + '</span>') +
    '</div>';
  var body = '<div class="frag-meta">' + esc(fragMeta(f)) + '</div>';
  if (f.de_cache_previa)
    body += '<div class="vbadge" style="margin:0 0 6px">Consultada en una pregunta anterior</div>';
  if (f.solo_resumen)
    body += '<div class="vbadge aprox" style="margin:0 0 6px">Solo el resumen de la resolución (no se pudo leer el texto completo)</div>';
  if (f.resume_alegaciones)
    body += '<div class="vbadge aprox" style="margin:0 0 6px">Este pasaje recoge lo que alega una parte, no lo que decide el Tribunal</div>';

  if (traced){
    body += '<div class="insp-label">Por qué se recuperó</div><div class="why">' + esc(whyRetrieved(f)) + '</div>';
    var juridicos = f.terminos_coincidentes || [];
    var vistos = {}; juridicos.forEach(function(t){ vistos[t.toLowerCase()] = 1; });
    var palabras = (f.palabras_clave || []).filter(function(w){ return !vistos[w.toLowerCase()]; });
    if (juridicos.length || palabras.length)
      body += '<div class="pill-row" title="Dorado: términos jurídicos de la reformulación · gris: palabras de la consulta presentes en el fragmento">' +
        juridicos.map(function(t){ return '<span class="tag hit">' + esc(t) + '</span>'; }).join('') +
        palabras.map(function(t){ return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>';
  }
  if (used){
    var COINC = { identica: ['ok', 'Caso idéntico: la respuesta sigue su fallo'],
                  analoga: ['aprox', 'Caso análogo, con diferencias'],
                  doctrina: ['', 'Aporta doctrina general'] };
    if (f.coincidencia && COINC[f.coincidencia])
      body += '<div class="insp-label">Coincidencia con el caso</div><span class="vbadge ' + COINC[f.coincidencia][0] + '">' + COINC[f.coincidencia][1] + '</span>';
    body += '<div class="insp-label">Qué aporta a la respuesta</div><div class="aporta">' +
      esc(f.aporta || 'Citada en la respuesta, sin explicación del modelo.') + '</div>';
    if (f.cita){
      var dondeCita = f.cita_en_fallo ? 'en el fallo de la resolución' : 'en el fragmento';
      var badge = f.cita_estado === 'literal' ? '<span class="vbadge ok">✓ Cita literal verificada ' + dondeCita + '</span>'
        : f.cita_estado === 'parcial' ? '<span class="vbadge aprox">≈ Cita aproximada: coincide en parte ' + dondeCita + '</span>'
        : '<span class="vbadge ko">⚠ La frase citada no aparece en el fragmento (posible paráfrasis)</span>';
      body += '<div class="insp-label">Pasaje en el que se apoya</div>' +
        (f.cita_estado === 'no_encontrada'
          ? '<div class="claimed">«' + esc(f.cita) + '»</div>'
          : '<div class="pasaje">' + (f.cita_en_fallo ? '«' + esc(f.cita) + '»' : markedText(f, 220)) + '</div>') + badge;
    }
  } else {
    body += '<div class="frag-snippet">' + esc(f.snippet) + '</div>';
  }
  if (f.concordantes && f.concordantes.length){
    body += '<div class="insp-label">Misma doctrina en</div><div class="pill-row" title="Resoluciones de la base con un pasaje casi idéntico a este fragmento">' +
      f.concordantes.map(function(c){
        var u = absoluteUrl(c.url), txt = esc(c.title) + ' · ' + fmtScore(c.sim);
        return u ? '<a class="tag hit" style="text-decoration:none" href="' + esc(u) + '" target="_blank" rel="noopener">' + txt + ' ↗</a>'
                 : '<span class="tag hit">' + txt + '</span>';
      }).join('') + '</div>';
  }
  if (f.fallo)
    body += '<details><summary>Ver fallo de la resolución</summary><div class="frag-full">' + esc(f.fallo) + '</div></details>';
  if (f.text && f.text !== f.snippet)
    body += '<details><summary>Ver fragmento completo</summary><div class="frag-full">' + markedText(f, 0) + '</div></details>';
  if (url) body += '<a class="frag-link" href="' + esc(url) + '" target="_blank" rel="noopener">' +
    'Leer la resolución completa ↗</a>';

  var id = (turnIdx != null && f.n != null) ? ' id="tec-' + turnIdx + '-' + f.n + '"' : '';
  return '<div class="frag' + (traced ? (used ? ' used' : ' unused') : '') + '"' + id + '>' + head + body + '</div>';
}

function cendojBlock(c){
  return '';   // detalle técnico de la búsqueda: solo en Supervisión de la IA (backoffice)
  if (!c) return '';
  var h = '<div class="insp-block"><div class="insp-label">Búsqueda de jurisprudencia · ' + esc((c.fuentes || ['CENDOJ']).join(' + ')) + '</div>';
  var ef = c.errores_fuentes || {};
  Object.keys(ef).forEach(function(k){ h += '<div class="missing"><b>' + esc(k) + ':</b> ' + esc(ef[k]) + '</div>'; });
  if (c.error) return h + '<div class="missing"><b>Error:</b> ' + esc(c.error) + '</div>' +
    (c.de_cache_previa ? '<div class="why"><b>Caché del CENDOJ:</b> ' + c.de_cache_previa + ' fragmentos de resoluciones descargadas en consultas anteriores.</div>' : '') + '</div>';
  var intentos = (c.intentos || []).map(function(i){
    var q = i.query ? '«' + i.query + '»' : (i.roj ? 'ROJ ' + i.roj : 'ECLI ' + (i.ecli || ''));
    return '<li>' + (i.proveedor ? '<b>' + esc(i.proveedor) + '</b> ' : '') + esc(q) + (i.jurisdiccion ? ' · ' + esc(i.jurisdiccion) : '') + (i.ambito ? ' · ' + esc(i.ambito) : '') +
      (i.orden ? ' · por ' + esc(i.orden) : '') + ' → ' + (i.error ? 'error' : (i.total || 0) + ' resultados') + '</li>';
  }).join('');
  h += '<div class="insp-label">' + (c.cita_directa ? 'Búsqueda por referencia' : 'Consultas enviadas') + '</div><ul>' + intentos + '</ul>';
  if ((c.resultados || []).length){
    h += '<div class="insp-label">Resoluciones (' + c.descargadas + ' descargadas · ' + c.en_cache + ' de la caché' +
      (c.solo_resumen ? ' · ' + c.solo_resumen + ' solo resumen' : '') + ')</div>' +
      (c.reordenado ? '<div class="why">' + (c.avanzada ? 'Búsqueda por relevancia en el CENDOJ (toda la jurisdicción y Tribunal Supremo); después se han ordenado' : 'El CENDOJ ordena por fecha; se han reordenado') + ' por lo que se parece su resumen a tu consulta y se han leído las primeras.</div>' : '') + '<ul>' +
      c.resultados.map(function(r){
        var t = esc(r.roj || r.titulo || r.id) + (r.fecha ? ' · ' + esc(r.fecha) : '');
        var link = r.url ? '<a class="frag-link" style="margin:0" href="' + esc(r.url) + '" target="_blank" rel="noopener">' + t + ' ↗</a>' : t;
        var af = (r.ambito === 'TS' ? ' <span class="claimed">· Supremo</span>' : '') +
          ((r.afinidad != null) ? ' <span class="claimed">· afinidad ' + Math.round(r.afinidad * 100) + ' %</span>' : '');
        var mot = r.motivo_llm ? '<div class="why" style="margin:2px 0 4px">Elegida por el modelo: ' + esc(r.motivo_llm) + '</div>' : '';
        return '<li>' + link + (r.proveedor && r.proveedor !== 'CENDOJ' ? ' <span class="claimed">· ' + esc(r.proveedor) + '</span>' : '') + af + ' <span class="claimed">— ' + esc(r.estado) + '</span>' + mot + '</li>';
      }).join('') + '</ul>';
  } else {
    h += '<div class="why">El CENDOJ no devolvió resultados.</div>';
  }
  if (c.de_cache_previa) h += '<div class="why"><b>Caché del CENDOJ:</b> ' + c.de_cache_previa + ' fragmentos proceden de resoluciones descargadas del CENDOJ en consultas anteriores (' + (c.cache_total || 0) + ' en total).</div>';
  if (c.locales) h += '<div class="why"><b>Base local del despacho:</b> ' + c.locales + ' fragmentos de resoluciones propias entran también en el contexto.</div>';
  var ms = (c.ms_busqueda || 0) + (c.ms_descarga || 0);
  return h + '<div class="why">Tiempo de búsqueda: ' + (ms / 1000).toFixed(1).replace('.', ',') + ' s</div></div>';
}

function consultaBlock(c){
  if (!c) return '';
  if (!c.consulta_juridica){
    return '<div class="insp-block"><div class="insp-label">Consulta interpretada</div><div class="why">Sin reformular: ' +
      esc(c.error || 'no disponible') + '.</div></div>';
  }
  var h = '<div class="insp-block"><div class="insp-label">' +
    'Cómo hemos entendido tu consulta</div>' +
    (c.local ? '<div class="missing">Interpretación simplificada de tu consulta.</div>' : '') +
    '<p class="legal-q">' + esc(c.consulta_juridica) + '</p>';
  var pills = [];
  if (c.materia) pills.push('<span class="tag materia">' + esc(c.materia) + '</span>');
  if (pills.length) h += '<div class="pill-row">' + pills.join('') + '</div>';
  if (c.necesidad_usuario) h += '<div class="insp-label">Lo que necesita el usuario</div><div class="why">' + esc(c.necesidad_usuario) + '</div>';
  function list(title, arr){ return (arr && arr.length) ? '<div class="insp-label">' + title + '</div><ul>' + arr.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  h += list('Hechos relevantes', c.hechos_relevantes) + list('Cuestiones jurídicas', c.cuestiones_juridicas);
  if (c.terminos_busqueda && c.terminos_busqueda.length)
    h += '<div class="insp-label">Términos jurídicos buscados</div><div class="pill-row">' +
      c.terminos_busqueda.map(function(t){ return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>';
  if (c.datos_que_faltan && c.datos_que_faltan.length)
    h += '<div class="missing"><b>Faltaría saber:</b> ' + esc(c.datos_que_faltan.join(' · ')) + '</div>';
  return h + '</div>';
}

var COINC_TXT = { identica: 'Mismo caso que el tuyo', analoga: 'Caso parecido, con diferencias', doctrina: 'Criterio general aplicable' };
var RESPALDO = {
  jurisprudencia: ['Respaldada por resoluciones judiciales', 'Todo lo que afirma la respuesta se apoya en las resoluciones de abajo.'],
  doctrina: ['Respaldada por criterios generales de los tribunales', 'No hay casos con tus mismos hechos; se aplican criterios de las resoluciones de abajo.'],
  parcial: ['Respaldada en parte', 'El bloque «Lo que dicen los tribunales» se apoya en estas resoluciones; la «Orientación general», no.'],
  conocimiento_general: ['Sin respaldo en resoluciones', 'No se ha encontrado jurisprudencia aplicable: la respuesta es orientación general.']
};

function fuenteCard(f, turnIdx){
  var url = absoluteUrl(f.url);
  var meta = [f.court, f.date].filter(Boolean).join(', ');
  var h = '<div class="fuente-top"><span class="nbadge">' + f.n + '</span><span class="fuente-title">' + esc(f.title) + '</span></div>' +
    '<div class="fuente-meta">' + esc(meta) + '</div>';
  if (f.previa) h += '<span class="fuente-previa">Consultada en una respuesta anterior' + (f._consultada ? ' (' + esc(f._consultada) + ')' : '') + '</span> ';
  if (f.coincidencia && COINC_TXT[f.coincidencia]) h += '<span class="fuente-coinc ' + f.coincidencia + '">' + COINC_TXT[f.coincidencia] + '</span>';
  if (f.aporta) h += '<div class="fuente-aporta">' + esc(f.aporta) + '</div>';
  if (f.cita && f.cita_estado !== 'no_encontrada'){
    h += '<div class="fuente-cita">«' + esc(f.cita) + '»</div>' +
      (f.cita_estado === 'literal' ? '<span class="vbadge ok">Texto literal de la resolución' + (f.cita_en_fallo ? ' (de su fallo)' : '') + '</span>'
        : '<span class="vbadge aprox">Cita aproximada al texto de la resolución</span>');
  }
  if (f.resume_alegaciones) h += '<div class="vbadge aprox">Este pasaje recoge lo que alegaba una de las partes, no la decisión del tribunal.</div>';
  var links = '';
  if (f.fallo) links += '<details><summary>Qué decidió el tribunal</summary><div class="frag-full">' + esc(f.fallo) + '</div></details>';
  if (url) links += '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + (f.origen === 'externa' || f.origen === 'cendoj' || f.origen === 'proveedorb' || f.origen === 'proveedora' ? 'Leer la resolución completa' : 'Abrir el PDF') + ' ↗</a>';
  if (links) h += '<div class="fuente-links">' + links + '</div>';
  return '<article class="fuente" id="frag-' + turnIdx + '-' + f.n + '">' + h + '</article>';
}

// Panel derecho: lo que ve el usuario final
function renderFuentes(fragments, raw, turnIdx){
  var t = turns[turnIdx];
  els.panelQ.textContent = t ? shortQ(t.query) : '';
  var traced = !!(raw && raw.trazabilidad && raw.answer_text);
  var h = '';
  if (traced){
    var base = raw.trazabilidad.base_respuesta || 'conocimiento_general';
    var r = RESPALDO[base] || RESPALDO.conocimiento_general;
    h += '<div class="respaldo ' + base + '"><span class="respaldo-dot"></span><div><b>' + r[0] + '</b><span>' + r[1] + '</span></div></div>';
  }
  var cu = raw && raw.contexto_usado;
  if (cu && (cu.documentos || cu.consultas_previas)){
    var p = [];
    if (cu.documentos) p.push(cu.documentos + (cu.documentos === 1 ? ' documento' : ' documentos') + ' del expediente');
    if (cu.consultas_previas) p.push(cu.consultas_previas + (cu.consultas_previas === 1 ? ' mensaje anterior' : ' mensajes anteriores') + ' de la conversación');
    h += '<div class="ctx-usado">Se han tenido en cuenta ' + esc(p.join(' y ')) + '.</div>';
  }
  var c = raw && raw.consulta;
  if (c && c.consulta_juridica){
    h += '<div class="entendido"><h3>Cómo hemos entendido tu consulta</h3><p class="legal-q">' + esc(c.consulta_juridica) + '</p>' +
      (c.materia ? '<div class="pill-row"><span class="tag materia">' + esc(c.materia) + '</span></div>' : '');
    if (c.datos_que_faltan && c.datos_que_faltan.length)
      h += '<div class="afinar">Para afinar la respuesta nos ayudaría saber:<ul>' +
        c.datos_que_faltan.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    h += '</div>';
  }
  if (traced){
    var usadas = fragments.filter(function(f){ return f.usada; });
    // Una tarjeta por resolución (si se usaron varios pasajes de la misma, la primera)
    var vistas = {}, tarjetas = [];
    usadas.forEach(function(f){ if (!vistas[f.sentencia_id || f.title]){ vistas[f.sentencia_id || f.title] = 1; tarjetas.push(f); } });
    h += '<h3 class="fuentes-h">Resoluciones en las que se apoya</h3>' + (tarjetas.length
      ? tarjetas.map(function(f){ return fuenteCard(f, turnIdx); }).join('')
      : '<div class="inspector-empty" style="padding:12px 4px">Ninguna de las resoluciones consultadas era aplicable a tu caso.</div>');
    var otras = [], vo = {};
    fragments.forEach(function(f){ var k = f.sentencia_id || f.title; if (!vistas[k] && !vo[k]){ vo[k] = 1; otras.push(f); } });
    var cRes = (raw.cendoj && raw.cendoj.resultados) || [];
    if (otras.length || cRes.length){
      h += '<details class="otras"><summary>Otras resoluciones consultadas (' + (otras.length || cRes.length) + ')</summary><ul>' +
        (otras.length ? otras : cRes.slice(0, 12)).map(function(f){
          var u = absoluteUrl(f.url), name = esc(f.title || f.roj || f.id), when = esc(f.court ? f.court + ', ' + (f.date || '') : (f.fecha || ''));
          return '<li>' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + name + '</a>' : name) + (when ? ' · ' + when : '') + '</li>';
        }).join('') + '</ul></details>';
    }
  } else if (fragments.length){
    h += '<h3 class="fuentes-h">Resoluciones encontradas</h3>' + fragments.map(function(f){
      return '<article class="fuente"><div class="fuente-top"><span class="fuente-title">' + esc(f.title) + '</span></div>' +
        '<div class="fuente-meta">' + esc([f.court, f.date].filter(Boolean).join(', ')) + '</div><div class="fuente-aporta">' + esc(f.snippet) + '</div></article>';
    }).join('');
  } else {
    h += '<div class="inspector-empty">No se han recuperado resoluciones para esta consulta.</div>';
  }
  els.panelBody.innerHTML = h;
  els.panelBody.scrollTop = 0;
}

// Consola técnica: búsqueda, recuperación con puntuaciones, prompt, JSON y tiempos
function renderConsola(fragments, prompt, raw, turnIdx){
  var head = turnIdx != null ? queryHeader(turnIdx) : '';
  var traced = !!(raw && raw.trazabilidad && raw.trazabilidad.formato_ok !== undefined && raw.answer_text);
  els.cBusqueda.innerHTML = head + '<div class="cgrid">' + consultaBlock(raw && raw.consulta) + cendojBlock(raw && raw.cendoj) + '</div>';

  var h = head;
  if (!fragments.length){
    h += '<div class="inspector-empty">Sin fragmentos recuperados.</div>';
  } else if (traced){
    var tz = raw.trazabilidad;
    var partes = [tz.fuentes_usadas + ' de ' + tz.fuentes_recuperadas + ' fragmentos usados'];
    if (tz.citas_literales) partes.push(tz.citas_literales + ' citas literales');
    if (tz.citas_parciales) partes.push(tz.citas_parciales + ' aproximadas');
    if (tz.citas_no_encontradas) partes.push(tz.citas_no_encontradas + ' no localizadas');
    h += '<div class="traza"><span class="base ' + tz.base_respuesta + '">' + esc(tz.base_respuesta || '') + '</span> · ' + esc(partes.join(' · ')) + '</div>';
    h += '<div class="cgrid">' + fragments.map(function(f){ return fragCard(f, turnIdx, true); }).join('') + '</div>';
  } else {
    h += '<div class="cgrid">' + fragments.map(function(f){ return fragCard(f, turnIdx, false); }).join('') + '</div>';
  }
  els.cRecuperacion.innerHTML = h;

  els.cPrompt.innerHTML = head + '<pre class="prompt-view"></pre>';
  els.cPrompt.querySelector('pre').textContent = prompt || '';
  els.cRaw.innerHTML = head + '<pre class="prompt-view"></pre>';
  els.cRaw.querySelector('pre').textContent = JSON.stringify(raw, null, 2);

  var tm = (raw && raw.timings_ms) || {}, llm = (raw && raw.llm) || {};
  var NOMBRES = { reformulacion: 'Reformulación de la consulta', cendoj_busqueda: 'Búsqueda de jurisprudencia',
                  cendoj_descarga: 'Descarga e indexado', retrieval: 'Selección de pasajes', llm: 'Redacción de la respuesta' };
  var filas = Object.keys(tm).map(function(k){ return '<tr><td>' + esc(NOMBRES[k] || k) + '</td><td>' + (tm[k] / 1000).toFixed(1).replace('.', ',') + ' s</td></tr>'; }).join('');
  els.cTiempos.innerHTML = head + '<table class="tiempos">' + filas + '</table>' +
    '<div class="why" style="margin-top:10px">Modelo: ' + esc(llm.model || llm.provider || '—') +
    (llm.segunda_pasada ? ' · con segunda pasada' : '') + (llm.error ? ' · error: ' + esc(llm.error) : '') + '</div>';
}

function renderInspector(fragments, prompt, raw, turnIdx){
  renderFuentes(fragments, raw, turnIdx);
  renderConsola(fragments, prompt, raw, turnIdx);
  if (actual.ocupado) return;   // durante una consulta la pestaña Consola sigue mostrando el directo
  els.cVivo.innerHTML = '';
  renderVivo(queryHeader(turnIdx), turns[turnIdx] && turns[turnIdx].lineas, false);
}

// Panel derecho: pestañas Fuentes / Expediente
function abrirPanel(nombre){
  if (els.inspector.classList.contains('hidden')){ els.inspector.classList.remove('hidden'); els.inspectorToggle.classList.remove('active'); }
  document.querySelectorAll('.ptab').forEach(function(t){
    var on = t.dataset.pview === nombre;
    t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.pview').forEach(function(v){ v.classList.toggle('active', v.id === 'pv-' + nombre); });
  if (window.matchMedia('(max-width:960px)').matches) els.inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.querySelectorAll('.ptab').forEach(function(t){ t.addEventListener('click', function(){ abrirPanel(t.dataset.pview); }); });

// Abre «Fuentes» con las resoluciones de esa respuesta y resalta la n
function irAFuente(turnIdx, n){
  showTurn(turnIdx);
  abrirPanel('fuentes');
  var frags = turns[turnIdx].fragments || [];
  var card = document.getElementById('frag-' + turnIdx + '-' + n);
  if (!card){   // varios pasajes de la misma resolución: se busca la tarjeta de esa resolución
    var f = frags.filter(function(x){ return String(x.n) === String(n); })[0];
    if (f) frags.some(function(x){
      if ((x.sentencia_id || x.title) === (f.sentencia_id || f.title)){ card = document.getElementById('frag-' + turnIdx + '-' + x.n); return !!card; }
    });
  }
  if (card){
    els.panelBody.scrollTop = card.offsetTop - els.panelBody.offsetTop - 8;
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    card.setAttribute('tabindex', '-1'); card.focus({ preventScroll: true });
  }
}

els.thread.addEventListener('click', function(e){
  var row = e.target.closest('.msg.bot');
  var turnIdx = row && row.dataset.turn != null ? parseInt(row.dataset.turn, 10) : null;
  var a = e.target.closest('a.cite-ref');
  if (a){ e.preventDefault(); if (turnIdx != null) irAFuente(turnIdx, a.dataset.n); return; }
  var chip = e.target.closest('button.cite-chip');
  if (chip){ if (turnIdx != null) irAFuente(turnIdx, chip.dataset.n); return; }
  if (e.target.closest('button.adjuntar')) pedirArchivos();
});
els.consola.addEventListener('click', function(e){
  var b = e.target.closest('[data-ir]');
  if (b) selectCtab(b.dataset.ir);
});

function footFor(data){
  var llm = data.llm || {};
  var parts = [];
  if (llm.provider && llm.provider !== 'none') parts.push(llm.model || llm.provider);
  var tm = data.timings_ms;
  if (tm){ var ms = 0; Object.keys(tm).forEach(function(k){ ms += tm[k] || 0; }); parts.push((ms / 1000).toFixed(1).replace('.', ',') + ' s'); }
  return parts.join(' · ');
}

/* -----------------------  API del backend  ----------------------- */
function apiBase(){ return state.endpoint.replace(/\/api\/query\/?$/, '').replace(/\/$/, ''); }
function api(path, opts){
  opts = opts || {};
  var init = { method: opts.method || 'GET', headers: Sesion.cabeceras() };
  if (opts.body !== undefined){ init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  return fetch(apiBase() + path, init).then(function(res){
    return res.json().catch(function(){ return {}; }).then(function(body){
      if (res.status === 401 && Sesion.token && !opts.sinSesion){ Sesion.caducada(); }
      if (!res.ok){
        var d = body && body.detail ? (typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)) : '';
        throw new Error('HTTP ' + res.status + (d ? ' — ' + d : ''));
      }
      return body;
    });
  });
}
function vivo(){ return state.mode === 'live'; }
function norm(s){ return normalize(String(s || '')); }

/* -----------------------  Ventana modal (títulos, confirmaciones, selección)  ----------------------- */
function modal(opc){
  return new Promise(function(resolve){
    var fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    var campos = (opc.campos || []).map(function(c, i){
      var control;
      if (c.tipo === 'select')
        control = '<select data-i="' + i + '">' + (c.opciones || []).map(function(o){
          return '<option value="' + esc(o.valor) + '"' + (o.valor === c.valor ? ' selected' : '') + '>' + esc(o.texto) + '</option>'; }).join('') + '</select>';
      else if (c.multilinea)
        control = '<textarea rows="3" data-i="' + i + '" placeholder="' + esc(c.ayuda || '') + '">' + esc(c.valor || '') + '</textarea>';
      else
        control = '<input type="' + (c.secreto ? 'password' : 'text') + '" autocomplete="' + (c.secreto ? 'new-password' : 'off') + '" data-i="' + i + '" value="' + esc(c.valor || '') + '" placeholder="' + esc(c.ayuda || '') + '">';
      return '<label class="modal-campo"><span>' + esc(c.etiqueta) + '</span>' + control + '</label>';
    }).join('');
    fondo.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTit"><h2 id="modalTit">' + esc(opc.titulo) + '</h2>' +
      (opc.texto ? '<p>' + esc(opc.texto) + '</p>' : '') + campos +
      '<div class="modal-acc">' + (opc.sinCancelar ? '' : '<button type="button" class="btn-sec" data-r="no">Cancelar</button>') +
      '<button type="button" class="btn-pri' + (opc.peligro ? ' peligro' : '') + '" data-r="si">' + esc(opc.boton || 'Aceptar') + '</button></div></div>';
    document.body.appendChild(fondo);
    var previo = document.activeElement;
    var primero = fondo.querySelector('input,textarea,select') || fondo.querySelector('[data-r="si"]');
    primero.focus(); if (primero.select && primero.tagName !== 'SELECT') primero.select();
    function cerrar(ok){
      var vals = Array.prototype.map.call(fondo.querySelectorAll('[data-i]'), function(x){ return x.value.trim(); });
      fondo.remove(); if (previo && previo.focus) previo.focus();
      resolve(ok ? vals : null);
    }
    fondo.addEventListener('click', function(e){
      if (e.target === fondo) cerrar(false);
      var b = e.target.closest('[data-r]'); if (b) cerrar(b.dataset.r === 'si');
    });
    fondo.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){ e.stopPropagation(); cerrar(false); }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT'){ e.preventDefault(); cerrar(true); }
      if (e.key === 'Tab'){   // el foco no sale de la ventana
        var f = fondo.querySelectorAll('input,textarea,select,button'), a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a){ e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z){ e.preventDefault(); a.focus(); }
      }
    });
  });
}

/* -----------------------  Menú contextual (⋯)  ----------------------- */
var menuAbierto = null;
function cerrarMenu(){
  if (!menuAbierto) return;
  menuAbierto.el.remove();
  if (menuAbierto.anchor) menuAbierto.anchor.setAttribute('aria-expanded', 'false');
  menuAbierto = null;
}
function menuPop(anchor, items){
  var reabrir = menuAbierto && menuAbierto.anchor === anchor;
  cerrarMenu();
  if (reabrir) return;
  var m = document.createElement('div');
  m.className = 'menu-pop'; m.setAttribute('role', 'menu');
  items.forEach(function(it){
    if (!it) return;
    if (it === '-'){ m.appendChild(document.createElement('hr')); return; }
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.textContent = it.texto;
    if (it.peligro) b.className = 'peligro';
    b.addEventListener('click', function(e){ e.stopPropagation(); cerrarMenu(); it.accion(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  var r = anchor.getBoundingClientRect();
  var top = r.bottom + 4, left = Math.min(r.left, window.innerWidth - m.offsetWidth - 8);
  if (top + m.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - m.offsetHeight - 4);
  m.style.top = top + 'px'; m.style.left = Math.max(8, left) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  menuAbierto = { el: m, anchor: anchor };
  m.querySelector('button').focus();
  m.addEventListener('keydown', function(e){
    var bs = Array.prototype.slice.call(m.querySelectorAll('button')), i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown'){ e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    if (e.key === 'ArrowUp'){ e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    if (e.key === 'Escape' || e.key === 'Tab'){ e.preventDefault(); e.stopPropagation(); var a = anchor; cerrarMenu(); a.focus(); }
  });
}
document.addEventListener('click', function(e){
  if (menuAbierto && !menuAbierto.el.contains(e.target) && !menuAbierto.anchor.contains(e.target)) cerrarMenu();
});
window.addEventListener('resize', cerrarMenu);

/* -----------------------  Avisos flotantes  ----------------------- */
function toast(texto, botonTexto, accion){
  var t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = '<span></span>' + (botonTexto ? '<button type="button" class="btn-sec">' + esc(botonTexto) + '</button>' : '') +
    '<button type="button" class="link-sutil" aria-label="Cerrar aviso">✕</button>';
  t.firstChild.textContent = texto;
  var cerrar = function(){ t.remove(); };
  if (botonTexto) t.querySelector('.btn-sec').addEventListener('click', function(){ cerrar(); accion(); });
  t.querySelector('.link-sutil').addEventListener('click', cerrar);
  var cont = document.getElementById('toasts');
  cont.appendChild(t);
  while (cont.children.length > 3) cont.firstChild.remove();
  window.setTimeout(cerrar, botonTexto ? 15000 : 4500);
}

/* -----------------------  Usuario  ----------------------- */
var usuario = { get nombre(){ return (Sesion.usuario && Sesion.usuario.nombre) || 'Invitado'; } };
function iniciales(n){
  var p = String(n || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
}
function renderUsuario(){
  document.getElementById('userName').textContent = usuario.nombre;
  document.getElementById('userSub').textContent = (Sesion.usuario && Sesion.usuario.email) || 'Modo simulado';
  document.getElementById('userIni').textContent = iniciales(usuario.nombre);
  document.getElementById('saludo').textContent = 'Hola, ' + usuario.nombre.split(/\s+/)[0] + '. ¿En qué puedo ayudarte?';
  document.querySelectorAll('.avatar.user').forEach(function(a){ a.textContent = iniciales(usuario.nombre); });
}
document.getElementById('sbUser').addEventListener('click', function(e){
  e.stopPropagation();
  menuPop(e.currentTarget, [
    { texto: 'Cambiar mi nombre', accion: function(){
      modal({ titulo: 'Tu nombre', texto: 'El despacho verá este nombre en tus consultas.',
              campos: [{ etiqueta: 'Nombre', valor: usuario.nombre }], boton: 'Guardar' }).then(function(v){
        if (!v || !v[0] || !vivo()) return;
        api('/api/auth/yo', { method: 'PATCH', body: { nombre: v[0] } }).then(function(d){ Sesion.guardarUsuario(d.usuario); renderUsuario(); });
      }); } },
    '-',
    { texto: 'Cerrar sesión', accion: function(){ Sesion.salir(); } }
  ]);
});

/* -----------------------  Búsqueda de jurisprudencia (activar / desactivar)  ----------------------- */
state.buscar = store.get('legalia_buscar') !== '0';
var buscarBtn = document.getElementById('buscarToggle'), buscarHint = document.getElementById('buscarHint');
function hayJurisprudencia(){
  return turns.some(function(t){ return (t.fragments || []).some(function(f){ return f.usada; }); }) ||
    !!(actual.chat && actual.chat.memoria && (actual.chat.memoria.jurisprudencia_clave || []).length);
}
function actualizarCompositor(){
  buscarBtn.classList.toggle('on', state.buscar);
  buscarBtn.setAttribute('aria-pressed', String(state.buscar));
  buscarBtn.title = state.buscar
    ? 'Activada: busca jurisprudencia nueva para esta pregunta (puede tardar 1-2 min). Pulsa para responder solo con la ya consultada.'
    : 'Desactivada: responde en segundos con la jurisprudencia ya consultada en esta conversación. Pulsa para buscar de nuevo.';
  var otra = actual.pendiente && actual.pendiente.chatId !== actual.chatId;
  els.sendBtn.disabled = actual.ocupado;
  buscarHint.textContent = otra ? 'Esperando la respuesta de otra consulta…'
    : state.buscar ? '' : (hayJurisprudencia() ? 'Usará la jurisprudencia ya consultada aquí' : 'Sin búsqueda: solo orientación general');
  els.input.placeholder = actual.chatId ? 'Escribe tu mensaje…' : 'Describe tu situación como se la contarías a una persona de confianza…';
}
buscarBtn.addEventListener('click', function(){
  state.buscar = !state.buscar; store.set('legalia_buscar', state.buscar ? '1' : '0'); actualizarCompositor();
});


/* -----------------------  Configuración del portal (legalia.conf, sin datos técnicos)  ----------------------- */
var appConf = { voz: false, precio_consulta: 9.95, despacho: 'Despacho Demo' };
function cargarProveedores(){
  return fetch(Sesion.base() + '/api/app/config').then(function(r){ return r.json(); })
    .then(function(d){ appConf = d || appConf; prepararVoz(); }).catch(function(){});
}

/* -----------------------  Dictado por voz (en OCI: OCI Speech STT; aquí, el del navegador)  ----------------------- */
var vozBtn = document.getElementById('vozBtn'), vozRec = null, vozActiva = false, vozBase = '';
function prepararVoz(){
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  vozBtn.hidden = !(appConf.voz && SR);
  if (vozBtn.hidden || vozRec) return;
  vozRec = new SR();
  vozRec.lang = 'es-ES'; vozRec.continuous = true; vozRec.interimResults = true;
  vozRec.onresult = function(ev){
    var txt = '';
    for (var i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
    els.input.value = (vozBase ? vozBase + ' ' : '') + txt.trim();
    els.input.dispatchEvent(new Event('input'));
  };
  vozRec.onend = function(){ pararVoz(); };
  vozRec.onerror = function(e){ pararVoz(); if (e.error === 'not-allowed') toast('Permite el uso del micrófono para dictar tu consulta.'); };
}
function pararVoz(){ vozActiva = false; vozBtn.classList.remove('on'); vozBtn.setAttribute('aria-pressed', 'false'); vozBtn.title = 'Dictar la consulta por voz'; }
vozBtn.addEventListener('click', function(){
  if (!vozRec) return;
  if (vozActiva){ vozRec.stop(); return; }
  vozBase = els.input.value.trim();
  try { vozRec.start(); } catch (e) { return; }
  vozActiva = true; vozBtn.classList.add('on'); vozBtn.setAttribute('aria-pressed', 'true'); vozBtn.title = 'Escuchando… pulsa para terminar';
  toast('Te escucho. Habla con naturalidad; pulsa el micrófono para terminar.');
});
function textoFuentes(){ return ''; }

/* -----------------------  Chat actual y cabecera  ----------------------- */
var actual = { chatId: null, chat: null, ocupado: false, pendiente: null };
var listadoActual = { expedientes: [], chats: [] };
var noLeidos = {};

function limpiarHilo(){
  Array.prototype.slice.call(els.thread.children).forEach(function(n){ if (n !== els.emptyState) n.remove(); });
  els.emptyState.style.display = '';
  turns = [];
  els.panelQ.textContent = 'En qué se apoya cada respuesta.';
  els.panelBody.innerHTML = '<div class="inspector-empty">Cuando hagas una consulta, aquí verás en qué resoluciones judiciales se apoya la respuesta y qué dice exactamente cada una.</div>';
  if (!actual.ocupado){
    els.cVivo.innerHTML = '<div class="placeholder">Aquí verás <b>en directo</b> lo que hace el servidor mientras responde: reformulación, búsquedas en el CENDOJ, descargas, llamadas al modelo y errores.</div>';
    [['cBusqueda','Consulta reformulada, búsquedas enviadas al CENDOJ y candidatos.'], ['cRecuperacion','Fragmentos pasados al modelo, con su puntuación.'],
     ['cPrompt','Prompt completo enviado al modelo.'], ['cRaw','Respuesta completa del servidor en JSON.'], ['cTiempos','Tiempo de cada fase y modelo que respondió.']]
      .forEach(function(x){ els[x[0]].innerHTML = '<div class="placeholder">' + x[1] + ' Aparece al hacer una consulta.</div>'; });
  }
}

function ponerChat(vista){
  if (vista) delete vista.mensajes;
  actual.chat = vista || null;
  actual.chatId = vista ? vista.id : null;
  if (vista) delete noLeidos[vista.id];
  renderCabecera();
  renderExpediente();
  renderSidebar();
  actualizarCompositor();
}

function renderCabecera(){
  var c = actual.chat;
  els.chatTitle.textContent = c ? (c.titulo || 'Consulta sin título') : 'Nueva consulta';
  els.chatTitle.title = c ? 'Haz clic para renombrar' : '';
  var num = document.getElementById('chatNum');
  num.hidden = !(c && c.numero); if (c && c.numero){ num.textContent = c.numero; num.title = 'Nº de consulta: dáselo al despacho si te lo piden'; }
  var exp = c && c.expediente;
  els.expChip.hidden = !exp;
  if (exp) els.expChip.innerHTML = '<span class="fa fa-folder-open-o" aria-hidden="true"></span> ' + esc((exp.numero ? exp.numero + ' · ' : '') + exp.titulo);
  els.guardarExp.hidden = !vivo() || !c || !!exp;
  var fj = document.getElementById('fijarChat'), mn = document.getElementById('menuChat');
  fj.hidden = mn.hidden = !vivo() || !c;
  if (c){
    fj.setAttribute('aria-pressed', String(!!c.fijado));
    fj.title = c.fijado ? 'Quitar de fijados' : 'Fijar consulta';
  }
  document.getElementById('nuevaConsulta').classList.toggle('activo', !c);
  document.title = c ? (c.titulo + ' · Legal IA') : 'Legal IA · Tu asistente jurídico';
}

function refrescarChat(id){
  cargarSidebar();
  if (id && id === actual.chatId) return api('/api/chats/' + id).then(ponerChat);
  return Promise.resolve();
}

function renombrarChat(c){
  modal({ titulo: 'Renombrar consulta', campos: [{ etiqueta: 'Título', valor: c.titulo }], boton: 'Guardar' }).then(function(v){
    if (!v || !v[0]) return;
    api('/api/chats/' + c.id, { method: 'PATCH', body: { titulo: v[0] } }).then(function(){ refrescarChat(c.id); });
  });
}
function fijarChat(c){
  api('/api/chats/' + c.id, { method: 'PATCH', body: { fijado: !c.fijado } }).then(function(){
    refrescarChat(c.id); toast(c.fijado ? 'Consulta quitada de fijados.' : 'Consulta fijada arriba en el historial.');
  });
}
function guardarComoExpediente(c){
  modal({ titulo: 'Guardar como expediente',
          texto: 'El expediente reúne esta conversación y sus documentos. Podrás abrir nuevas consultas dentro de él y todas compartirán la memoria del caso, los documentos y la jurisprudencia consultada.',
          campos: [{ etiqueta: 'Nombre del expediente', valor: c.titulo, ayuda: 'p. ej. Despido · Transportes Norte' },
                   { etiqueta: 'Descripción (opcional)', multilinea: true, ayuda: 'Partes, fechas clave, lo que se busca…' }],
          boton: 'Crear expediente' }).then(function(v){
    if (!v) return;
    api('/api/chats/' + c.id + '/expediente', { method: 'POST', body: { titulo: v[0] || c.titulo, descripcion: v[1] || '' } })
      .then(function(){ return refrescarChat(c.id); })
      .then(function(){ if (c.id === actual.chatId) abrirPanel('expediente'); toast('Expediente creado.'); })
      .catch(function(err){ toast('No se pudo crear el expediente: ' + err.message); });
  });
}
function moverChat(c){
  var exps = listadoActual.expedientes || [];
  modal({ titulo: 'Mover a un expediente', texto: 'La consulta y sus documentos pasarán al expediente y compartirán su memoria del caso.',
          campos: [{ etiqueta: 'Expediente', tipo: 'select', opciones: exps.map(function(e){ return { valor: e.id, texto: e.titulo }; }) }],
          boton: 'Mover' }).then(function(v){
    if (!v || !v[0]) return;
    api('/api/chats/' + c.id, { method: 'PATCH', body: { mover_a: v[0] } }).then(function(){ refrescarChat(c.id); toast('Consulta movida al expediente.'); });
  });
}
function sacarChat(c){
  api('/api/chats/' + c.id, { method: 'PATCH', body: { mover_a: '' } }).then(function(){
    refrescarChat(c.id); toast('La consulta ya no está en el expediente (sus documentos se quedan en él).');
  });
}
function borrarChat(c){
  modal({ titulo: 'Borrar consulta', texto: 'Se borrará «' + c.titulo + '»' + (c.expediente_id ? '' : ' y sus documentos') + '. No se puede deshacer.', boton: 'Borrar', peligro: true })
    .then(function(ok){ if (!ok) return;
      api('/api/chats/' + c.id, { method: 'DELETE' }).then(function(){ if (c.id === actual.chatId) nuevaConsulta(true); cargarSidebar(); }); });
}
function opcionesChat(c){
  var exps = listadoActual.expedientes || [];
  return [
    { texto: c.fijado ? 'Quitar de fijados' : 'Fijar arriba', accion: function(){ fijarChat(c); } },
    { texto: 'Renombrar', accion: function(){ renombrarChat(c); } },
    c.expediente_id ? { texto: 'Sacar del expediente', accion: function(){ sacarChat(c); } }
                    : { texto: 'Guardar como expediente nuevo', accion: function(){ guardarComoExpediente(c); } },
    (!c.expediente_id && exps.length) ? { texto: 'Mover a un expediente…', accion: function(){ moverChat(c); } } : null,
    '-',
    { texto: 'Borrar', peligro: true, accion: function(){ borrarChat(c); } }
  ];
}
function opcionesExpediente(e){
  return [
    { texto: e.fijado ? 'Quitar de fijados' : 'Fijar arriba', accion: function(){
      api('/api/expedientes/' + e.id, { method: 'PATCH', body: { fijado: !e.fijado } }).then(function(){ refrescarChat(actual.chatId); }); } },
    { texto: 'Nueva consulta en este expediente', accion: function(){ nuevaEnExpediente(e.id); } },
    { texto: 'Renombrar o describir', accion: function(){
      modal({ titulo: 'Expediente', campos: [{ etiqueta: 'Nombre', valor: e.titulo }, { etiqueta: 'Descripción', multilinea: true, valor: e.descripcion || '' }], boton: 'Guardar' })
        .then(function(v){ if (!v || !v[0]) return;
          api('/api/expedientes/' + e.id, { method: 'PATCH', body: { titulo: v[0], descripcion: v[1] } }).then(function(){ refrescarChat(actual.chatId); }); }); } },
    '-',
    { texto: 'Borrar expediente', peligro: true, accion: function(){
      modal({ titulo: 'Borrar expediente', texto: 'Se borrarán «' + e.titulo + '», sus ' + e.chats.length + ' consultas y sus ' + e.documentos + ' documentos. No se puede deshacer.', boton: 'Borrar todo', peligro: true })
        .then(function(ok){ if (!ok) return;
          api('/api/expedientes/' + e.id, { method: 'DELETE' }).then(function(){
            if (actual.chat && actual.chat.expediente && actual.chat.expediente.id === e.id) nuevaConsulta(true);
            cargarSidebar(); }); }); } }
  ];
}

els.chatTitle.addEventListener('click', function(){ if (actual.chat && vivo()) renombrarChat(actual.chat); });
els.expChip.addEventListener('click', function(){ abrirPanel('expediente'); });
els.guardarExp.addEventListener('click', function(){ if (actual.chat) guardarComoExpediente(actual.chat); });
document.getElementById('fijarChat').addEventListener('click', function(){ if (actual.chat) fijarChat(actual.chat); });
document.getElementById('menuChat').addEventListener('click', function(e){
  e.stopPropagation();
  if (actual.chat) menuPop(e.currentTarget, opcionesChat({ id: actual.chat.id, titulo: actual.chat.titulo, fijado: actual.chat.fijado,
    expediente_id: actual.chat.expediente ? actual.chat.expediente.id : null }));
});

/* -----------------------  Barra lateral  ----------------------- */
function fechaCorta(iso){
  if (!iso) return '';
  var d = new Date(iso); if (isNaN(d)) return '';
  var hoy = new Date();
  return d.toDateString() === hoy.toDateString() ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
function grupoFecha(iso){
  var d = new Date(iso); if (isNaN(d)) return 'Anteriores';
  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  var dias = Math.floor((hoy - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : dias < 7 ? 'Últimos 7 días' : dias < 30 ? 'Últimos 30 días' : 'Anteriores';
}

var ICO_CHAT = '<svg class="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 5h14v10H9l-4 4z"/></svg>';
var ICO_EXP = '<svg class="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17z"/></svg>';
var ICO_PIN = '<svg class="sb-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-label="Fijado"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 14v6"/></svg>';

function resaltar(texto, q){
  var t = esc(texto);
  if (!q) return t;
  var i = norm(texto).indexOf(q);
  return i < 0 ? t : esc(texto.slice(0, i)) + '<mark class="sb-mark">' + esc(texto.slice(i, i + q.length)) + '</mark>' + esc(texto.slice(i + q.length));
}

function itemChat(c, q, conPin){
  var estado = actual.pendiente && actual.pendiente.chatId === c.id ? '<span class="sb-estado pendiente" title="Respondiendo…" aria-label="Respondiendo"></span>'
    : noLeidos[c.id] ? '<span class="sb-estado noleido" title="Respuesta nueva" aria-label="Respuesta nueva"></span>' : '';
  var sub = q && c.ultima_pregunta && norm(c.ultima_pregunta).indexOf(q) >= 0 && norm(c.titulo).indexOf(q) < 0
    ? '<small>' + resaltar(c.ultima_pregunta, q) + '</small>' : '';
  return '<div class="sb-item' + (c.id === actual.chatId ? ' activo' : '') + '" role="button" tabindex="0" data-chat="' + esc(c.id) + '" title="' + esc(c.titulo) + '">' +
    (conPin && c.fijado ? ICO_PIN : ICO_CHAT) +
    '<span class="sb-txt">' + resaltar(c.titulo || 'Consulta sin título', q) + sub + '</span>' + estado +
    '<span class="sb-meta">' + esc(fechaCorta(c.actualizado)) + '</span>' +
    '<button type="button" class="sb-acc" data-menu-chat="' + esc(c.id) + '" aria-haspopup="menu" aria-label="Opciones de «' + esc(c.titulo) + '»" title="Opciones">⋯</button></div>';
}

var abiertos = {};
try { abiertos = JSON.parse(store.get('legalia_exp_abiertos') || '{}') || {}; } catch(e){ abiertos = {}; }

function itemExpediente(e, q, chatsVisibles, forzarAbierto){
  var ab = forzarAbierto || abiertos[e.id] !== false;
  var activo = actual.chat && actual.chat.expediente && actual.chat.expediente.id === e.id;
  return '<div class="sb-exp" data-exp="' + esc(e.id) + '"><div class="sb-item' + (activo ? ' activo-exp' : '') + '" role="button" tabindex="0" aria-expanded="' + ab + '" data-toggle-exp="' + esc(e.id) + '" title="' + esc(e.titulo) + '">' +
    (e.fijado ? ICO_PIN : ICO_EXP) + '<span class="sb-txt">' + resaltar(e.titulo, q) + '</span>' +
    '<span class="sb-meta">' + e.chats.length + ' · ' + e.documentos + ' doc.</span>' +
    '<button type="button" class="sb-acc" data-menu-exp="' + esc(e.id) + '" aria-haspopup="menu" aria-label="Opciones del expediente «' + esc(e.titulo) + '»" title="Opciones">⋯</button></div>' +
    '<div class="sb-exp-chats"' + (ab ? '' : ' hidden') + '>' + chatsVisibles.map(function(c){ return itemChat(c, q, false); }).join('') +
    (q ? '' : '<div class="sb-item sb-add" role="button" tabindex="0" data-nueva-en="' + esc(e.id) + '">+ Nueva consulta aquí</div>') + '</div></div>';
}

function cargarSidebar(){
  if (!vivo()){
    listadoActual = { expedientes: [], chats: [] };
    els.sbBody.innerHTML = '<div class="sb-vacio">El historial y los expedientes se guardan en el servidor. Activa el <b>modo conectado</b> en Configuración para usarlos.</div>';
    return Promise.resolve();
  }
  return api('/api/chats').then(function(l){ listadoActual = l; renderSidebar(); }).catch(function(err){
    els.sbBody.innerHTML = '<div class="sb-vacio">No se pudo cargar el historial (' + esc(err.message) + '). ¿Está en marcha el servidor?</div>';
  });
}

function renderSidebar(){
  if (!vivo()) return;
  var q = norm(document.getElementById('sbBuscar').value.trim());
  var l = listadoActual || { expedientes: [], chats: [] };
  var coincide = function(c){ return !q || norm(c.titulo).indexOf(q) >= 0 || norm(c.ultima_pregunta).indexOf(q) >= 0; };
  var todosChats = (l.chats || []).concat.apply(l.chats || [], (l.expedientes || []).map(function(e){ return e.chats; }));
  var h = '';
  // Fijados
  var fijE = (l.expedientes || []).filter(function(e){ return e.fijado && (coincide(e) || e.chats.some(coincide)); });
  var fijC = todosChats.filter(function(c){ return c.fijado && coincide(c); });
  if (fijE.length || fijC.length){
    h += '<div class="sb-sec">Fijados</div>' + fijE.map(function(e){
      return itemExpediente(e, q, q ? e.chats.filter(coincide) : e.chats, !!q); }).join('') +
      fijC.map(function(c){ return itemChat(c, q, true); }).join('');
  }
  // Expedientes
  var exps = (l.expedientes || []).filter(function(e){ return !e.fijado && (coincide(e) || e.chats.some(coincide)); });
  h += '<div class="sb-sec">Mis expedientes <span class="n">' + ((l.expedientes || []).length || '') + '</span></div>';
  h += exps.length ? exps.map(function(e){ return itemExpediente(e, q, q && !coincide(e) ? e.chats.filter(coincide) : e.chats, !!q); }).join('')
    : '<div class="sb-vacio">' + (q ? 'Ningún expediente coincide.' : 'Guarda una consulta como expediente para reunir en un mismo sitio sus conversaciones y documentos.') + '</div>';
  // Chats sueltos, por fecha
  var sueltos = (l.chats || []).filter(function(c){ return !c.fijado && coincide(c); });
  h += '<div class="sb-sec">Mis consultas <span class="n">' + ((l.chats || []).length || '') + '</span></div>';
  if (sueltos.length){
    var grupo = '';
    sueltos.forEach(function(c){
      var g = grupoFecha(c.actualizado);
      if (g !== grupo){ grupo = g; h += '<div class="sb-grupo">' + g + '</div>'; }
      h += itemChat(c, q, false);
    });
  } else {
    h += '<div class="sb-vacio">' + (q ? 'Ninguna consulta coincide con «' + esc(document.getElementById('sbBuscar').value) + '».' : 'Tus consultas aparecerán aquí en cuanto envíes la primera.') + '</div>';
  }
  var scroll = els.sbBody.scrollTop;
  els.sbBody.innerHTML = h;
  els.sbBody.scrollTop = scroll;
}
document.getElementById('sbBuscar').addEventListener('input', renderSidebar);
document.getElementById('sbBuscar').addEventListener('keydown', function(e){ if (e.key === 'Escape'){ e.target.value = ''; renderSidebar(); } });

function buscarChat(id){
  var l = listadoActual || {};
  var todos = (l.chats || []).concat.apply(l.chats || [], (l.expedientes || []).map(function(e){ return e.chats; }));
  return todos.filter(function(c){ return c.id === id; })[0];
}
function cerrarSidebarMovil(){ if (MOVIL.matches) setSidebar(false); }

els.sbBody.addEventListener('click', function(e){
  var t;
  if ((t = e.target.closest('[data-menu-chat]'))){
    e.stopPropagation();
    var c = buscarChat(t.dataset.menuChat);
    if (c) menuPop(t, opcionesChat(c));
    return;
  }
  if ((t = e.target.closest('[data-menu-exp]'))){
    e.stopPropagation();
    var ex = (listadoActual.expedientes || []).filter(function(x){ return x.id === t.dataset.menuExp; })[0];
    if (ex) menuPop(t, opcionesExpediente(ex));
    return;
  }
  if ((t = e.target.closest('[data-toggle-exp]'))){
    var cont = t.parentNode.querySelector('.sb-exp-chats');
    cont.hidden = !cont.hidden; t.setAttribute('aria-expanded', String(!cont.hidden));
    abiertos[t.dataset.toggleExp] = !cont.hidden; store.set('legalia_exp_abiertos', JSON.stringify(abiertos));
    return;
  }
  if ((t = e.target.closest('[data-nueva-en]'))){ nuevaEnExpediente(t.dataset.nuevaEn); return; }
  if ((t = e.target.closest('[data-chat]'))){ abrirChat(t.dataset.chat); cerrarSidebarMovil(); }
});
els.sbBody.addEventListener('keydown', function(e){
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('sb-item')){ e.preventDefault(); e.target.click(); }
});

var MOVIL = window.matchMedia('(max-width:960px)');
function setSidebar(abierta){
  els.sidebar.classList.toggle('cerrada', !abierta);
  document.getElementById('sbFondo').hidden = !(abierta && MOVIL.matches);
  document.getElementById('sidebarToggle').classList.toggle('active', abierta);
  document.getElementById('sidebarToggle').setAttribute('aria-expanded', String(abierta));
  if (!MOVIL.matches) store.set('legalia_sidebar', abierta ? '1' : '0');
}
document.getElementById('sidebarToggle').addEventListener('click', function(){ setSidebar(els.sidebar.classList.contains('cerrada')); });
setSidebar(MOVIL.matches ? false : store.get('legalia_sidebar') !== '0');
document.getElementById('sbFondo').addEventListener('click', function(){ setSidebar(false); });
(MOVIL.addEventListener ? MOVIL.addEventListener.bind(MOVIL, 'change') : MOVIL.addListener.bind(MOVIL))(function(){
  setSidebar(MOVIL.matches ? false : store.get('legalia_sidebar') !== '0');
});
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape' && menuAbierto){ cerrarMenu(); return; }
  if (e.key === 'Escape' && MOVIL.matches && !els.sidebar.classList.contains('cerrada')) setSidebar(false);
  if (e.ctrlKey && e.altKey && (e.key === 'n' || e.key === 'N')){ e.preventDefault(); nuevaConsulta(); }
});

function nuevaConsulta(silencioso){
  limpiarHilo(); ponerChat(null);
  if (actual.pendiente && !silencioso) { /* la otra consulta sigue respondiendo en segundo plano */ }
  els.input.focus();
}
document.getElementById('nuevaConsulta').addEventListener('click', function(){ nuevaConsulta(); cerrarSidebarMovil(); });
document.getElementById('logoPortal').addEventListener('click', function(e){ e.preventDefault(); nuevaConsulta(); });
document.getElementById('ayudaPortal').addEventListener('click', function(){
  modal({ titulo: 'Cómo funciona Legal IA', boton: 'Entendido', sinCancelar: true,
    texto: 'Cuéntanos tu situación con tus palabras (o díctala con el micrófono). Legal IA analiza cómo han resuelto los tribunales casos parecidos y te explica tus opciones. ' +
           'En «Fuentes» verás las resoluciones en las que se apoya cada respuesta. Puedes adjuntar documentos con el clip y guardarlos en un expediente. ' +
           'Un abogado del despacho puede revisar tu consulta y escribirte en «Mensajes con el despacho». Legal IA orienta, pero no sustituye el consejo de un abogado.' });
});

function nuevaEnExpediente(expId){
  api('/api/chats', { method: 'POST', body: { expediente_id: expId } }).then(function(vista){
    limpiarHilo(); ponerChat(vista); cargarSidebar(); els.input.focus(); cerrarSidebarMovil();
    notaHilo('Nueva consulta en el expediente «' + vista.expediente.titulo + '». Legal IA recuerda sus documentos, la memoria del caso y la jurisprudencia ya consultada.');
  });
}

// Abre un chat guardado y repinta sus mensajes con sus fuentes y datos técnicos
function abrirChat(id){
  if (!vivo()) return Promise.resolve();
  return api('/api/chats/' + id).then(function(vista){
    limpiarHilo();
    var msgs = vista.mensajes || [];
    ponerChat(vista);
    var ultimo = null;
    for (var i = 0; i < msgs.length; i++){
      if (msgs[i].rol !== 'usuario') continue;
      var userRow = addUserMsg(msgs[i].texto);
      var r = msgs[i + 1] && msgs[i + 1].rol === 'asistente' ? msgs[i + 1].respuesta : null;
      if (r){ ultimo = pintarRespuesta(msgs[i].texto, r, userRow, null); i++; }
    }
    if (ultimo != null) showTurn(ultimo);
    var p = actual.pendiente;
    if (p && p.chatId === id){   // sigue respondiendo: se vuelve a mostrar la pregunta y el indicador
      showThread(); els.thread.appendChild(p.userRow); els.thread.appendChild(p.typingRow);
    } else if (!msgs.length && vista.documentos && vista.documentos.length){
      notaHilo('Esta consulta tiene ' + vista.documentos.length + ' documento(s). Puedes preguntar sobre ellos.');
    }
    actualizarCompositor();
    scrollBottom();
  }).catch(function(err){
    toast('No se pudo abrir la consulta: ' + err.message);
    cargarSidebar();
  });
}

function notaHilo(html, esError, esHtml){
  showThread();
  var row = document.createElement('div');
  row.className = 'msg nota';
  row.innerHTML = '<div class="nota-doc' + (esError ? ' err' : '') + '"></div>';
  if (esHtml) row.firstChild.innerHTML = html; else row.firstChild.textContent = html;
  els.thread.appendChild(row);
  scrollBottom();
  return row;
}

/* -----------------------  Documentos adjuntos  ----------------------- */
var MAX_BYTES = 15 * 1024 * 1024;
var TIPOS_OK = /\.(pdf|jpe?g|png|webp|docx|txt)$/i;

function pedirArchivos(){
  if (!vivo()){ toast('Para adjuntar documentos activa el modo conectado (Configuración).'); return; }
  els.fileInput.click();
}
els.attachBtn.addEventListener('click', pedirArchivos);
els.fileInput.addEventListener('change', function(){
  var fs = Array.prototype.slice.call(els.fileInput.files || []);
  els.fileInput.value = '';
  subirArchivos(fs);
});

(function(){
  var n = 0;
  els.chatPanel.addEventListener('dragenter', function(e){ if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') < 0) return; e.preventDefault(); n++; els.chatPanel.classList.add('arrastrando'); });
  els.chatPanel.addEventListener('dragover', function(e){ if (els.chatPanel.classList.contains('arrastrando')) e.preventDefault(); });
  els.chatPanel.addEventListener('dragleave', function(){ n = Math.max(0, n - 1); if (!n) els.chatPanel.classList.remove('arrastrando'); });
  els.chatPanel.addEventListener('drop', function(e){
    e.preventDefault(); n = 0; els.chatPanel.classList.remove('arrastrando');
    if (!vivo()){ toast('Para adjuntar documentos activa el modo conectado (Configuración).'); return; }
    subirArchivos(Array.prototype.slice.call(e.dataTransfer.files || []));
  });
})();

function asegurarChat(titulo){
  if (actual.chatId) return Promise.resolve(actual.chat);
  return api('/api/chats', { method: 'POST', body: { titulo: titulo || '' } }).then(function(vista){ ponerChat(vista); cargarSidebar(); return vista; });
}

function leerB64(file){
  return new Promise(function(ok, ko){
    var r = new FileReader();
    r.onload = function(){ ok(String(r.result)); };
    r.onerror = function(){ ko(new Error('no se pudo leer el archivo')); };
    r.readAsDataURL(file);
  });
}

var subiendo = 0;
function subirArchivos(files){
  if (!files.length) return;
  asegurarChat().then(function(){
    var chatId = actual.chatId;
    files.reduce(function(cadena, file){
      return cadena.then(function(){ return subirUno(file, chatId); });
    }, Promise.resolve());
  }).catch(function(err){ toast('No se pudo preparar la consulta para adjuntar: ' + err.message); });
}

function subirUno(file, chatId){
  var chip = document.createElement('span');
  chip.className = 'subida';
  els.subidas.appendChild(chip);
  function quitarLuego(){ window.setTimeout(function(){ chip.remove(); }, 7000); }
  if (!TIPOS_OK.test(file.name)){
    chip.classList.add('err'); chip.textContent = file.name + ': formato no admitido (PDF, imagen, Word o texto)'; quitarLuego();
    return Promise.resolve();
  }
  if (file.size > MAX_BYTES){
    chip.classList.add('err'); chip.textContent = file.name + ': supera 15 MB'; quitarLuego();
    return Promise.resolve();
  }
  chip.innerHTML = '<span class="dots">Analizando ' + esc(file.name) + '</span>';
  subiendo++; els.attachBtn.classList.add('ocupado');
  return leerB64(file).then(function(b64){
    return api('/api/chats/' + chatId + '/documentos', { method: 'POST', body: { nombre: file.name, mime: file.type || '', datos_b64: b64 } });
  }).then(function(r){
    var d = r.documento || {};
    chip.classList.add('ok');
    chip.textContent = '✓ ' + file.name + ' · ' + (d.tipo || 'documento');
    quitarLuego();
    if (actual.chatId === chatId) ponerChat(r.chat);
    var rev = r.revision || {};
    var h = '<b>Documento añadido:</b> ' + esc(d.titulo || file.name) + ' <span class="doc-tipo">' + esc(d.tipo || '') + '</span>' +
      (d.resumen ? '<div class="nota-res">' + esc(d.resumen) + '</div>' : '') +
      (d.legible === false ? '<div class="nota-warn">No se ha podido leer bien: si puedes, súbelo con mejor calidad.</div>' : '');
    var nInc = (rev.inconsistencias || []).length, nRec = (rev.documentos_recomendados || []).length;
    if (nInc || nRec)
      h += '<div class="nota-warn">' + [nInc ? nInc + (nInc === 1 ? ' dato que no cuadra' : ' datos que no cuadran') : '', nRec ? nRec + ' documento(s) recomendado(s)' : ''].filter(Boolean).join(' · ') +
        ' — <button type="button" class="link-btn" data-ver-exp>ver expediente</button></div>';
    if (actual.chatId === chatId) notaHilo(h, false, true);
    cargarSidebar();
  }).catch(function(err){
    chip.classList.add('err'); chip.textContent = file.name + ': ' + err.message; quitarLuego();
  }).then(function(){ subiendo--; if (!subiendo) els.attachBtn.classList.remove('ocupado'); });
}
els.thread.addEventListener('click', function(e){ if (e.target.closest('[data-ver-exp]')) abrirPanel('expediente'); });

/* -----------------------  Panel «Expediente»: memoria, revisión y documentos  ----------------------- */
// datos_clave puede venir como [{campo, valor}], {clave: valor} o [texto]
function paresDatos(dc){
  var out = [];
  function txt(v){ return v == null ? '' : typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : JSON.stringify(v)) : String(v); }
  if (Array.isArray(dc)) dc.forEach(function(x){
    if (x && typeof x === 'object') out.push([txt(x.campo || x.nombre || x.clave || ''), txt(x.valor != null ? x.valor : x.dato)]);
    else if (x) out.push(['', txt(x)]);
  });
  else if (dc && typeof dc === 'object') Object.keys(dc).forEach(function(k){ if (dc[k]) out.push([k.replace(/_/g, ' '), txt(dc[k])]); });
  return out.filter(function(x){ return x[1]; });
}
var GRAV = { alta: 'Importante', media: 'Revisar', baja: 'Menor' };

function bloqueMemoria(m){
  if (!m || !m.resumen) return '';
  function lista(t, a){ return (a && a.length) ? '<h4>' + t + '</h4><ul>' + a.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  var cuando = m.actualizada ? fechaCorta(m.actualizada) : '';
  return '<div class="bloque memoria"><h3>Lo que Legal IA recuerda del caso<button type="button" class="link-sutil" data-olvidar>Olvidar</button></h3>' +
    '<p>' + esc(m.resumen) + '</p>' + lista('Fechas clave', m.fechas_clave) + lista('Hechos', m.hechos) +
    lista('Pendiente', m.pendiente) + lista('Ya explicado', m.orientacion_dada) + lista('Jurisprudencia clave', m.jurisprudencia_clave) +
    '<div class="doc-meta">Se actualiza tras cada respuesta' + (cuando ? ' · última: ' + esc(cuando) : '') + (m.intercambios ? ' · ' + m.intercambios + ' intercambios' : '') + '</div></div>';
}

function renderExpediente(){
  var c = actual.chat;
  var docs = (c && c.documentos) || [];
  els.expCnt.textContent = docs.length ? String(docs.length) : '';
  if (!vivo()){
    els.expBody.innerHTML = '<div class="inspector-empty">Los documentos y expedientes necesitan el modo conectado.</div>'; return;
  }
  var h = '';
  if (c && c.expediente){
    var e = c.expediente;
    h += '<div class="exp-cab"><div class="doc-tipo">Expediente</div><h3>' + esc(e.titulo) + '</h3>' +
      (e.descripcion ? '<p class="exp-resumen">' + esc(e.descripcion) + '</p>' : '') +
      '<div class="doc-meta">' + e.chats.length + (e.chats.length === 1 ? ' consulta' : ' consultas') + ' · ' + docs.length + (docs.length === 1 ? ' documento' : ' documentos') + '</div></div>';
  }
  h += bloqueMemoria(c && c.memoria);
  var rev = (c && c.revision) || {};
  if (rev.resumen_expediente) h += '<div class="insp-label">Resumen de la documentación</div><p class="exp-resumen">' + esc(rev.resumen_expediente) + '</p>';
  if ((rev.inconsistencias || []).length)
    h += '<div class="bloque incons"><h3>Datos que no cuadran</h3><ul>' + rev.inconsistencias.map(function(i){
      var g = (i.gravedad || '').toLowerCase();
      return '<li>' + (GRAV[g] ? '<span class="grav ' + g + '">' + GRAV[g] + '</span>' : '') + esc(i.descripcion || i) + '</li>';
    }).join('') + '</ul></div>';
  if ((rev.falta_informacion || []).length)
    h += '<div class="bloque falta"><h3>Información que falta</h3><ul>' + rev.falta_informacion.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  if ((rev.documentos_recomendados || []).length)
    h += '<div class="bloque recom"><h3>Documentos que conviene aportar</h3>' + rev.documentos_recomendados.map(function(d){
      return '<div class="pedir"><div>' + esc(d.documento) + (d.motivo ? '<small>' + esc(d.motivo) + '</small>' : '') + '</div><button type="button" class="btn-sec adjuntar">Adjuntar</button></div>';
    }).join('') + '</div>';
  h += '<div class="insp-label" style="display:flex;justify-content:space-between;align-items:center">Documentos<button type="button" class="btn-sec adjuntar">+ Adjuntar</button></div>';
  if (!docs.length){
    h += '<div class="inspector-empty" style="padding:14px 4px">Aún no hay documentos. Adjunta (o arrastra al chat) el DNI, contrato, nóminas, carta de despido, informes médicos, resoluciones… Legal IA los leerá, extraerá sus datos y te dirá si algo no cuadra o falta.</div>';
  } else {
    h += docs.slice().reverse().map(function(d){
      var datos = paresDatos(d.datos_clave);
      var url = apiBase() + '/api/chats/' + encodeURIComponent(actual.chatId) + '/documentos/' + encodeURIComponent(d.id) + '/archivo?t=' + encodeURIComponent(Sesion.token || '');
      return '<article class="doc"><div class="doc-top"><div style="flex:1;min-width:0"><div class="doc-tipo">' + esc(d.tipo || 'documento') + '</div>' +
        '<div class="doc-tit">' + esc(d.titulo || d.nombre) + '</div></div></div>' +
        '<div class="doc-meta">' + esc([d.nombre, d.fecha, d.subido ? 'aportado ' + fechaCorta(d.subido) : '', d.metodo].filter(Boolean).join(' · ')) + '</div>' +
        (d.resumen ? '<div class="doc-res">' + esc(d.resumen) + '</div>' : '') +
        (datos.length ? '<dl>' + datos.slice(0, 12).map(function(x){ return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' : '') +
        ((d.alertas || []).length ? d.alertas.map(function(a){ return '<div class="doc-alerta">⚠ ' + esc(a) + '</div>'; }).join('') : '') +
        (d.legible === false ? '<div class="doc-alerta">⚠ No se ha leído bien; conviene subirlo con mejor calidad.</div>' : '') +
        (d.error_ia ? '<div class="doc-alerta">Análisis con IA no disponible: ' + esc(d.error_ia) + '</div>' : '') +
        '<div class="doc-acc"><a href="' + esc(url) + '" target="_blank" rel="noopener">Ver original ↗</a>' +
        '<button type="button" class="borrar" data-borrar-doc="' + esc(d.id) + '">Quitar</button></div></article>';
    }).join('');
  }
  if (!c) h = '<div class="inspector-empty">Aquí verás lo que Legal IA recuerda de tu caso y los documentos que aportes. Escribe tu consulta o adjunta un documento para empezar.</div>' + h;
  els.expBody.innerHTML = h;
}
els.expBody.addEventListener('click', function(e){
  if (e.target.closest('button.adjuntar')){ pedirArchivos(); return; }
  if (e.target.closest('[data-olvidar]')){
    modal({ titulo: 'Olvidar la memoria del caso', texto: 'Legal IA dejará de tener en cuenta el resumen acumulado (los mensajes y documentos se conservan). Se volverá a crear con la próxima respuesta.', boton: 'Olvidar', peligro: true })
      .then(function(ok){ if (ok) api('/api/chats/' + actual.chatId + '/memoria', { method: 'DELETE' }).then(ponerChat); });
    return;
  }
  var b = e.target.closest('[data-borrar-doc]');
  if (!b) return;
  modal({ titulo: 'Quitar documento', texto: 'Se quitará del expediente y se borrará el archivo guardado.', boton: 'Quitar', peligro: true }).then(function(ok){
    if (!ok) return;
    b.disabled = true; b.textContent = 'Quitando…';
    api('/api/chats/' + actual.chatId + '/documentos/' + b.dataset.borrarDoc, { method: 'DELETE' })
      .then(function(vista){ ponerChat(vista); cargarSidebar(); })
      .catch(function(err){ b.disabled = false; b.textContent = 'Quitar'; toast('No se pudo quitar: ' + err.message); });
  });
});

/* -----------------------  Envío de mensajes  ----------------------- */
// Pinta una respuesta (nueva o cargada del historial) y devuelve su índice de turno
function pintarRespuesta(query, data, userRow, lineas){
  var sources = data.sources || [];
  var turnIdx = turns.length;
  turns.push({ query: query, fragments: sources, prompt: data.prompt || buildPrompt(query, sources), raw: data, lineas: lineas });
  var c = data.consulta;
  if (c && c.consulta_juridica && userRow && !userRow.querySelector('.reform')){
    var r = document.createElement('div');
    r.className = 'reform';
    r.innerHTML = (c.local ? '<b>Interpretación básica (sin IA):</b> ' : '<b>Redacción jurídica:</b> ') + esc(c.consulta_juridica);
    userRow.querySelector('.bubble').appendChild(r);
  }
  var chips = (data.trazabilidad && data.answer_text) ? sources.filter(function(f){ return f.usada; }) : sources;
  addBotMsg(data.answer || '<p>(El backend no devolvió el campo "answer")</p>', chips, turnIdx, footFor(data));
  return turnIdx;
}

// Tras responder, el servidor actualiza la memoria del caso en segundo plano
function refrescarMemoriaLuego(chatId){
  [6000, 16000].forEach(function(ms){
    window.setTimeout(function(){
      if (actual.chatId === chatId) api('/api/chats/' + chatId).then(function(v){ if (actual.chatId === chatId) ponerChat(v); }).catch(function(){});
    }, ms);
  });
}

function handleSend(query){
  if (!query.trim() || actual.ocupado) return;
  var userRow = addUserMsg(query);
  actual.ocupado = true;
  var typingRow = addTyping();
  var pendIdx = turns.length;
  turns.push({ query: query, fragments: [], prompt: '', raw: null });
  showPendingInspector(pendIdx);
  var cabecera = queryHeader(pendIdx);
  turns.pop();     // el turno definitivo lo crea pintarRespuesta
  actualizarCompositor();

  function fin(){
    window.clearInterval(typingRow._timer);
    typingRow.remove();
    actual.ocupado = false;
    actual.pendiente = null;
    actualizarCompositor();
  }

  if (state.mode === 'mock'){
    renderVivo(cabecera, ['[Simulado] Sin servidor: búsqueda por palabras clave en 8 sentencias de ejemplo.'], true);
    window.setTimeout(function(){
      var fragments = retrieveMock(query, state.topk);
      var relevant = fragments.filter(function(f){ return f.score >= 0.6; });
      fin();
      var idx = turns.length;
      turns.push({ query: query, fragments: fragments, prompt: buildPrompt(query, fragments),
                   raw: { mode:'mock', query: query, top_k: state.topk, sources: fragments }, lineas: ['[Simulado] Respuesta compuesta por reglas, sin modelo.'] });
      addBotMsg(composeMockAnswer(query, fragments), relevant, idx, 'simulación');
      showTurn(idx);
    }, 550 + Math.random() * 500);
    return;
  }

  var rid = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var buscar = state.buscar, tokenEnvio = Sesion.token;   // si se cierra sesión, la respuesta se descarta
  var lineas = [], sondeo = null, terminado = false;

  // La consulta se guarda en el historial en el momento de enviarla, no al terminar
  asegurarChat(query).then(function(vista){
    var chatId = vista.id, titulo = vista.titulo;
    actual.pendiente = { chatId: chatId, userRow: userRow, typingRow: typingRow, query: query };
    cargarSidebar();
    actualizarCompositor();

    // Consulta asíncrona (Fase 2): se crea el trabajo y se pregunta por su estado hasta que termina.
    // La misma respuesta trae la fase (y, al despacho, la consola técnica) y, al final, la respuesta.
    var fallos = 0;
    function esperar(ms){ return new Promise(function(ok){ sondeo = window.setTimeout(ok, ms); }); }
    function sondear(){
      return api('/api/consultas/' + rid).then(function(p){
        fallos = 0;
        lineas = p.lineas || lineas; typingRow._lineas = lineas; typingRow._fase = p.fase || ''; typingRow._tick();
        if (!p.terminado){
          if (tokenEnvio === Sesion.token) renderVivo(cabecera, lineas, true);
          return esperar(1000).then(sondear);
        }
        if (p.error) throw new Error(p.error);
        if (!p.resultado) throw new Error('La consulta terminó sin respuesta. Referencia: ' + rid);
        return p.resultado;
      }, function(err){
        // Un corte momentáneo de red no cancela la consulta: el servidor la sigue procesando
        if (++fallos > 5 || /HTTP 4\d\d/.test(err.message)) throw err;
        return esperar(2000).then(sondear);
      });
    }

    return api('/api/consultas', {
      method: 'POST',
      body: { query: query, top_k: state.topk, system_prompt: state.persona, chat_id: chatId, request_id: rid, buscar: buscar }
    }).then(function(t){
      rid = t.id || rid;
      return esperar(600).then(sondear);
    }).then(function(data){
      terminado = true; window.clearTimeout(sondeo);
      if (tokenEnvio !== Sesion.token) return;
      return Promise.resolve(lineas).then(function(ls){
        fin();
        var v = data.chat; delete data.chat;
        if (actual.chatId === chatId){
          if (v) ponerChat(v);
          var idx = pintarRespuesta(query, data, userRow, ls);
          showTurn(idx);
          refrescarMemoriaLuego(chatId);
        } else {
          noLeidos[chatId] = 1;
          toast('Respuesta lista en «' + ((v && v.titulo) || titulo) + '».', 'Ver', function(){ abrirChat(chatId); });
        }
        cargarSidebar();
      });
    }).catch(function(err){
      terminado = true; window.clearTimeout(sondeo);
      if (tokenEnvio !== Sesion.token) return;
      fin();
      if (actual.chatId !== chatId){ toast('La consulta «' + titulo + '» falló: ' + err.message); return; }
      var idx = turns.length;
      turns.push({ query: query, fragments: [], prompt: '', raw: { error: err.message }, lineas: lineas });
      addBotMsg('<p>' + esc(err.message) + '</p><p>Tu consulta ha quedado guardada; puedes volver a enviarla en unos minutos.</p>', [], idx, '');
      showTurn(idx);
      cargarSidebar();
    });
  }).catch(function(err){
    fin();
    addBotMsg('<p>No se pudo crear la consulta en el servidor: ' + esc(err.message) + '.</p>', [], null, '');
  });
}

els.form.addEventListener('submit', function(e){
  e.preventDefault();
  if (actual.ocupado || !els.input.value.trim()) return;
  var q = els.input.value;
  els.input.value = '';
  els.input.style.height = 'auto';
  handleSend(q);
});
els.input.addEventListener('input', function(){
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(160, els.input.scrollHeight) + 'px';
});
els.input.addEventListener('keydown', function(e){
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); els.form.requestSubmit(); }
});
document.querySelectorAll('.ex-btn, .area-card').forEach(function(btn){
  btn.addEventListener('click', function(){ handleSend(btn.getAttribute('data-q')); });
});

// Al cambiar de modo, la interfaz se adapta (el modo simulado es solo para pruebas)
function aplicarModoUI(){
  els.attachBtn.disabled = !vivo();
  els.attachBtn.title = vivo() ? 'Adjuntar documentos (DNI, contratos, nóminas, informes médicos, sentencias…)' : 'Adjuntar documentos requiere el modo conectado';
  els.modePill.hidden = vivo();
  buscarBtn.hidden = !vivo();
  renderCabecera(); renderExpediente(); cargarSidebar(); actualizarCompositor(); cargarProveedores();
}
[els.modeMockBtn, els.modeLiveBtn].forEach(function(b){ b.addEventListener('click', aplicarModoUI); });
els.endpoint.addEventListener('change', function(){ cargarSidebar(); });

// Herramientas técnicas (configuración y consola) en la vista cliente: solo en modo desarrollador
function aplicarModoDev(){
  var dev = store.get('legalia_dev') === '1';     // oculto salvo que se active a propósito
  [els.configToggle, document.getElementById('consolaToggle'), document.getElementById('consolaHandle')].forEach(function(b){ b.hidden = !dev; });
  if (!dev){ els.configPanel.classList.remove('open'); setConsola(false); }
}

// Se llama al entrar como cliente: consulta nueva seleccionada (el historial queda a la izquierda)
window.LIA = {
  api: api, esc: esc, modal: modal, toast: toast, menuPop: menuPop, store: store, iniciales: iniciales,
  fechaCorta: fechaCorta, paresDatos: paresDatos, cargarProveedores: cargarProveedores, aplicarModoDev: aplicarModoDev,
  vivo: vivo, setConsola: setConsola,
  iniciarCliente: function(){
    actual.ocupado = false; actual.pendiente = null;    // nada pendiente de una sesión anterior
    limpiarHilo(); ponerChat(null);
    renderUsuario(); aplicarModoUI(); aplicarModoDev();
    els.input.focus();
  },
  ponerModo: function(m){ applyMode(m); },
  abrirChat: function(id){ return abrirChat(id); }, nuevaConsulta: function(){ nuevaConsulta(); },
  cerrarSidebarMovil: function(){ cerrarSidebarMovil(); }, actual: function(){ return actual; },
  listado: function(){ return listadoActual; }
};

})();
