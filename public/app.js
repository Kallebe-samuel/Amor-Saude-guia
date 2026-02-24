const API = (((window.APP_CONFIG || {}).API_BASE_URL) || '').replace(/\/$/, '');
let token = null;
let user = null;
let realtimeSocket = null;
let realtimeInitialized = false;
let realtimeRefreshTimer = null;

// Global fetch wrapper: auto-attach Bearer token when available and handle 401 responses centrally
{
  const _fetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    init = init || {};
    init.headers = init.headers || {};
    try {
      if (API && typeof input === 'string' && input.startsWith('/api/')) {
        input = API + input;
      }
      const hadToken = !!token;
      const reqUrl = (typeof input === 'string') ? input : ((input && input.url) ? input.url : '');
      const isAuthLogin = reqUrl.includes('/api/auth/login');
      if (hadToken && !(init.headers && (init.headers.Authorization || init.headers.authorization))) {
        init.headers['Authorization'] = 'Bearer ' + token;
      }
      const resp = await _fetch(input, init);
      if (resp && resp.status === 401 && hadToken && !isAuthLogin) {
        // Only auto-logout/reload when there was a token (expired/invalid token case)
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        token = null; user = null;
        try { showModalMessage('Sessão expirada ou token inválido. Faça login novamente.', 'error'); } catch(e){}
        setTimeout(()=> location.reload(), 900);
      }
      return resp;
    } catch (err) {
      throw err;
    }
  };
}

const $ = sel => document.querySelector(sel);

const togglePasswordBtn = document.getElementById('togglePassword');
if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener('click', () => {
    const passwordInput = document.getElementById('password');
    if (!passwordInput) return;
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePasswordBtn.textContent = isPassword ? '🙈' : '👁';
    togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
    togglePasswordBtn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
  });
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim().toLowerCase();
  const password = $('#password').value.trim();
  if (!email || !password) return showModalMessage('Informe email e senha', 'error');
  const submitBtn = document.querySelector('#loginForm button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Entrando...'; }
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, password })
    });

    let data = {};
    try { data = await res.json(); } catch (_) { data = {}; }

    if (!res.ok) {
      return showModalMessage(data.message || 'Não foi possível fazer login', 'error');
    }
    if (!data || !data.token || !data.user) {
      return showModalMessage('Resposta de login inválida', 'error');
    }

    token = data.token; user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    showApp();
  } catch (err) {
    showModalMessage('Erro ao conectar no login: ' + (err.message || err), 'error');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar'; }
  }
});

window.addEventListener('load', () => {
  const t = localStorage.getItem('token');
  const u = localStorage.getItem('user');
  if (t && u) { token = t; user = JSON.parse(u); showApp(); }
});

function showApp(){
  $('#loginSection').classList.add('hidden');
  $('#appSection').classList.remove('hidden');
  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) logoutBtn.classList.remove('hidden');
  if (user.role !== 'gestor') document.querySelectorAll('.adminOnly').forEach(el=>el.style.display='none');
  $('#content').innerHTML = `<h3>Bem-vindo, ${escapeHtml(user.name)} (${formatRoleLabel(user.role)})</h3>`;
  setActiveNav(null);
  document.getElementById('btnNewGuia').onclick = showNewGuiaForm;
  document.getElementById('btnHistory').onclick = showHistory;
  document.getElementById('btnUsers').onclick = showUsers;
  document.getElementById('btnExecutantes').onclick = showExecutantes;
  const btnProc = document.getElementById('btnProcedimentos'); if (btnProc) btnProc.onclick = showProcedimentos;
  document.getElementById('logout').onclick = logout;
  setupRealtimeSync();
}

function setActiveNav(activeId){
  document.querySelectorAll('.nav-tab').forEach(btn=>{
    if (btn.id === activeId) btn.classList.add('is-active');
    else btn.classList.remove('is-active');
  });
}

function getActiveViewId(){
  const active = document.querySelector('.nav-tab.is-active');
  return active ? active.id : null;
}

function refreshActiveViewRealtime(){
  const activeId = getActiveViewId();
  if (!activeId) return;
  if (activeId === 'btnProcedimentos' && user && user.role === 'gestor') return showProcedimentos();
  if (activeId === 'btnExecutantes') return showExecutantes();
  if (activeId === 'btnUsers' && user && user.role === 'gestor') return showUsers();
  if (activeId === 'btnHistory') return showHistory();
}

function scheduleRealtimeRefresh(){
  if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = setTimeout(()=>{
    realtimeRefreshTimer = null;
    refreshActiveViewRealtime();
  }, 240);
}

function setupRealtimeSync(){
  if (realtimeInitialized) return;
  if (typeof window.io !== 'function') return;

  realtimeSocket = window.io(API || undefined);
  realtimeInitialized = true;

  const onDataChanged = ()=> scheduleRealtimeRefresh();
  realtimeSocket.on('procedimentos:changed', onDataChanged);
  realtimeSocket.on('executantes:changed', onDataChanged);
  realtimeSocket.on('users:changed', onDataChanged);
  realtimeSocket.on('guias:changed', onDataChanged);
}

