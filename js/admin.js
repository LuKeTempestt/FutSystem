/* ============================================
   Painel Administrativo - Logica completa
   Usa Data (API + localStorage fallback)
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
  await Data.detectarModo();
  if (Data.isLogged()) {
    // Verifica se e admin de verdade
    const user = Data.getUser();
    if (user && user.role !== 'admin') {
      // Usuario logado mas nao e admin
      mostrarAcessoNegado();
      return;
    }
    mostrarAdmin();
  } else {
    mostrarLogin();
  }
  inicializarEventos();
  exibirModoConexao();
});

function mostrarAcessoNegado() {
  const tela = document.getElementById('loginScreen');
  tela.hidden = false;
  document.getElementById('adminLayout').hidden = true;
  const card = tela.querySelector('.login-card');
  if (card) {
    card.innerHTML = `
      <div class="login-logo" style="background: #C62828;" aria-hidden="true">🚫</div>
      <h1>Acesso restrito</h1>
      <p class="login-sub">Você está logado como <strong>${(Data.getUser()?.username) || 'usuário'}</strong>, mas só administradores podem acessar este painel.</p>
      <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 22px;">
        <a href="../minha-area.html" class="btn btn-primary">Ir para minha área</a>
        <button class="btn btn-outline" id="btnSairNeg">Sair e entrar como admin</button>
      </div>
    `;
    document.getElementById('btnSairNeg').addEventListener('click', async () => {
      await Data.logout();
      location.reload();
    });
  }
}

function exibirModoConexao() {
  const modo = Data.modoSincrono();
  const txt = modo === 'api' ? '🟢 Backend conectado' : '🟡 Modo offline (localStorage)';
  const el = document.querySelector('.sidebar-footer');
  if (el) el.insertAdjacentHTML('afterbegin', `<div style="font-size: 12px; margin-bottom: 8px;">${txt}</div>`);
}

function mostrarLogin() {
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('adminLayout').hidden = true;
}

function mostrarAdmin() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('adminLayout').hidden = false;
  trocarSecao('dashboard');
}

function inicializarEventos() {
  document.getElementById('formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    const r = await Data.login(user, pass);
    if (r && r.ok) {
      if (r.role !== 'admin') {
        document.getElementById('loginErr').textContent =
          'Esta conta é de usuário comum. Use credenciais de administrador para entrar no painel.';
        document.getElementById('loginErr').classList.add('show');
        await Data.logout();
        return;
      }
      mostrarAdmin();
    } else {
      document.getElementById('loginErr').textContent =
        (r && r.message) || 'Usuário ou senha inválidos. Tente novamente.';
      document.getElementById('loginErr').classList.add('show');
    }
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await Data.logout();
    location.reload();
  });

  document.querySelectorAll('[data-section]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      trocarSecao(a.dataset.section);
    });
  });

  document.getElementById('btnExportarCSV').addEventListener('click', exportarCSV);
  document.getElementById('btnNovaInscricao').addEventListener('click', () => {
    window.open('../inscricao.html', '_blank');
  });
  document.getElementById('buscaInscricao').addEventListener('input', renderInscricoes);
  document.getElementById('filtroGrupo').addEventListener('change', renderInscricoes);

  document.getElementById('btnDistribuirAleatorio').addEventListener('click', () => {
    confirmarAcao('Distribuir aleatoriamente?', 'Isso vai reorganizar todos os participantes entre os grupos. Continuar?', async () => {
      try {
        await Data.distribuirAleatorio();
        AppUtils.showToast('Distribuicao concluida!');
        await renderGruposAdmin();
        await renderDistribuicaoManual();
      } catch (err) {
        AppUtils.showToast(err.message, 'error');
      }
    });
  });
  document.getElementById('btnGerarPartidas').addEventListener('click', () => {
    confirmarAcao('Gerar partidas da fase de grupos?', 'Isso vai criar todas as partidas (todos contra todos) e apagar partidas existentes. Continuar?', async () => {
      try {
        await Data.gerarPartidasGrupos();
        AppUtils.showToast('Partidas geradas!');
        trocarSecao('partidas');
      } catch (err) {
        AppUtils.showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('filtroPartidaStatus').addEventListener('change', renderPartidasAdmin);
  document.getElementById('filtroPartidaFase').addEventListener('change', renderPartidasAdmin);
  document.getElementById('filtroPartidaInscrito').addEventListener('change', renderPartidasAdmin);
  // Busca por texto com debounce leve pra evitar re-render a cada tecla
  let _buscaTimer;
  document.getElementById('filtroPartidaBusca').addEventListener('input', () => {
    clearTimeout(_buscaTimer);
    _buscaTimer = setTimeout(renderPartidasAdmin, 150);
  });
  document.getElementById('btnLimparFiltrosPartidas').addEventListener('click', () => {
    document.getElementById('filtroPartidaBusca').value = '';
    document.getElementById('filtroPartidaInscrito').value = '';
    document.getElementById('filtroPartidaStatus').value = '';
    document.getElementById('filtroPartidaFase').value = '';
    renderPartidasAdmin();
  });

  document.getElementById('cancelPartida').addEventListener('click', () => fecharModal('modalPartida'));
  document.getElementById('formPartida').addEventListener('submit', async e => {
    e.preventDefault();
    const id = Number(document.getElementById('formPartida').dataset.partidaId);
    const a = document.getElementById('placarA').value;
    const b = document.getElementById('placarB').value;
    try {
      await Data.registrarPlacar(id, a, b);
      fecharModal('modalPartida');
      AppUtils.showToast('Resultado registrado!');
      await renderPartidasAdmin();
      await renderDashboard();
    } catch (err) {
      AppUtils.showToast(err.message, 'error');
    }
  });

  document.getElementById('btnGerarChaveamento').addEventListener('click', gerarChaveamento);

  document.getElementById('formFairPlay').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = document.getElementById('fpNome').value.trim();
    const motivo = document.getElementById('fpMotivo').value.trim();
    try {
      await Data.setFairPlay({ nome, motivo });
      AppUtils.showToast('Premio Fair Play salvo!');
      await renderDashboard();
    } catch (err) {
      AppUtils.showToast(err.message, 'error');
    }
  });

  document.getElementById('formConfig').addEventListener('submit', e => {
    e.preventDefault();
    salvarConfig();
  });

  document.getElementById('btnResetar').addEventListener('click', () => {
    confirmarAcao('Resetar tudo?', 'Isso APAGA inscricoes, grupos, partidas e Fair Play. Esta acao nao pode ser desfeita. Tem certeza?', async () => {
      await Data.resetTudo();
      AppUtils.showToast('Dados resetados.', 'success');
      setTimeout(() => location.reload(), 600);
    });
  });

  document.getElementById('modalCancel').addEventListener('click', () => fecharModal('modalConfirma'));

  // Forms de criar admin / novo grupo (so vinculam, executam quando entrar)
  inicializarFormNovoAdmin();
  inicializarFormNovoGrupo();
}

// Polling do admin: re-renderiza periodicamente as secoes 'dinamicas'
// (partidas, dashboard, chaveamento) para que mudancas feitas por outro
// admin no mesmo evento apareçam sem precisar recarregar a pagina.
let _intervalAdmin = null;
const SECOES_COM_POLLING = new Set(['dashboard', 'partidas', 'chaveamento', 'classificacao']);
const POLLING_INTERVALO_MS = 10000;

async function trocarSecao(nome) {
  document.querySelectorAll('[data-section]').forEach(a => {
    a.classList.toggle('active', a.dataset.section === nome);
  });
  document.querySelectorAll('[data-section-content]').forEach(s => {
    s.hidden = s.dataset.sectionContent !== nome;
  });

  // Para polling anterior (mudou de secao)
  if (_intervalAdmin) {
    clearInterval(_intervalAdmin);
    _intervalAdmin = null;
  }

  switch (nome) {
    case 'dashboard': await renderDashboard(); break;
    case 'inscricoes': await popularFiltroGrupos(); await renderInscricoes(); break;
    case 'grupos':
      await popularSelecaoNovoGrupo();
      await renderGruposAdmin();
      await renderDistribuicaoManual();
      break;
    case 'partidas': await renderPartidasAdmin(); break;
    case 'chaveamento': await renderStatusFaseGrupos(); await renderChaveamentoAtual(); break;
    case 'fairplay': await preencherFairPlay(); break;
    case 'classificacao': await renderClassificacaoAdmin(); break;
    case 'admins': await renderAdmins(); break;
    case 'config': await preencherConfig(); break;
  }

  // Indicador visual de polling ativo
  const indicador = document.getElementById('indicadorPolling');
  if (indicador) indicador.style.display = SECOES_COM_POLLING.has(nome) ? 'block' : 'none';

  // Inicia polling se a secao for "dinamica"
  if (SECOES_COM_POLLING.has(nome)) {
    _intervalAdmin = setInterval(async () => {
      if (document.hidden) return; // poupa recursos quando aba em background
      try {
        if (nome === 'dashboard') await renderDashboard();
        else if (nome === 'partidas') await renderPartidasAdmin();
        else if (nome === 'chaveamento') {
          await renderStatusFaseGrupos();
          await renderChaveamentoAtual();
        }
        else if (nome === 'classificacao') await renderClassificacaoAdmin();
      } catch (_) { /* silencia erro temporario */ }
    }, POLLING_INTERVALO_MS);
  }
}