async function showProcedimentos(){
  if (user.role !== 'gestor') return showModalMessage('Apenas gestor pode acessar procedimentos');
  setActiveNav('btnProcedimentos');
  $('#content').innerHTML = `
    <div class="card glass">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <h3 style="margin:0">Procedimentos</h3>
        <button id="btnCreateProc" class="btn btn-primary">Adicionar Procedimento</button>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <select id="procPageSizeSelect" style="width:120px"><option value="20">20 / pág</option><option value="50" selected>50 / pág</option><option value="100">100 / pág</option></select>
      </div>
      <div id="procList">Carregando...</div>
      <div class="pagination-row">
        <button id="procPrevPage" class="btn pill btn-ghost">Anterior</button>
        <div id="procPageInfo" class="muted">Página 1</div>
        <button id="procNextPage" class="btn pill btn-ghost">Próxima</button>
      </div>
    </div>
  `;
  const res = await fetch('/api/procedimentos', { headers: { Authorization: 'Bearer '+token } });
  const data = await res.json();
  if (!res.ok) return $('#procList').innerText = data.message || 'Erro';

  const allItems = Array.isArray(data) ? data.slice() : [];
  let currentPage = 1;
  let pageSize = 50;

  function renderRows(items){
    if (!items.length) return '<div>Nenhum procedimento cadastrado.</div>';
    return items.map(p=>`<div class="glass" style="padding:8px;margin:8px 0;display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(p.code||'')}</small></div><div style="display:flex;gap:6px"><button data-id="${p._id}" data-action="edit" class="btn btn-ghost">Editar</button><button data-id="${p._id}" data-action="delete" class="btn btn-ghost">Remover</button></div></div>`).join('');
  }

  function updatePagination(){
    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * pageSize;
    const pageItems = allItems.slice(start, start + pageSize);
    $('#procList').innerHTML = renderRows(pageItems);
    $('#procPageInfo').innerText = `Página ${currentPage} de ${totalPages} — ${total} itens`;

    const prev = document.getElementById('procPrevPage');
    const next = document.getElementById('procNextPage');
    if (prev){ if (currentPage <= 1){ prev.disabled = true; prev.classList.add('disabled'); } else { prev.disabled = false; prev.classList.remove('disabled'); } }
    if (next){ if (currentPage >= totalPages){ next.disabled = true; next.classList.add('disabled'); } else { next.disabled = false; next.classList.remove('disabled'); } }
  }

  document.getElementById('procList').addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (!id || !action) return;
    if (action === 'edit'){
      const p = allItems.find(x=>x._id===id);
      if (p) openProcModal(p);
      return;
    }
    if (action === 'delete'){
      const targetProc = allItems.find(x=>x._id===id);
      const procName = targetProc && targetProc.name ? targetProc.name : 'este procedimento';
      const confirmed = await showConfirmModal(`Você está prestes a apagar ${procName}. Esta ação não pode ser desfeita.`, 'Confirmar exclusão de procedimento');
      if (!confirmed) return;
      const r = await fetch('/api/procedimentos/'+id, { method:'DELETE', headers:{ Authorization:'Bearer '+token } });
      if (!r.ok) return showModalMessage('Erro ao remover');
      showModalMessage('Removido');
      showProcedimentos();
    }
  });

  document.getElementById('procPageSizeSelect').addEventListener('change', (ev)=>{ pageSize = parseInt(ev.target.value,10)||50; currentPage = 1; updatePagination(); });
  document.getElementById('procPrevPage').addEventListener('click', ()=>{ if (currentPage > 1){ currentPage--; updatePagination(); } });
  document.getElementById('procNextPage').addEventListener('click', ()=>{ const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize)); if (currentPage < totalPages){ currentPage++; updatePagination(); } });
  updatePagination();
  document.getElementById('btnCreateProc').onclick = ()=> openProcModal(null);
}

function openProcModal(proc){
  const isNew = !proc;
  const overlay = document.createElement('div'); overlay.className='modal-overlay'; overlay.id='procModal';
  overlay.innerHTML = `<div class="modal"><div class="modal-header"><strong>${isNew?'Novo Procedimento':'Editar Procedimento'}</strong><button id="closeProcModal" class="btn btn-ghost">X</button></div><div class="modal-body"><div class="form-row"><div class="label">Nome</div><input id="p_name" value="${escapeHtml(proc?proc.name:'')}" class="input-large"/><div class="label">Código (opcional)</div><input id="p_code" value="${escapeHtml(proc?proc.code:'')}" class="input-large"/></div></div><div class="modal-actions"><button id="p_cancel" class="btn btn-ghost">Cancelar</button><button id="p_save" class="btn btn-primary">Salvar</button></div></div>`;
  document.body.appendChild(overlay);
  document.getElementById('closeProcModal').onclick = ()=> overlay.remove();
  document.getElementById('p_cancel').onclick = ()=> overlay.remove();
  document.getElementById('p_save').onclick = async ()=>{
    const name = document.getElementById('p_name').value.trim();
    const code = document.getElementById('p_code').value.trim();
    if (!name) return showModalMessage('Nome do procedimento obrigatório');
    try{
      if (isNew){
        const r = await fetch('/api/procedimentos', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ name, code }) });
  const j = await r.json(); if (!r.ok) return showModalMessage(j.message||'Erro'); showModalMessage('Criado'); overlay.remove(); showProcedimentos();
      } else {
        const r = await fetch('/api/procedimentos/'+proc._id, { method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ name, code }) });
  const j = await r.json(); if (!r.ok) return showModalMessage(j.message||'Erro'); showModalMessage('Atualizado'); overlay.remove(); showProcedimentos();
      }
  }catch(e){ showModalMessage('Erro: '+(e.message||e)); }
  };
}

// Renderiza o layout padrão da guia no objeto jsPDF
async function renderStandardGuidePDF(doc, form, exec){
  // Layout A4 (mm) — margens: 12mm
  const left = 12;
  const right = 198; // A4 width 210 - 12 margin
  // cores
  const cAccent = '#2aa7b7'; // azul suave para linhas
  const cMuted = '#7f8c8d';

  // logo e cabeçalho (carregar apenas aqui para evitar duplicatas)
  let logoW = 48, logoH = 48;
  try{
    // carregar imagem e preservar proporção
    const imgBlob = await fetch('logo.png').then(r=>r.blob());
    const imgData = await new Promise(res=>{ const reader=new FileReader(); reader.onload=()=>res(reader.result); reader.readAsDataURL(imgBlob); });
    // calcular dimensões usando um elemento Image para preservar aspect ratio
    const imgEl = await new Promise((resolve,reject)=>{
      const i = new Image();
      i.onload = ()=> resolve(i);
      i.onerror = reject;
      i.src = imgData;
    });
    const maxW = 56; // mm
    const maxH = 56; // mm
    const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
    let w, h;
    if (ratio >= 1) {
      // imagem mais larga que alta: limitar pela largura
      w = maxW;
      h = +(w / ratio).toFixed(2);
      if (h > maxH) { h = maxH; w = +(h * ratio).toFixed(2); }
    } else {
      // imagem mais alta que larga: limitar pela altura
      h = maxH;
      w = +(h * ratio).toFixed(2);
      if (w > maxW) { w = maxW; h = +(w / ratio).toFixed(2); }
    }
    doc.addImage(imgData, 'PNG', left, 10, w, h);
    logoW = w; logoH = h;
  } catch(e){ /* ignore */ }
  // dar mais espaço entre logo e texto (usar largura real da logo)
  const headerTextX = left + logoW + 12;
  doc.setFontSize(16);
  doc.setFont('helvetica','bold');
  doc.setTextColor(30);
  doc.text('AmorSaúde Catalão', headerTextX, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica','normal');
  doc.setTextColor(80);
  doc.text('CNPJ: 41.096.865/0001-80', headerTextX, 24);
  doc.text('Endereço: Rua Moisés Salomão, 77 - São João - 75703-030 Catalão - GO', headerTextX, 29);
  doc.text('Atendimento: (64) 3443-1589', headerTextX, 34);
  doc.text('E-mail: catalao.go@amorsaude.com', headerTextX, 39);

  // título
  doc.setFont('helvetica','bold');
  doc.setFontSize(22);
  doc.setTextColor(20);
  doc.text('Encaminhamento', left, 66);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(formatDateTime(new Date()), right-2, 66, {align: 'right'});

  // divider (usar cor do accent)
  doc.setDrawColor(42,167,183);
  doc.setLineWidth(0.8);
  doc.line(left, 70, right, 70);

  // Paciente (nome + CPF on same row)
  doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(20);
  doc.text(form.pacienteNome.toUpperCase(), left, 82);
  // CPF next to name: label in blue, value in light gray, aligned to right
  const cpfLabel = 'CPF:';
  const cpfVal = formatCPF(form.cpf);
  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  const valWidth = doc.getTextWidth(cpfVal);
  const labelWidth = doc.getTextWidth(cpfLabel + ' ');
  const xVal = right-2 - valWidth;
  const xLabel = xVal - labelWidth;
  doc.setTextColor(42,167,183); // blue label
  doc.text(cpfLabel, xLabel, 82);
  doc.setTextColor(80); // slightly darker gray for prominence
  doc.setFont('helvetica','bold');
  doc.text(cpfVal, xVal, 82);
  // restore normal font afterwards
  doc.setFont('helvetica','normal');

  // Informações: Data de Nascimento + Idade, ID do Pagamento, Parceria, Emissão (data + hora)
  const colGap = 98;
  const col1x = left;
  const col2x = left + colGap;
  doc.setFontSize(9);
  // Atendente (label azul + value cinza)
  const atendLabel = 'Atendente:';
  const atendVal = form.atendenteNome || '';
  doc.setTextColor(42,167,183);
  doc.text(atendLabel, col1x, 94);
  const atendW = doc.getTextWidth(atendLabel + ' ');
  doc.setTextColor(120);
  doc.text(atendVal, col1x + atendW + 2, 94);
  // ID do pagamento (label blue + value gray)
  const idLabel = 'ID do Pagamento:';
  const idVal = form.idPagamento || '';
  doc.setTextColor(42,167,183);
  doc.text(idLabel, col1x, 101);
  const idLabelW = doc.getTextWidth(idLabel + ' ');
  doc.setTextColor(120);
  doc.text(idVal, col1x + idLabelW + 2, 101);
  // Parceria e Emissão with labels
  doc.setTextColor(42,167,183);
  doc.text('Parceria:', col2x, 94);
  doc.setTextColor(120);
  doc.text('CARTÃO DE TODOS', col2x + doc.getTextWidth('Parceria: ')+2, 94);
  doc.setTextColor(42,167,183);
  doc.text('Emitido em:', col2x, 101);
  doc.setTextColor(120);
  doc.text(formatDateTime(new Date()), col2x + doc.getTextWidth('Emitido em: ')+2, 101);

  const procedimentosList = normalizeProcedimentos(form.procedimentos || form.procedimento);

  // Seção Procedimentos
  doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(20);
  doc.text('Procedimentos', left, 124);
  doc.setDrawColor(200,200,200); doc.setLineWidth(0.5);
  doc.line(left, 126, right, 126);
  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(80);
  let proceduresY = 134;
  const renderedProcedures = procedimentosList.length ? procedimentosList : ['-'];
  for (const item of renderedProcedures) {
    const wrapped = doc.splitTextToSize(item, right - left - 10);
    if (!wrapped.length) continue;
    doc.text(`• ${wrapped[0]}`, left + 2, proceduresY);
    for (let i = 1; i < wrapped.length; i++) {
      proceduresY += 5;
      doc.text(wrapped[i], left + 8, proceduresY);
    }
    proceduresY += 8;
  }

  // Executante bloco (nome, endereço, contato)
  const execTop = Math.max(164, proceduresY + 4);
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(20);
  doc.text((exec.name||'EXECUTANTE').toUpperCase(), left, execTop);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  if (exec.cnpj) {
    // manter CNPJ em cinza conforme solicitado
    doc.setTextColor(120); doc.text('CNPJ: ' + exec.cnpj, left, execTop+6);
  }
  if (exec.endereco) { doc.setTextColor(120); doc.text(exec.endereco, left, execTop+12); }
  if (exec.telefone) {
    // manter Atendimento em cinza
    doc.setTextColor(120); doc.text('Atendimento: ' + exec.telefone, left, execTop+18);
  }
  if (exec.email) { doc.setTextColor(120); doc.text(exec.email, left, execTop+24); }

  // Pagamento e status (lado direito)
  const payX = left + 110;
  doc.setFontSize(10);
    // Data de Pagamento label blue + value
    doc.setTextColor(42,167,183); doc.text('Data(s) do Pagamento:', payX, execTop+12);
    const payDate = form.dataPagamento ? formatDate(form.dataPagamento) : formatDate(new Date());
    doc.setTextColor(120); doc.setFont('helvetica','bold'); doc.text(payDate, payX, execTop+18);
  // Valor a pagar próximo
  doc.setFont('helvetica','normal'); doc.setTextColor(42,167,183); doc.text('Valor a pagar no fornecedor:', payX, execTop+24);
  doc.setFont('helvetica','bold'); doc.setTextColor(120); doc.text(formatMoneyBR(form.valor), payX, execTop+30);

  // Rodapé com observações (texto solicitado)
  const observacoesTop = Math.max(196, execTop + 38);
  doc.setFontSize(8); doc.setTextColor(120);
  if (form.observacoes) {
  doc.setFontSize(9); doc.setTextColor(42,167,183);
  doc.text('Observações:', left, observacoesTop);
    // suportar múltiplas linhas
    const lines = doc.splitTextToSize(form.observacoes, right-left-4);
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(lines, left, observacoesTop + 4);
  doc.text('Documento gerado eletronicamente pelo AmorSaúde Catalão', left, observacoesTop + 4 + lines.length*4 + 6);
  } else {
  doc.text('Documento gerado eletronicamente pelo AmorSaúde Catalão', left, observacoesTop + 6);
  }

}

function logout(){ localStorage.removeItem('token'); localStorage.removeItem('user'); token=null; user=null; location.reload(); }

function validateCPF(cpf){
  cpf = cpf.replace(/\D/g,'');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  let sum=0, rem;
  for(let i=1;i<=9;i++) sum += parseInt(cpf.substring(i-1,i))*(11-i);
  rem = (sum*10)%11; if (rem===10||rem===11) rem=0; if (rem!==parseInt(cpf.substring(9,10))) return false;
  sum=0;
  for(let i=1;i<=10;i++) sum += parseInt(cpf.substring(i-1,i))*(12-i);
  rem=(sum*10)%11; if (rem===10||rem===11) rem=0; if (rem!==parseInt(cpf.substring(10,11))) return false;
  return true;
}

function calcAge(dob){ const diff = Date.now() - new Date(dob).getTime(); return Math.floor(diff / (1000*60*60*24*365.25)); }

function formatMoneyBR(v){ return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }

function normalizeProcedimentos(value){
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item)=> String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, arr)=> arr.indexOf(item) === index);
}