// ============== ADMINISTRADORES ==============
async function renderAdmins() {
  try {
    const admins = await Api.listarUsuarios('admin');
    const users = await Api.listarUsuarios('user');
    const meuId = Data.getUser() ? null : null;
    // Pegar id do admin logado via /auth/me
    let meuUserId = null;
    try { const me = await Api.me(); meuUserId = me.id; } catch (_) {}

    document.getElementById('badgeQtdAdmins').textContent = admins.length;
    document.getElementById('badgeQtdUsers').textContent = users.length;

    document.getElementById('tabelaAdmins').innerHTML = admins.map(a => `
      <tr>
        <td><strong>${escapeHtml(a.username)}</strong>${a.id === meuUserId ? ' <span class="badge-pill" style="font-size: 11px;">você</span>' : ''}</td>
        <td>${new Date(a.criado_em).toLocaleDateString('pt-BR')}</td>
        <td><span class="badge-pill done">${a.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td>
          ${a.id !== meuUserId
            ? `<button class="btn btn-sm btn-danger" data-del-user="${a.id}">🗑️ Remover</button>`
            : '<span style="color: var(--texto-medio); font-size: 13px;">—</span>'}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--texto-medio);">Sem admins.</td></tr>';

    document.getElementById('tabelaUsers').innerHTML = users.length
      ? users.map(u => `
          <tr>
            <td><code>${escapeHtml(u.username)}</code></td>
            <td>${u.inscricao_id ? '#' + u.inscricao_id : '—'}</td>
            <td>${new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--texto-medio);">Nenhum usuário cadastrado ainda.</td></tr>';

    document.querySelectorAll('[data-del-user]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = Number(b.dataset.delUser);
        confirmarAcao('Excluir administrador?', 'Tem certeza? Essa conta perderá o acesso imediatamente.', async () => {
          try {
            await Api.excluirUsuario(id);
            AppUtils.showToast('Administrador removido.');
            await renderAdmins();
          } catch (err) {
            AppUtils.showToast(err.message, 'error');
          }
        });
      });
    });
  } catch (err) {
    document.getElementById('tabelaAdmins').innerHTML =
      `<tr><td colspan="4">Erro: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// ============== GESTAO DE GRUPOS — adicionar nova selecao ==============
async function popularSelecaoNovoGrupo() {
  const select = document.getElementById('selectNovoGrupo');
  if (!select) return;
  const grupos = await Data.listGrupos();
  const nomesExistentes = new Set(grupos.map(g => g.nome.toLowerCase()));
  const selecoes = AppUtils.selecoesDisponiveis();
  // Filtra: so mostra selecoes que ainda nao foram adicionadas
  const disponiveis = selecoes.filter(s => !nomesExistentes.has(s.nome.toLowerCase()));

  if (disponiveis.length === 0) {
    select.innerHTML = '<option value="">Todas as seleções já estão no campeonato</option>';
    select.disabled = true;
  } else {
    select.disabled = false;
    select.innerHTML = '<option value="">— Escolha uma seleção —</option>' +
      disponiveis.map(s => `<option value="${escapeHtml(s.nome)}">${escapeHtml(s.nome)}</option>`).join('');
  }
}

function inicializarFormNovoGrupo() {
  const form = document.getElementById('formNovoGrupo');
  if (!form || form.dataset.inited) return;
  form.dataset.inited = '1';

  const select = document.getElementById('selectNovoGrupo');
  const preview = document.getElementById('previewBandeira');
  const erro = document.getElementById('erroNovoGrupo');

  // Atualiza preview da bandeira quando muda a seleção
  select.addEventListener('change', () => {
    const nome = select.value;
    if (nome) {
      preview.innerHTML = AppUtils.bandeiraSvg(nome, 'flag-inline');
    } else {
      preview.innerHTML = '<span style="color: var(--texto-medio); font-size: 13px;">—</span>';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.classList.remove('show');
    const nome = select.value.trim();
    if (!nome) {
      erro.textContent = 'Escolha uma seleção da lista.';
      erro.classList.add('show');
      return;
    }
    try {
      const cor = AppUtils.normalizarChaveGrupo(nome);
      await Api.criarGrupo({ nome, cor, embaixador: '' });
      AppUtils.showToast(`Grupo ${nome} adicionado!`);
      select.value = '';
      preview.innerHTML = '<span style="color: var(--texto-medio); font-size: 13px;">—</span>';
      await popularSelecaoNovoGrupo();
      await renderGruposAdmin();
      await renderDistribuicaoManual();
    } catch (err) {
      erro.textContent = err.message;
      erro.classList.add('show');
    }
  });
}

// ============== CLASSIFICACAO (admin) ==============
async function renderClassificacaoAdmin() {
  const wrap = document.getElementById('classificacaoAdmin');
  if (!wrap) return;
  const grupos = await Data.listGrupos();
  if (grupos.length === 0) {
    wrap.innerHTML = '<p class="empty-state">Nenhum grupo configurado.</p>';
    return;
  }
  const blocos = await Promise.all(grupos.map(async g => {
    const tabela = await Data.classificacaoGrupo(g.id);
    if (tabela.length === 0) {
      return `
        <div class="admin-card" style="margin-bottom: 16px;">
          <h2 style="display: flex; align-items: center; gap: 10px;">
            ${AppUtils.bandeiraSvg(g.nome, 'flag-inline')}
            Grupo ${escapeHtml(g.nome)}
          </h2>
          <p class="empty-state">Sem participantes neste grupo ainda.</p>
        </div>`;
    }
    const linhas = tabela.map((t, i) => `
      <tr class="${i < 2 ? 'qualified' : ''}">
        <td>${i + 1}. ${escapeHtml(t.nome)}</td>
        <td style="text-align: center; font-weight: 700;">${t.pts}</td>
        <td style="text-align: center;">${t.pj}</td>
        <td style="text-align: center;">${t.v}</td>
        <td style="text-align: center;">${t.e}</td>
        <td style="text-align: center;">${t.d}</td>
        <td style="text-align: center;">${t.gp}</td>
        <td style="text-align: center;">${t.gc}</td>
        <td style="text-align: center; font-weight: 600;">${t.sg > 0 ? '+' : ''}${t.sg}</td>
      </tr>
    `).join('');
    return `
      <div class="admin-card" style="margin-bottom: 16px;">
        <h2 style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
          ${AppUtils.bandeiraSvg(g.nome, 'flag-inline')}
          Grupo ${escapeHtml(g.nome)}
        </h2>
        <div style="overflow-x: auto;">
          <table class="standings-table">
            <thead>
              <tr>
                <th style="min-width: 140px;">Jogador</th>
                <th>Pts</th>
                <th>PJ</th>
                <th>V</th>
                <th>E</th>
                <th>D</th>
                <th>GP</th>
                <th>GC</th>
                <th>SG</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      </div>`;
  }));
  wrap.innerHTML = blocos.join('');
}

function inicializarFormNovoAdmin() {
  const form = document.getElementById('formNovoAdmin');
  if (!form || form.dataset.inited) return;
  form.dataset.inited = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('erroNovoAdmin');
    erro.classList.remove('show');
    const user = document.getElementById('novoAdminUser').value.trim();
    const senha = document.getElementById('novoAdminSenha').value;
    try {
      await Api.criarAdmin(user, senha);
      AppUtils.showToast(`Administrador "${user}" criado!`);
      form.reset();
      await renderAdmins();
    } catch (err) {
      erro.textContent = err.message;
      erro.classList.add('show');
    }
  });
}

// ============== DASHBOARD ==============
async function renderDashboard() {
  const inscricoes = await Data.listInscricoes();
  const grupos = await Data.listGrupos();
  const partidas = await Data.listPartidas();
  const concluidas = partidas.filter(p => p.status === 'concluida').length;
  const pendentes = partidas.length - concluidas;
  const semGrupo = inscricoes.filter(i => !i.grupo).length;

  const stats = [
    { label: 'Inscritos', valor: inscricoes.length, hint: 'Total de participantes', tipo: 'success' },
    { label: 'Grupos ativos', valor: grupos.length, hint: 'Selecoes disponiveis', tipo: '' },
    { label: 'Sem grupo', valor: semGrupo, hint: 'Aguardando distribuicao', tipo: semGrupo > 0 ? 'warning' : 'success' },
    { label: 'Partidas concluidas', valor: concluidas, hint: 'Resultados registrados', tipo: 'success' },
    { label: 'Partidas pendentes', valor: pendentes, hint: 'Aguardando resultado', tipo: pendentes > 0 ? 'warning' : 'success' }
  ];

  document.getElementById('statGrid').innerHTML = stats.map(s => `
    <div class="stat-card ${s.tipo}">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.valor}</div>
      <div class="stat-hint">${s.hint}</div>
    </div>
  `).join('');

  const alertas = [];
  if (inscricoes.length === 0) alertas.push('Nenhuma inscrição cadastrada ainda. Compartilhe o link de inscrição com os participantes.');
  if (semGrupo > 0) alertas.push(`${semGrupo} participante(s) sem grupo. Vá em <a href="#grupos" data-section="grupos">Grupos</a> para distribuir.`);
  if (partidas.length === 0 && inscricoes.length > 0) alertas.push('Inscrições prontas, mas as partidas ainda não foram geradas. Vá em Grupos.');
  if (pendentes > 0 && pendentes === partidas.length && partidas.length > 0) alertas.push(`Há ${pendentes} partidas aguardando registro de resultado.`);

  const alertasEl = document.getElementById('alertas');
  if (alertas.length === 0) {
    alertasEl.innerHTML = '<p style="color: var(--verde-escuro);">✅ Tudo em ordem!</p>';
  } else {
    alertasEl.innerHTML = '<ul style="list-style: disc; padding-left: 22px; color: var(--texto-medio);">' +
      alertas.map(a => `<li style="margin-bottom: 8px;">${a}</li>`).join('') +
      '</ul>';
    alertasEl.querySelectorAll('[data-section]').forEach(a => {
      a.addEventListener('click', e => { e.preventDefault(); trocarSecao(a.dataset.section); });
    });
  }

  const fp = await Data.getFairPlay();
  document.getElementById('fairPlayResumo').innerHTML = fp && fp.nome
    ? `<div style="display: flex; align-items: center; gap: 14px;"><div style="font-size: 40px;">🏅</div><div><strong>${escapeHtml(fp.nome)}</strong><p style="margin:4px 0 0; color: var(--texto-medio);">${escapeHtml(fp.motivo)}</p></div></div>`
    : '<p style="color: var(--texto-medio);">Ainda nao ha vencedor registrado.</p>';
}

// ============== INSCRICOES ==============
async function popularFiltroGrupos() {
  const sel = document.getElementById('filtroGrupo');
  const grupos = await Data.listGrupos();
  const valorAtual = sel.value;
  sel.innerHTML = '<option value="">Todos os grupos</option>' +
    '<option value="__semgrupo">Sem grupo</option>' +
    grupos.map(g => `<option value="${g.id}">${escapeHtml(g.nome)}</option>`).join('');
  sel.value = valorAtual;
}

async function renderInscricoes() {
  const inscricoes = await Data.listInscricoes();
  const grupos = await Data.listGrupos();
  const busca = document.getElementById('buscaInscricao').value.toLowerCase().trim();
  const filtroG = document.getElementById('filtroGrupo').value;

  let lista = inscricoes.filter(i => {
    if (busca && !(i.nome.toLowerCase().includes(busca) || String(i.whatsapp).includes(busca))) return false;
    if (filtroG === '__semgrupo' && i.grupo) return false;
    if (filtroG && filtroG !== '__semgrupo' && String(i.grupo) !== String(filtroG)) return false;
    return true;
  });

  const tbody = document.getElementById('tabelaInscricoes');
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--texto-medio);">Nenhuma inscricao encontrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(i => {
    const grupo = grupos.find(g => g.id === i.grupo);
    return `
      <tr>
        <td><strong>${escapeHtml(i.nome)}</strong></td>
        <td>${AppUtils.calcularIdade(i.nascimento)} anos</td>
        <td>${escapeHtml(i.responsavel || '-')}</td>
        <td>${formatarWhats(i.whatsapp)}</td>
        <td>${grupo
          ? `<span class="badge-pill" style="display: inline-flex; align-items: center; gap: 6px;">${AppUtils.bandeiraSvg(grupo.nome, 'flag-mini')} ${escapeHtml(grupo.nome)}</span>`
          : '<span class="badge-pill pending">Sem grupo</span>'}</td>
        <td>
          <button class="btn btn-sm btn-danger" data-del="${i.id}">🗑️</button>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', async () => {
      const id = Number(b.dataset.del);
      const ins = (await Data.listInscricoes()).find(x => x.id === id);
      confirmarAcao('Excluir inscricao?', `Tem certeza que deseja excluir a inscricao de ${ins?.nome || '?'} ?`, async () => {
        try {
          await Data.deleteInscricao(id);
          AppUtils.showToast('Inscricao removida.');
          await renderInscricoes();
          await renderDashboard();
        } catch (err) {
          AppUtils.showToast(err.message, 'error');
        }
      });
    });
  });
}