function normalizeSearchText(value){
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreProcedureMatch(name, query){
  const normalizedName = normalizeSearchText(name);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedName || !normalizedQuery) return -1;

  if (normalizedName === normalizedQuery) return 1000;
  if (normalizedName.startsWith(normalizedQuery)) return 900 - (normalizedName.length - normalizedQuery.length);

  const includeIndex = normalizedName.indexOf(normalizedQuery);
  if (includeIndex >= 0) return 750 - includeIndex;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  if (queryTokens.length) {
    let matchedTokens = 0;
    let positionPenalty = 0;
    queryTokens.forEach((token)=>{
      const tokenIndex = normalizedName.indexOf(token);
      if (tokenIndex >= 0) {
        matchedTokens++;
        positionPenalty += tokenIndex;
      }
    });
    if (matchedTokens === queryTokens.length) return 620 - positionPenalty;
    if (matchedTokens > 0) return 420 + (matchedTokens * 20) - positionPenalty;
  }

  let queryIndex = 0;
  for (const char of normalizedName) {
    if (char === normalizedQuery[queryIndex]) queryIndex++;
    if (queryIndex >= normalizedQuery.length) return 300;
  }

  return -1;
}

function getGuiaProcedimentosText(guia){
  const list = normalizeProcedimentos((guia && guia.procedimentos && guia.procedimentos.length) ? guia.procedimentos : guia && guia.procedimento);
  return list.join(' • ');
}

function pad(n){ return n<10? '0'+n : ''+n; }

function parseLocalDate(d){
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === 'string'){
  // aceitar apenas 'YYYY-MM-DD' sem hora como data local
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
  // se contiver tempo (ISO), preservar a hora convertendo diretamente
  return new Date(d);
  }
  return new Date(d);
}

function formatDate(d){ const dt = parseLocalDate(d); if(!dt) return ''; return [pad(dt.getDate()), pad(dt.getMonth()+1), dt.getFullYear()].join('/'); }
function formatDateTime(d){ const dt = parseLocalDate(d) || new Date(); return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()}, ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`; }
function formatCPF(raw){ if(!raw) return ''; const s = String(raw).replace(/\D/g,''); if (s.length!==11) return raw; return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }

async function fetchExecutantes(){
  try{
    const res = await fetch('/api/executantes', { headers:{ Authorization: 'Bearer '+token } });
    if (!res.ok) return [];
    const data = await res.json();
    return data;
  }catch(e){ return []; }
}

function formatCPF(cpf){
  if (!cpf) return '';
  const s = String(cpf).replace(/\D/g,'');
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function escapeHtml(str){
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]; });
}

function formatRoleLabel(role){
  if (!role) return '';
  if (role === 'gestor') return 'Gestor';
  if (role === 'recepcao') return 'Recepção';
  // fallback: capitalize first letter
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// modal breve para mensagens de ação (centralizada)
function showModalMessage(msg, type){
  // tipo: 'success' | 'error' (opcional). Se não informado, detecta por heurística no texto.
  const lower = String(msg||'').toLowerCase();
  if (!type){
    if (lower.includes('erro') || lower.includes('inválid') || lower.includes('não encontrado') || lower.includes('não pode')) type = 'error';
    else type = 'success';
  }

  const old = document.getElementById('actionToast');
  if (old) old.remove();

  const ov = document.createElement('div'); ov.id = 'actionToast'; ov.className = 'action-toast-wrap';
  const isError = type === 'error';
  const iconSVG = isError
    ? '<svg class="action-icon-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18 18 L46 46 M46 18 L18 46" stroke-width="5" stroke-linecap="round" stroke="currentColor" fill="none"/></svg>'
    : '<svg class="action-icon-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M25.6 42.1L15.2 31.7a3 3 0 0 0-4.2 4.2l12 12a3 3 0 0 0 4.2 0l26-26a3 3 0 1 0-4.2-4.2L25.6 42.1z"/></svg>';
  const statusText = isError ? 'Ação não validada.' : 'Ação validada com sucesso.';
  const reasonText = isError ? String(msg || 'Não foi possível concluir a ação.') : '';
  const detailText = !isError ? String(msg || '') : '';
  ov.innerHTML = `
    <div class="action-toast ${isError? 'error':'success'}" role="alertdialog" aria-modal="true" aria-live="assertive">
      <div class="action-icon">${iconSVG}</div>
      <div class="action-message">
        <div class="action-status">${escapeHtml(statusText)}</div>
        ${detailText ? `<div class="action-detail">${escapeHtml(detailText)}</div>` : ''}
        ${reasonText ? `<div class="action-reason">Motivo: ${escapeHtml(reasonText)}</div>` : ''}
      </div>
      <div class="action-actions">
        <button id="actionClose" class="btn btn-primary action-ok" aria-label="Fechar notificação">Ok</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  function close(){ const el = document.getElementById('actionToast'); if (el) el.remove(); }
  const closeBtn = document.getElementById('actionClose');
  if (closeBtn) closeBtn.onclick = close;
  ov.addEventListener('click', (ev)=>{ if (ev.target === ov) close(); });
}

function showConfirmModal(msg, title){
  return new Promise((resolve)=>{
    const old = document.getElementById('actionToast');
    if (old) old.remove();

    const ov = document.createElement('div');
    ov.id = 'actionToast';
    ov.className = 'action-toast-wrap';

    const heading = title || 'Confirma esta ação?';
    const iconSVG = '<svg class="action-icon-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="32" cy="32" r="22" stroke="currentColor" stroke-width="4" fill="none"/><path d="M32 20v16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="45" r="2.5" fill="currentColor"/></svg>';

    ov.innerHTML = `
      <div class="action-toast confirm" role="alertdialog" aria-modal="true" aria-live="assertive">
        <div class="action-icon">${iconSVG}</div>
        <div class="action-message">
          <div class="action-status">${escapeHtml(heading)}</div>
          <div class="action-detail">${escapeHtml(String(msg || ''))}</div>
        </div>
        <div class="action-actions">
          <button id="actionCancel" class="btn btn-ghost action-cancel">Cancelar</button>
          <button id="actionConfirm" class="btn btn-primary action-ok">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    function cleanup(result){
      document.removeEventListener('keydown', onKeyDown);
      const el = document.getElementById('actionToast');
      if (el) el.remove();
      resolve(!!result);
    }

    function onKeyDown(ev){ if (ev.key === 'Escape') cleanup(false); }

    const cancelBtn = document.getElementById('actionCancel');
    const confirmBtn = document.getElementById('actionConfirm');
    if (cancelBtn) cancelBtn.onclick = ()=> cleanup(false);
    if (confirmBtn) confirmBtn.onclick = ()=> cleanup(true);
    ov.addEventListener('click', (ev)=>{ if (ev.target === ov) cleanup(false); });
    document.addEventListener('keydown', onKeyDown);
  });
}

// Garante que a biblioteca jsPDF está carregada e retorna a classe jsPDF
async function ensureJsPDF(){
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  const urls = [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
  ];

  const tryLoad = (url) => new Promise((resolve, reject)=>{
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
      existing.addEventListener('load', ()=> {
        if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
        return reject(new Error('jsPDF carregado mas window.jspdf indefinido'));
      }, { once: true });
      existing.addEventListener('error', ()=> reject(new Error('Falha ao carregar jsPDF')), { once: true });
      return;
    }

    const s = document.createElement('script');
    s.src = url;
    s.onload = ()=>{
      if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
      return reject(new Error('jsPDF carregado mas window.jspdf indefinido'));
    };
    s.onerror = ()=> reject(new Error('Falha ao carregar jsPDF'));
    document.head.appendChild(s);
  });

  for (const url of urls) {
    try {
      const loaded = await tryLoad(url);
      if (loaded) return loaded;
    } catch (e) {}
  }

  throw new Error('Não foi possível carregar a biblioteca de PDF (jsPDF)');
}

async function showNewGuiaForm(){
  setActiveNav('btnNewGuia');
  const executantes = await fetchExecutantes();
  const options = executantes.map(e=>`<option value="${e._id}">${e.name}</option>`).join('');
  // carregar procedimentos pre-cadastrados
  const procsRes = await fetch('/api/procedimentos', { headers:{ Authorization: 'Bearer '+token } });
  const procedimentos = procsRes.ok? await procsRes.json() : [];
  $('#content').innerHTML = `
    <div class="card glass">
      <h3>Nova Guia</h3>
      <form id="guiaForm">
        <input id="pacienteNome" placeholder="Nome completo do paciente" required>
        <input id="cpf" placeholder="CPF" required>
  <!-- data de nascimento removida (não necessária no formulário) -->
        <input id="idPagamento" placeholder="ID de pagamento" required>
        <input id="valor" placeholder="Valor (ex: 123.45)" required>
  <input type="date" id="dataPagamento" value="${new Date().toISOString().slice(0,10)}">
        <div style="display:flex;gap:8px;flex-direction:column">
          <label class="label">Procedimentos (selecione ou digite livre)</label>
          <div class="proc-input-row" style="position:relative">
            <input id="procedimento_search" placeholder="Pesquisar procedimento..." autocomplete="off">
            <button type="button" id="btn_add_proc_search" class="btn btn-ghost proc-add-btn" title="Adicionar procedimento">+</button>
            <div id="proc_dropdown" class="proc-dropdown"></div>
          </div>
          <div class="proc-input-row">
            <input id="procedimento_free" placeholder="Ou digite o procedimento livre aqui (opcional)">
            <button type="button" id="btn_add_proc_free" class="btn btn-ghost proc-add-btn" title="Adicionar procedimento">+</button>
          </div>
          <div>
            <div class="label">Procedimentos adicionados</div>
            <ul id="procedimentos_list" class="proc-added-list"><li class="muted">Nenhum procedimento adicionado</li></ul>
          </div>
        </div>
        <div style="margin-top:8px"><div class="label">Observações (opcional)</div><textarea id="observacoes" placeholder="Observações para o fornecedor ou interno"></textarea></div>
        <select id="executante">${options}</select>
        <div>Parceria fixa: CARTÃO DE TODOS</div>
  <button type="submit" class="btn btn-primary btn-large">Gerar PDF</button>
      </form>
    </div>
  `;

  $('#cpf').addEventListener('blur', ()=>{ if (!validateCPF($('#cpf').value)) showModalMessage('CPF inválido'); });
  const procDropdown = document.getElementById('proc_dropdown');
  let currentProcs = procedimentos || [];
  const procedimentosCatalog = Array.isArray(procedimentos) ? procedimentos.slice() : [];
  let selectedProcedure = null;
  let selectedProcedimentos = [];

  function renderSelectedProcedimentos(){
    const listEl = document.getElementById('procedimentos_list');
    if (!listEl) return;
    if (!selectedProcedimentos.length) {
      listEl.innerHTML = '<li class="muted">Nenhum procedimento adicionado</li>';
      return;
    }
    listEl.innerHTML = selectedProcedimentos.map((item)=>`<li>${escapeHtml(item)}</li>`).join('');
  }

  function addProcedimentoValue(value){
    const clean = String(value || '').trim();
    if (!clean) return;
    if (selectedProcedimentos.includes(clean)) return;
    selectedProcedimentos.push(clean);
    renderSelectedProcedimentos();
  }

  function addFromSearch(){
    const value = selectedProcedure || $('#procedimento_search').value.trim();
    addProcedimentoValue(value);
    $('#procedimento_search').value = '';
    selectedProcedure = null;
    procDropdown.style.display = 'none';
  }

  function addFromFree(){
    const value = $('#procedimento_free').value.trim();
    addProcedimentoValue(value);
    $('#procedimento_free').value = '';
  }

  document.getElementById('btn_add_proc_search').addEventListener('click', addFromSearch);
  document.getElementById('btn_add_proc_free').addEventListener('click', addFromFree);

  $('#procedimento_search').addEventListener('keydown', (ev)=>{
    if (ev.key === 'Enter') {
      ev.preventDefault();
      addFromSearch();
    }
  });

  $('#procedimento_free').addEventListener('keydown', (ev)=>{
    if (ev.key === 'Enter') {
      ev.preventDefault();
      addFromFree();
    }
  });

  function renderProcDropdown(list){
    if (!list || !list.length) { procDropdown.style.display='none'; procDropdown.innerHTML=''; return; }
    procDropdown.innerHTML = list.map(p=>`<div class="proc-item" data-id="${p._id}">${escapeHtml(p.name)}</div>`).join('');
    procDropdown.style.display='block';
    procDropdown.querySelectorAll('.proc-item').forEach(it=>{
      it.addEventListener('click', ()=>{
        const id = it.getAttribute('data-id');
        const proc = currentProcs.find(x=>x._id===id);
        if (proc){
          document.getElementById('procedimento_search').value = proc.name;
          selectedProcedure = proc.name;
        }
        procDropdown.style.display='none';
      });
    });
  }

  $('#procedimento_search').addEventListener('input', ()=>{
    const q = $('#procedimento_search').value.trim();
    selectedProcedure = null;
    if (!q){ procDropdown.style.display='none'; return; }

    const rankedList = procedimentosCatalog
      .map((proc)=> ({ proc, score: scoreProcedureMatch(proc && proc.name, q) }))
      .filter((item)=> item.score >= 0)
      .sort((a, b)=> {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.proc && a.proc.name || '').localeCompare(String(b.proc && b.proc.name || ''), 'pt-BR');
      })
      .slice(0, 20)
      .map((item)=> item.proc);

    currentProcs = rankedList;
    renderProcDropdown(rankedList);
  });

  document.addEventListener('click', (ev)=>{
    if (!ev.target.closest || (!ev.target.closest('#procedimento_search') && !ev.target.closest('#proc_dropdown'))) procDropdown.style.display='none';
  });

  document.getElementById('guiaForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const procedimentosFinal = normalizeProcedimentos(
      selectedProcedimentos.concat([
        selectedProcedure || $('#procedimento_search').value.trim(),
        $('#procedimento_free').value.trim()
      ])
    );
  const form = {
      pacienteNome: $('#pacienteNome').value.trim(),
      cpf: $('#cpf').value.replace(/\D/g,''),
      idPagamento: $('#idPagamento').value.trim(),
  // aceitar formatos com pontos de milhar e vírgula decimal (ex: 1.234,56)
  valor: (function(v){ try{ if (!v) return 0; const cleaned = v.replace(/\./g,'').replace(/,/g,'.'); const n = parseFloat(cleaned); return isNaN(n)?0:n; }catch(e){return 0;} })($('#valor').value.trim()),
  dataPagamento: $('#dataPagamento').value,
  procedimento: procedimentosFinal[0] || '',
  procedimentos: procedimentosFinal,
  observacoes: $('#observacoes').value.trim(),
  executante: $('#executante').value
    };
  // adicionar atendente vindo do usuário logado (frontend) para render do PDF
  form.atendenteNome = user ? user.name : '';
  form.atendentePerfil = user ? user.role : '';
    // validações
  if (!form.pacienteNome || !form.cpf || !form.idPagamento || !form.valor || !form.procedimentos.length) return showModalMessage('Preencha todos os campos obrigatórios');
  if (!validateCPF(form.cpf)) return showModalMessage('CPF inválido');
  if (new Date(form.dataPagamento) > new Date()) return showModalMessage('Data de pagamento não pode ser futura');

    // primeiro salvar no backend; somente se salvar geramos o PDF
    try{
      const res = await fetch('/api/guias', { method: 'POST', headers: { 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) {
        // mostra modal amigável com a mensagem retornada (tipo error para exibir X)
        showModalMessage(data.message || 'Erro ao salvar guia', 'error');
        return;
      }
      // salvo com sucesso — agora gerar PDF
      try{
        const jsPDFClass = await ensureJsPDF();
        const doc = new jsPDFClass('p','mm','a4');
        doc.setFont('helvetica'); doc.setFontSize(12);
        const execs = await fetchExecutantes();
        const exec = execs.find(e=>e._id===form.executante) || {};
        await renderStandardGuidePDF(doc, form, exec);
        const pdfBlob = doc.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        const popup = window.open(url, '_blank');
        if (!popup) {
          const a = document.createElement('a');
          a.href = url;
          a.download = `guia-${(form.idPagamento || Date.now())}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        setTimeout(()=> URL.revokeObjectURL(url), 60_000);
      }catch(err){ showModalMessage('PDF gerado com erro: '+(err.message||err)); }
      showModalMessage('Guia gerada com sucesso');
      // atualizar histórico para refletir novo registro
      try{ if (typeof showHistory === 'function') showHistory(); }catch(e){}
    }catch(err){ showModalMessage('Erro ao salvar guia: '+(err.message||err)); }
  });
}