async function exportarCSV() {
  const lista = await Data.listInscricoes();
  if (lista.length === 0) {
    AppUtils.showToast('Nenhuma inscricao para exportar.', 'error');
    return;
  }
  const grupos = await Data.listGrupos();
  const linhas = [
    ['Nome','Idade','Data Nasc.','Responsavel','WhatsApp','Como soube','Superpoder','Grupo','Inscrito em']
  ];
  lista.forEach(i => {
    const g = grupos.find(x => x.id === i.grupo);
    linhas.push([
      i.nome, AppUtils.calcularIdade(i.nascimento), i.nascimento,
      i.responsavel || '', i.whatsapp || '', i.como || '',
      i.poder || '', g ? g.nome : '', new Date(i.criadoEm).toLocaleString('pt-BR')
    ]);
  });
  const neutralizarFormula = valor => {
    const texto = String(valor ?? '');
    return /^[\t\r ]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
  };
  const csv = linhas.map(l => l.map(c =>
    `"${neutralizarFormula(c).replace(/"/g, '""')}"`
  ).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inscricoes_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============== GRUPOS ==============
function nomePublicoAdmin(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

async function renderGruposAdmin() {
  const grupos = await Data.listGrupos();
  const inscritos = await Data.listInscricoes();
  const lista = document.getElementById('listaGrupos');

  lista.innerHTML = grupos.map(g => {
    const participantesDoGrupo = inscritos.filter(i => i.grupo === g.id && i.consentimentoEm);
    const qtd = participantesDoGrupo.length;
    const opcoes = participantesDoGrupo
      .map(p => {
        const publico = nomePublicoAdmin(p.nome);
        return `<option value="${escapeHtml(publico)}" ${g.embaixador === publico ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`;
      })
      .join('');
    const semParticipantes = qtd === 0;

    return `
      <div style="background: var(--fundo-suave); border-radius: var(--raio-medio); padding: 16px; margin-bottom: 12px;">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          ${AppUtils.bandeiraSvg(g.nome, 'flag-inline')}
          <strong style="font-size: 18px;">Grupo ${escapeHtml(g.nome)}</strong>
          <span class="badge-pill">${qtd} participante${qtd !== 1 ? 's' : ''}</span>
        </div>
        <div style="margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap; align-items: end;">
          <div class="form-group" style="margin: 0; flex: 1; min-width: 220px;">
            <label style="font-size: 13px;">Embaixador (escolha entre os participantes do grupo)</label>
            <select class="form-control" data-emb="${g.id}" ${semParticipantes ? 'disabled' : ''}>
              <option value="">— Sem embaixador —</option>
              ${opcoes}
            </select>
            ${semParticipantes
              ? '<p style="font-size: 12px; color: var(--texto-medio); margin-top: 4px;">⚠️ Adicione participantes ao grupo primeiro (use "Distribuir aleatoriamente" ou a distribuição manual).</p>'
              : ''}
          </div>
          <button class="btn btn-sm btn-outline" data-sortear-emb="${g.id}" ${semParticipantes ? 'disabled' : ''}>🎲 Sortear</button>
          <button class="btn btn-sm btn-green" data-save-emb="${g.id}">Salvar</button>
        </div>
        <div style="margin-top: 10px; display: flex; gap: 8px; justify-content: flex-end; padding-top: 10px; border-top: 1px solid var(--borda);">
          <button class="btn btn-sm btn-outline" data-limpar-grupo="${g.id}" ${semParticipantes ? 'disabled' : ''} title="Remove os participantes deste grupo (devolve pra 'sem grupo')">🧹 Limpar participantes</button>
          <button class="btn btn-sm btn-danger" data-excluir-grupo="${g.id}" title="Excluir esta seleção do campeonato">🗑️ Excluir grupo</button>
        </div>
      </div>`;
  }).join('') || '<p class="empty-state">Nenhum grupo configurado. Adicione uma seleção acima.</p>';

  // Sortear um embaixador entre os participantes do grupo
  lista.querySelectorAll('[data-sortear-emb]').forEach(b => {
    b.addEventListener('click', () => {
      const id = Number(b.dataset.sortearEmb);
      const participantes = inscritos.filter(i => i.grupo === id && i.consentimentoEm);
      if (participantes.length === 0) {
        AppUtils.showToast('Nenhum participante neste grupo.', 'error');
        return;
      }
      const sorteado = AppUtils.pickAleatorio(participantes);
      const select = lista.querySelector(`[data-emb="${id}"]`);
      if (select) {
        select.value = nomePublicoAdmin(sorteado.nome);
        AppUtils.showToast(`🎲 Sorteado: ${sorteado.nome}! Clique em Salvar para confirmar.`);
      }
    });
  });

  // Salvar o embaixador escolhido (ou removido)
  lista.querySelectorAll('[data-save-emb]').forEach(b => {
    b.addEventListener('click', async () => {
      const id = Number(b.dataset.saveEmb);
      const select = lista.querySelector(`[data-emb="${id}"]`);
      const novoEmbaixador = (select?.value || '').trim();
      const todos = (await Data.listGrupos()).map(g =>
        g.id === id ? { ...g, embaixador: novoEmbaixador } : g
      );
      try {
        await Data.setGrupos(todos);
        AppUtils.showToast(novoEmbaixador
          ? `Embaixador "${novoEmbaixador}" salvo!`
          : 'Embaixador removido.');
      } catch (err) {
        AppUtils.showToast(err.message, 'error');
      }
    });
  });

  // LIMPAR PARTICIPANTES do grupo (devolve pra 'sem grupo')
  lista.querySelectorAll('[data-limpar-grupo]').forEach(b => {
    b.addEventListener('click', async () => {
      const id = Number(b.dataset.limparGrupo);
      const grupo = grupos.find(g => g.id === id);
      const participantes = inscritos.filter(i => i.grupo === id);
      confirmarAcao(
        `Limpar Grupo ${grupo?.nome || ''}?`,
        `Vai remover os ${participantes.length} participantes deste grupo (eles ficam sem grupo, mas a inscrição é preservada). Continuar?`,
        async () => {
          try {
            for (const p of participantes) {
              await Data.updateInscricao(p.id, { grupo: null });
            }
            AppUtils.showToast(`Grupo ${grupo?.nome} limpo!`);
            await renderGruposAdmin();
            await renderDistribuicaoManual();
          } catch (err) {
            AppUtils.showToast(err.message, 'error');
          }
        }
      );
    });
  });

  // EXCLUIR GRUPO
  lista.querySelectorAll('[data-excluir-grupo]').forEach(b => {
    b.addEventListener('click', async () => {
      const id = Number(b.dataset.excluirGrupo);
      const grupo = grupos.find(g => g.id === id);
      const qtd = inscritos.filter(i => i.grupo === id).length;
      const aviso = qtd > 0
        ? `Atenção: ${qtd} participante(s) estão neste grupo. Eles ficarão "sem grupo" mas as inscrições são preservadas.`
        : 'O grupo está vazio e será removido.';
      confirmarAcao(
        `Excluir Grupo ${grupo?.nome || ''}?`,
        aviso + ' Esta ação não pode ser desfeita.',
        async () => {
          try {
            await Api.excluirGrupo(id);
            AppUtils.showToast(`Grupo ${grupo?.nome} excluído.`);
            await popularSelecaoNovoGrupo();
            await renderGruposAdmin();
            await renderDistribuicaoManual();
          } catch (err) {
            AppUtils.showToast(err.message, 'error');
          }
        }
      );
    });
  });
}

async function renderDistribuicaoManual() {
  const wrap = document.getElementById('distribuicaoManual');
  const inscritos = await Data.listInscricoes();
  const grupos = await Data.listGrupos();
  if (inscritos.length === 0) {
    wrap.innerHTML = '<p class="empty-state">Sem participantes ainda.</p>';
    return;
  }
  wrap.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr><th>Participante</th><th>Grupo</th><th style="width: 80px;">Sortear</th></tr>
        </thead>
        <tbody>
          ${inscritos.map(i => `
            <tr>
              <td>${escapeHtml(i.nome)}</td>
              <td>
                <select class="form-control" data-grupo-de="${i.id}">
                  <option value="">— Sem grupo —</option>
                  ${grupos.map(g => `<option value="${g.id}" ${i.grupo === g.id ? 'selected' : ''}>${escapeHtml(g.nome)}</option>`).join('')}
                </select>
              </td>
              <td>
                <button class="btn btn-sm btn-outline" data-sortear-grupo-de="${i.id}" title="Sortear um grupo aleatório para este participante">🎲</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;

  // Mudanca manual via dropdown
  wrap.querySelectorAll('[data-grupo-de]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = Number(sel.dataset.grupoDe);
      try {
        await Data.updateInscricao(id, { grupo: sel.value ? Number(sel.value) : null });
        AppUtils.showToast('Atualizado!');
        await renderGruposAdmin();
      } catch (err) {
        AppUtils.showToast(err.message, 'error');
      }
    });
  });

  // Sortear grupo individual para um participante
  wrap.querySelectorAll('[data-sortear-grupo-de]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.sortearGrupoDe);
      if (grupos.length === 0) {
        AppUtils.showToast('Nenhum grupo configurado.', 'error');
        return;
      }
      const sorteado = AppUtils.pickAleatorio(grupos);
      try {
        await Data.updateInscricao(id, { grupo: sorteado.id });
        const select = wrap.querySelector(`[data-grupo-de="${id}"]`);
        if (select) select.value = String(sorteado.id);
        AppUtils.showToast(`🎲 Sorteado: Grupo ${sorteado.nome}`);
        await renderGruposAdmin();
      } catch (err) {
        AppUtils.showToast(err.message, 'error');
      }
    });
  });
}

// ============== PARTIDAS ==============
// Popula o <select> de inscritos preservando a selecao atual.
// Reordena por nome (case/acento-insensitive) e mostra o grupo entre parenteses
// quando disponivel — pra equipe distinguir homonimos.
function popularSelectInscritos(inscritos, grupos) {
  const sel = document.getElementById('filtroPartidaInscrito');
  if (!sel) return;
  const valorAtual = sel.value;
  const grupoDe = id => grupos.find(g => g.id === id)?.nome || '';
  const ordenados = [...inscritos].sort((a, b) =>
    String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' })
  );
  sel.innerHTML = '<option value="">Todos os participantes</option>' +
    ordenados.map(i => {
      const grp = grupoDe(i.grupo);
      const sufixo = grp ? ` — Grupo ${grp}` : ' — sem grupo';
      return `<option value="${i.id}">${escapeHtml(i.nome)}${escapeHtml(sufixo)}</option>`;
    }).join('');
  // Restaura se o inscrito ainda existir
  if (valorAtual && ordenados.some(i => String(i.id) === String(valorAtual))) {
    sel.value = valorAtual;
  }
}

async function renderPartidasAdmin() {
  const partidas = await Data.listPartidas();
  const inscritos = await Data.listInscricoes();
  const grupos = await Data.listGrupos();
  const nomeDe = id => inscritos.find(i => i.id === id)?.nome || '—';
  const grupoDe = id => grupos.find(g => g.id === id)?.nome || '—';

  popularSelectInscritos(inscritos, grupos);

  const fStatus = document.getElementById('filtroPartidaStatus').value;
  const fFase = document.getElementById('filtroPartidaFase').value;
  const fInscritoId = document.getElementById('filtroPartidaInscrito').value;
  const fBusca = (document.getElementById('filtroPartidaBusca').value || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const normNome = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const lista = partidas.filter(p => {
    if (fStatus && p.status !== fStatus) return false;
    if (fFase && p.fase !== fFase) return false;
    if (fInscritoId) {
      const idNum = Number(fInscritoId);
      if (p.jogadorA !== idNum && p.jogadorB !== idNum) return false;
    }
    if (fBusca) {
      const nA = normNome(nomeDe(p.jogadorA));
      const nB = normNome(nomeDe(p.jogadorB));
      if (!nA.includes(fBusca) && !nB.includes(fBusca)) return false;
    }
    return true;
  });

  // Contador de resultados
  const contador = document.getElementById('contadorPartidas');
  if (contador) {
    const filtrando = fStatus || fFase || fInscritoId || fBusca;
    contador.textContent = filtrando
      ? `Exibindo ${lista.length} de ${partidas.length} partida(s).`
      : `${partidas.length} partida(s) no total.`;
  }

  const wrap = document.getElementById('listaPartidas');
  if (lista.length === 0) {
    const msg = partidas.length === 0
      ? 'Sem partidas. Gere as partidas da fase de grupos em "Grupos".'
      : 'Nenhuma partida bate com os filtros atuais.';
    wrap.innerHTML = `<p class="empty-state">${msg}</p>`;
    return;
  }

  // Helper pra destacar o termo buscado no nome
  const destacar = (nome) => {
    const esc = escapeHtml(nome);
    if (!fBusca) return esc;
    const normalizado = normNome(nome);
    const idx = normalizado.indexOf(fBusca);
    if (idx < 0) return esc;
    // Mapeamento simplificado: como removemos acentos para comparar mas
    // mantemos o original para exibir, destacamos o trecho de mesma posicao/tamanho.
    const original = String(nome);
    const antes = escapeHtml(original.slice(0, idx));
    const meio = escapeHtml(original.slice(idx, idx + fBusca.length));
    const depois = escapeHtml(original.slice(idx + fBusca.length));
    return `${antes}<mark style="background:#FFF3CD;padding:0 2px;border-radius:3px;">${meio}</mark>${depois}`;
  };

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Fase</th>
            <th>Grupo</th>
            <th>Jogador A</th>
            <th>Placar</th>
            <th>Jogador B</th>
            <th>Status</th>
            <th>Acao</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(p => `
            <tr>
              <td>${escapeHtml(faseLabel(p.fase))}</td>
              <td>${p.grupoId ? escapeHtml(grupoDe(p.grupoId)) : '-'}</td>
              <td>${destacar(nomeDe(p.jogadorA))}</td>
              <td style="text-align: center; font-weight: 700;">
                ${p.status === 'concluida' ? `${p.placarA} × ${p.placarB}` : '—'}
              </td>
              <td>${destacar(nomeDe(p.jogadorB))}</td>
              <td>${p.status === 'concluida'
                  ? '<span class="badge-pill done">Concluida</span>'
                  : '<span class="badge-pill pending">Pendente</span>'}</td>
              <td>
                <button class="btn btn-sm btn-outline" data-partida="${p.id}">
                  ${p.status === 'concluida' ? 'Editar' : 'Registrar'}
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('[data-partida]').forEach(b => {
    b.addEventListener('click', () => abrirModalPartida(Number(b.dataset.partida)));
  });
}

async function abrirModalPartida(id) {
  const partidas = await Data.listPartidas();
  const p = partidas.find(x => x.id === id);
  if (!p) return;
  const inscritos = await Data.listInscricoes();
  const a = inscritos.find(i => i.id === p.jogadorA);
  const b = inscritos.find(i => i.id === p.jogadorB);
  const grupos = await Data.listGrupos();

  document.getElementById('formPartida').dataset.partidaId = id;
  document.getElementById('modalPartidaInfo').textContent = `${faseLabel(p.fase)}${p.grupoId ? ' — Grupo ' + (grupos.find(g => g.id === p.grupoId)?.nome || '') : ''}`;
  document.getElementById('lblJogadorA').textContent = a?.nome || '?';
  document.getElementById('lblJogadorB').textContent = b?.nome || '?';
  document.getElementById('placarA').value = p.placarA ?? 0;
  document.getElementById('placarB').value = p.placarB ?? 0;
  abrirModal('modalPartida');
}

function faseLabel(f) {
  return ({ grupos: 'Grupos', oitavas: 'Oitavas', quartas: 'Quartas', semi: 'Semifinal', final: 'Final' })[f] || f;
}

// ============== CHAVEAMENTO ==============
async function renderStatusFaseGrupos() {
  const partidas = (await Data.listPartidas()).filter(p => p.fase === 'grupos');
  const wrap = document.getElementById('statusFaseGrupos');
  if (partidas.length === 0) {
    wrap.innerHTML = '<div style="background: var(--amarelo-claro); padding: 14px; border-radius: 8px;">⚠️ Nenhuma partida de grupos foi gerada ainda.</div>';
    return;
  }
  const concluidas = partidas.filter(p => p.status === 'concluida').length;
  const pct = Math.round((concluidas / partidas.length) * 100);
  const cor = pct === 100 ? 'var(--verde-claro)' : 'var(--amarelo-claro)';
  wrap.innerHTML = `<div style="background: ${cor}; padding: 14px; border-radius: 8px;">
    📊 Fase de grupos: <strong>${concluidas}/${partidas.length}</strong> partidas concluidas (${pct}%)
    ${pct === 100 ? ' ✅ Pronto para gerar o chaveamento!' : ' - finalize antes de gerar o chaveamento.'}
  </div>`;
}

async function gerarChaveamento() {
  const partidas = await Data.listPartidas();
  const partidasGrupos = partidas.filter(p => p.fase === 'grupos');
  if (partidasGrupos.length === 0) {
    AppUtils.showToast('Gere as partidas da fase de grupos antes.', 'error');
    return;
  }
  const pendentes = partidasGrupos.filter(p => p.status !== 'concluida');
  if (pendentes.length > 0) {
    AppUtils.showToast(`Ainda ha ${pendentes.length} partida(s) pendente(s).`, 'error');
    return;
  }

  confirmarAcao('Gerar chaveamento das eliminatorias?', 'Isso vai pegar os 2 melhores de cada grupo e gerar as partidas eliminatorias. As partidas eliminatorias existentes serao substituidas.', async () => {
    try {
      const r = await Data.gerarChaveamento();
      AppUtils.showToast(`Chaveamento gerado! ${r.partidas || ''} partida(s) de ${faseLabel(r.fase)}.`);
      await renderChaveamentoAtual();
      await renderStatusFaseGrupos();
    } catch (err) {
      AppUtils.showToast(err.message, 'error');
    }
  });
}

async function renderChaveamentoAtual() {
  const partidas = (await Data.listPartidas()).filter(p => p.fase !== 'grupos');
  const wrap = document.getElementById('chaveamentoAtual');
  if (partidas.length === 0) {
    wrap.innerHTML = '<p class="empty-state">Nenhuma partida eliminatoria gerada ainda.</p>';
    return;
  }
  const inscritos = await Data.listInscricoes();
  const nomeDe = id => inscritos.find(i => i.id === id)?.nome || '—';

  const fases = ['oitavas', 'quartas', 'semi', 'final'];
  wrap.innerHTML = fases.map(f => {
    const ps = partidas.filter(p => p.fase === f);
    if (ps.length === 0) return '';
    return `
      <h3 style="margin-top: 18px;">${faseLabel(f)}</h3>
      <div class="fixture-list">
        ${ps.map(p => `
          <article class="match-card ${p.status === 'concluida' ? '' : 'match-pending'}">
            <p class="match-time">${p.status === 'concluida' ? 'Concluida' : 'Pendente'}</p>
            <div class="match-row ${p.status === 'concluida' && p.placarA > p.placarB ? 'winner' : ''}">
              <span class="player">${escapeHtml(nomeDe(p.jogadorA))}</span>
              <span class="score">${p.status === 'concluida' ? p.placarA : '–'}</span>
            </div>
            <div class="match-row ${p.status === 'concluida' && p.placarB > p.placarA ? 'winner' : ''}">
              <span class="player">${escapeHtml(nomeDe(p.jogadorB))}</span>
              <span class="score">${p.status === 'concluida' ? p.placarB : '–'}</span>
            </div>
          </article>
        `).join('')}
      </div>`;
  }).join('') || '<p class="empty-state">Sem partidas eliminatorias.</p>';
}

// ============== FAIR PLAY ==============
async function preencherFairPlay() {
  const fp = await Data.getFairPlay();
  document.getElementById('fpNome').value = fp?.nome || '';
  document.getElementById('fpMotivo').value = fp?.motivo || '';
}

// ============== CONFIG ==============
async function preencherConfig() {
  const cfg = await Data.getConfig();
  document.getElementById('cfgNome').value = cfg.nomeEvento;
  document.getElementById('cfgHomenagem').value = cfg.homenagem;
  document.getElementById('cfgData').value = (cfg.dataEvento || '').slice(0, 16);
  document.getElementById('cfgLocal').value = cfg.local;
  document.getElementById('cfgGrupos').value = (cfg.gruposDisponiveis || []).join('\n');
  document.getElementById('cfgWhats').value = cfg.whatsapp;
  document.getElementById('cfgEmail').value = cfg.email;
  document.getElementById('cfgInscricoes').checked = cfg.inscricoesAbertas;
}

async function salvarConfig() {
  const cfg = await Data.getConfig();
  const gruposTxt = document.getElementById('cfgGrupos').value.trim();
  const novaListaGrupos = gruposTxt.split('\n').map(s => s.trim()).filter(Boolean);

  const nova = {
    ...cfg,
    nomeEvento: document.getElementById('cfgNome').value.trim(),
    homenagem: document.getElementById('cfgHomenagem').value.trim(),
    dataEvento: document.getElementById('cfgData').value,
    local: document.getElementById('cfgLocal').value.trim(),
    gruposDisponiveis: novaListaGrupos,
    whatsapp: document.getElementById('cfgWhats').value.replace(/\D/g, ''),
    email: document.getElementById('cfgEmail').value.trim(),
    inscricoesAbertas: document.getElementById('cfgInscricoes').checked
  };
  try {
    await Data.setConfig(nova);
    AppUtils.showToast('Configurações salvas!');
    // Recarrega o form com os valores efetivamente persistidos
    await preencherConfig();
    // Dispara evento global — todas as abas/componentes que escutam
    // atualizam imediatamente (countdown, footer, badges, texto da data).
    window.dispatchEvent(new Event('config:updated'));
  } catch (err) {
    AppUtils.showToast(err.message, 'error');
  }
}

// ============== MODAIS ==============
function abrirModal(id) { document.getElementById(id).classList.add('show'); }
function fecharModal(id) { document.getElementById(id).classList.remove('show'); }

function confirmarAcao(titulo, texto, callback) {
  const modal = document.getElementById('modalConfirma');
  document.getElementById('modalTitle').textContent = titulo;
  document.getElementById('modalText').textContent = texto;
  abrirModal('modalConfirma');
  const ok = document.getElementById('modalOk');
  const novoOk = ok.cloneNode(true);
  ok.replaceWith(novoOk);
  novoOk.addEventListener('click', () => {
    fecharModal('modalConfirma');
    callback();
  });
}

// ============== HELPERS ==============
function formatarWhats(num) {
  const v = String(num || '').replace(/\D/g, '');
  if (v.length === 11) return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  if (v.length === 10) return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
  return num;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