async function showHistory(){
  setActiveNav('btnHistory');
  // obter executantes para filtro
  const execs = await fetchExecutantes();
  const execOptions = ['<option value="">Todos os fornecedores</option>'].concat(execs.map(e=>`<option value="${e._id}">${e.name}</option>`)).join('');
  $('#content').innerHTML = `
    <div class="card glass">
      <h3>Histórico</h3>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
        <input id="filterNome" placeholder="Buscar por nome" style="flex:2;min-width:180px">
        <input id="filterCPF" placeholder="Buscar por CPF" style="width:180px">
        <select id="filterExec" style="width:260px">${execOptions}</select>
        <input type="date" id="filterStart" style="width:160px">
        <input type="date" id="filterEnd" style="width:160px">
        <select id="pageSizeSelect" style="width:120px"><option value="20">20 / pág</option><option value="50">50 / pág</option><option value="100" selected>100 / pág</option></select>
        <button id="btnFilter" class="btn btn-primary">Filtrar</button>
        <button id="btnClear" class="btn btn-ghost">Limpar</button>
      </div>
      <div id="histList">Carregando...</div>
      <div class="pagination-row">
        <button id="prevPage" class="btn pill btn-ghost">Anterior</button>
        <div id="pageInfo" class="muted">Página 1</div>
        <button id="nextPage" class="btn pill btn-ghost">Próxima</button>
      </div>
    </div>
  `;

  let allItems = [];
  let currentPage = 1;
  let pageSize = 100; // padrão

  function renderRows(items){
    if (!items || !items.length) return '<div>Nenhuma guia encontrada</div>';
    return items.map(g=>{
      const execName = g.executante && g.executante.name ? g.executante.name : '-';
      const cpfFmt = formatCPF(g.cpf || '');
      return `
        <div class="glass" style="padding:12px;margin:8px 0;display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1">
            <div style="font-weight:700">${escapeHtml(g.pacienteNome)}</div>
            <div class="muted" style="font-size:13px">CPF: ${cpfFmt} • ID: ${escapeHtml(g.idPagamento)} • ${escapeHtml(getGuiaProcedimentosText(g))}</div>
            <div class="muted" style="font-size:13px;margin-top:6px">Fornecedor: ${escapeHtml(execName)}</div>
          </div>
          <div style="text-align:right;margin-left:12px">
            <div class="muted">Emitido: ${formatDateTime(g.emitidoEm)}</div>
            <div style="font-weight:700;margin-top:8px">${formatMoneyBR(g.valor)}</div>
            <div class="muted" style="font-size:12px;margin-top:6px">Atendente: ${escapeHtml(g.atendenteNome||'')}</div>
          </div>
        </div>`;
    }).join('');
  }

  function updatePagination(){
    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * pageSize;
    const pageItems = allItems.slice(start, start + pageSize);
    $('#histList').innerHTML = renderRows(pageItems);
    $('#pageInfo').innerText = `Página ${currentPage} de ${totalPages} — ${total} itens`;
  const prev = document.getElementById('prevPage');
  const next = document.getElementById('nextPage');
  if (prev){ if (currentPage <= 1){ prev.disabled = true; prev.classList.add('disabled'); } else { prev.disabled = false; prev.classList.remove('disabled'); } }
  if (next){ if (currentPage >= totalPages){ next.disabled = true; next.classList.add('disabled'); } else { next.disabled = false; next.classList.remove('disabled'); } }
  }

  async function loadHistory(){
    const nome = $('#filterNome').value.trim();
    const cpf = $('#filterCPF').value.replace(/\D/g,'');
    const executante = $('#filterExec').value;
    const startDate = $('#filterStart').value;
    const endDate = $('#filterEnd').value;
    const qs = new URLSearchParams();
    if (nome) qs.set('nome', nome);
    if (cpf) qs.set('cpf', cpf);
    if (executante) qs.set('executante', executante);
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    $('#histList').innerText = 'Carregando...';
    const res = await fetch('/api/guias?'+qs.toString(), { headers: { Authorization: 'Bearer '+token } });
    const data = await res.json();
    if (!res.ok) return $('#histList').innerText = data.message || 'Erro';
    if (!data.length) { allItems = []; updatePagination(); return; }
    // ordenar por emitidoEm descendente (mais recente primeiro)
    data.sort((a,b)=> new Date(b.emitidoEm) - new Date(a.emitidoEm));
    allItems = data;
    currentPage = 1; // resetar para primeira página após nova busca
    updatePagination();
  }

  document.getElementById('btnFilter').onclick = loadHistory;
  document.getElementById('btnClear').onclick = ()=>{ $('#filterNome').value=''; $('#filterCPF').value=''; $('#filterExec').value=''; $('#filterStart').value=''; $('#filterEnd').value=''; loadHistory(); };
  document.getElementById('pageSizeSelect').addEventListener('change', (ev)=>{ pageSize = parseInt(ev.target.value,10)||100; currentPage = 1; updatePagination(); });
  document.getElementById('prevPage').addEventListener('click', ()=>{ if (currentPage>1){ currentPage--; updatePagination(); } });
  document.getElementById('nextPage').addEventListener('click', ()=>{ const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize)); if (currentPage < totalPages){ currentPage++; updatePagination(); } });
  // carregar inicialmente
  loadHistory();
}

async function showUsers(){
  if (user.role !== 'gestor') return showModalMessage('Apenas gestor pode acessar usuários');
  setActiveNav('btnUsers');
  $('#content').innerHTML = '<div class="card glass"><h3>Usuários</h3><div id="userList">Carregando...</div><button id="btnCreateUser" class="btn btn-primary">Criar Usuário</button></div>';
  const res = await fetch('/api/users', { headers: { Authorization: 'Bearer '+token } });
  const data = await res.json();
  if (!res.ok) return $('#userList').innerText = data.message || 'Erro';
  const rows = data.map(u=>{
    const roleLabel = u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : '';
    return `
      <div class="glass" style="padding:8px;margin:8px 0;display:flex;justify-content:space-between;align-items:center">
        <div><strong>${escapeHtml(u.name)}</strong><br><small>${escapeHtml(u.email)} • ${escapeHtml(roleLabel)}</small></div>
        <div style="display:flex;gap:8px">
          <button data-id="${u._id}" class="btn btn-ghost btn-small btnEditUser">Editar</button>
          <button data-id="${u._id}" class="btn btn-ghost btn-small btn-danger-ghost btnDeleteUser">Remover</button>
        </div>
      </div>`;
  }).join('');
  $('#userList').innerHTML = rows;
  document.querySelectorAll('.btnEditUser').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const id = ev.target.getAttribute('data-id');
      const target = data.find(x=>x._id===id);
      if (!target) return showModalMessage('Usuário não encontrado');
      openUserModal(target);
    });
  });
  document.querySelectorAll('.btnDeleteUser').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const id = ev.target.getAttribute('data-id');
      const target = data.find(x=>x._id===id);
      if (!target) return showModalMessage('Usuário não encontrado', 'error');
      if (String(target._id) === String(user.id)) return showModalMessage('Você não pode remover o usuário logado', 'error');
      const confirmed = await showConfirmModal(`Você está prestes a apagar o usuário ${target.name}. Esta ação não pode ser desfeita.`, 'Confirmar exclusão de usuário');
      if (!confirmed) return;
      try {
        const r = await fetch(`/api/users/${id}`, { method:'DELETE', headers: { Authorization: 'Bearer '+token } });
        const j = await r.json();
        if (!r.ok) return showModalMessage(j.message || 'Erro ao remover usuário', 'error');
        showModalMessage('Usuário removido com sucesso', 'success');
        showUsers();
      } catch (err) {
        showModalMessage('Erro ao remover usuário', 'error');
      }
    });
  });
  document.getElementById('btnCreateUser').onclick = async ()=>{ openUserModal(null); };
}

function closeUserModal(){ const el = document.getElementById('userModalOverlay'); if (el) el.remove(); }

function openUserModal(target){
  // target == null => criar novo; target == user object => editar
  const isNew = !target;
  const overlay = document.createElement('div'); overlay.id = 'userModalOverlay'; overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header"><strong>${isNew? 'Criar Usuário' : 'Editar Usuário'}</strong><button id="closeUserModal" class="btn btn-ghost">X</button></div>
      <div class="modal-body">
        <div class="form-row two-col">
          <div class="col"><div class="label">Nome</div><input id="mu_name" class="input-large" value="${escapeHtml(isNew? '': target.name)}"/></div>
          <div class="col"><div class="label">Email</div><input id="mu_email" class="input-large" value="${escapeHtml(isNew? '': target.email)}" ${isNew? '':'disabled'} /></div>
          <div class="col"><div class="label">Senha ${isNew? 'inicial' : '(deixe em branco para não alterar)'}</div><input id="mu_password" type="password" class="input-large"/></div>
          <div class="col"><div class="label">Perfil</div><select id="mu_role"><option value="recepcao">Recepção</option><option value="gestor">Gestor</option></select></div>
        </div>
      </div>
      <div class="modal-actions">
        <button id="mu_cancel" class="btn btn-ghost">Cancelar</button>
        <button id="mu_save" class="btn btn-primary">${isNew? 'Criar' : 'Salvar'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('closeUserModal').onclick = closeUserModal;
  document.getElementById('mu_cancel').onclick = closeUserModal;
  // set role select to current value
  if (!isNew){
    document.getElementById('mu_role').value = target.role || 'recepcao';
  }
  document.getElementById('mu_save').onclick = async ()=>{
    const name = document.getElementById('mu_name').value.trim();
    const email = document.getElementById('mu_email').value.trim();
    const password = document.getElementById('mu_password').value.trim();
    const role = document.getElementById('mu_role').value;
    if (!name || (!email && isNew)) return showModalMessage('Preencha todos os campos');
    try{
      if (isNew){
        const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify({ name,email,password,role }) });
        const j = await r.json();
        if (!r.ok) return showModalMessage(j.message||'Erro');
        showModalMessage('Usuário criado'); closeUserModal(); showUsers();
      } else {
        const payload = { name, role };
        if (password) payload.password = password;
        const r = await fetch(`/api/users/${target._id}`, { method: 'PUT', headers: { 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify(payload) });
        const j = await r.json();
        if (!r.ok) return showModalMessage(j.message||'Erro');
        showModalMessage('Usuário atualizado'); closeUserModal(); showUsers();
      }
    } catch(err){ showModalMessage('Erro: '+(err.message||err)); }
  };
}

async function showExecutantes(){
  setActiveNav('btnExecutantes');
  // Listagem com botão de edição e botão criar (gestor)
  $('#content').innerHTML = '<div class="card glass"><h3>Executantes</h3><div id="execList">Carregando...</div><div style="margin-top:8px"><button id="btnCreateExec" class="btn btn-primary">Adicionar Executante</button></div></div>';
  const res = await fetch('/api/executantes', { headers: { Authorization: 'Bearer '+token } });
  const data = await res.json();
  if (!res.ok) return $('#execList').innerText = data.message || 'Erro';

  if (!data.length) {
    $('#execList').innerHTML = '<div>Nenhum executante cadastrado.</div>';
  } else {
    const rows = data.map(e=>{
      return `
        <div class="glass" style="padding:8px;margin:8px 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${e.name}</strong><br>
            <small>CNPJ: ${e.cnpj||'-'} • Tel: ${e.telefone||'-'} • Email: ${e.email||'-'}</small>
            <div style="margin-top:6px;">${e.razaoSocial?'<em>'+e.razaoSocial+'</em>':''}</div>
            <div style="margin-top:6px;color:#666">${e.endereco||''}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button data-id="${e._id}" class="btn btn-ghost btn-small btnEditExec">Editar</button>
            <button data-id="${e._id}" class="btn btn-ghost btn-small btn-danger-ghost btnDeleteExec">Remover</button>
          </div>
        </div>`;
    }).join('');
    $('#execList').innerHTML = rows;

    document.querySelectorAll('.btnEditExec').forEach(b=>{
      b.addEventListener('click', async (ev)=>{
        const id = ev.target.getAttribute('data-id');
        const exec = data.find(x=>x._id===id);
        if (!exec) return showModalMessage('Executante não encontrado');
        openExecutanteEditor(exec);
      });
    });
    document.querySelectorAll('.btnDeleteExec').forEach(b=>{
      b.addEventListener('click', async (ev)=>{
        const id = ev.target.getAttribute('data-id');
        const exec = data.find(x=>x._id===id);
        if (!exec) return showModalMessage('Executante não encontrado', 'error');
        const confirmed = await showConfirmModal(`Você está prestes a apagar o executante ${exec.name}. Esta ação não pode ser desfeita.`, 'Confirmar exclusão de executante');
        if (!confirmed) return;
        try {
          const r = await fetch(`/api/executantes/${id}`, { method:'DELETE', headers: { Authorization: 'Bearer '+token } });
          const j = await r.json();
          if (!r.ok) return showModalMessage(j.message || 'Erro ao remover executante', 'error');
          showModalMessage('Executante removido com sucesso', 'success');
          showExecutantes();
        } catch (err) {
          showModalMessage('Erro ao remover executante', 'error');
        }
      });
    });
  }

  document.getElementById('btnCreateExec').onclick = async ()=>{
    if (user.role !== 'gestor') return showModalMessage('Apenas gestor pode adicionar executantes');
    openExecutanteEditor(null);
  };
}

function openExecutanteEditor(exec){
  // exec null = create
  const isNew = !exec;
  const id = exec? exec._id : '';
  const name = exec? exec.name : '';
  const razao = exec? exec.razaoSocial || '' : '';
  const cnpj = exec? exec.cnpj || '' : '';
  const tel = exec? exec.telefone || '' : '';
  const email = exec? exec.email || '' : '';
  const endereco = exec? exec.endereco || '' : '';

  $('#content').innerHTML = `
    <div class="card glass">
      <h3>${isNew? 'Novo Executante' : 'Editar Executante'}</h3>
      <form id="execForm">
        <input id="exec_name" placeholder="Nome da clínica" value="${escapeHtml(name)}" required>
        <input id="exec_razao" placeholder="Razão Social" value="${escapeHtml(razao)}">
        <input id="exec_cnpj" placeholder="CNPJ" value="${escapeHtml(cnpj)}">
        <input id="exec_tel" placeholder="Telefone" value="${escapeHtml(tel)}">
        <input id="exec_email" placeholder="Email" value="${escapeHtml(email)}">
        <textarea id="exec_endereco" placeholder="Endereço">${escapeHtml(endereco)}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button type="submit" class="btn btn-primary">Salvar</button>
          <button type="button" id="cancelExec" class="btn btn-ghost">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('cancelExec').onclick = ()=> showExecutantes();

  document.getElementById('execForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const payload = {
      name: document.getElementById('exec_name').value.trim(),
      razaoSocial: document.getElementById('exec_razao').value.trim(),
      cnpj: document.getElementById('exec_cnpj').value.trim(),
      telefone: document.getElementById('exec_tel').value.trim(),
      email: document.getElementById('exec_email').value.trim(),
      endereco: document.getElementById('exec_endereco').value.trim()
    };

    try{
      if (isNew){
        const r = await fetch('/api/executantes', { method: 'POST', headers: { 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify(payload) });
        const j = await r.json();
  if (!r.ok) return showModalMessage(j.message || 'Erro ao criar executante');
  showModalMessage('Executante criado');
  showExecutantes();
      } else {
        const r = await fetch(`/api/executantes/${id}`, { method: 'PUT', headers: { 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify(payload) });
        const j = await r.json();
  if (!r.ok) return showModalMessage(j.message || 'Erro ao atualizar executante');
  showModalMessage('Executante atualizado');
  showExecutantes();
      }
    } catch(err){
      showModalMessage('Erro: '+(err.message||err));
    }
  });
}

function escapeHtml(str){
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// tema
// tema: persistência e default para dark
function applyTheme(t){ if (t==='dark') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); }
function setThemeButtonLabel(t){
  const btn = document.getElementById('toggleTheme');
  if (!btn) return;
  const label = (t === 'dark') ? 'Escuro' : 'Claro';
  btn.setAttribute('title', `Tema atual: ${label}`);
  btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
  // move knob by toggling dark class on documentElement (visual movement handled by CSS)
  // ensure SVG icons remain and we don't overwrite innerHTML
}

const savedTheme = localStorage.getItem('theme');
if (!savedTheme) { applyTheme('dark'); localStorage.setItem('theme','dark'); setThemeButtonLabel('dark'); } else { applyTheme(savedTheme); setThemeButtonLabel(savedTheme); }
document.getElementById('toggleTheme').addEventListener('click', ()=>{
  const isNowDark = document.documentElement.classList.toggle('dark');
  const now = isNowDark ? 'dark' : 'light';
  localStorage.setItem('theme', now);
  setThemeButtonLabel(now);
});
