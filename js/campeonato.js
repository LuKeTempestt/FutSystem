/* ============================================
   Pagina do Campeonato - Render dinamico
   Usa Data (API + localStorage fallback)
   ============================================ */

const BANDEIRAS = {
  brasil: '🇧🇷',
  argentina: '🇦🇷',
  portugal: '🇵🇹',
  japao: '🇯🇵',
  alemanha: '🇩🇪',
  espanha: '🇪🇸',
  franca: '🇫🇷',
  inglaterra: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  italia: '🇮🇹',
  uruguai: '🇺🇾',
  mexico: '🇲🇽',
  croacia: '🇭🇷',
  belgica: '🇧🇪',
  marrocos: '🇲🇦'
};

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    renderGrupos(),
    renderClassificacao(),
    renderPartidasGrupos(),
    renderFairPlay(),
    renderProximas(),
  ]);
  inicializarTabs();
});

async function renderGrupos() {
  const grid = document.getElementById('gruposGrid');
  const grupos = await Data.listGrupos();
  const inscritos = await Data.listParticipantes();

  if (grupos.length === 0) {
    grid.innerHTML = '<p class="empty-state">Os grupos serao divulgados em breve!</p>';
    return;
  }

  grid.innerHTML = grupos.map(g => {
    const jogadores = inscritos.filter(i => i.grupo === g.id);
    const cor = AppUtils.normalizarChaveGrupo(g.cor || g.nome);
    const flag = AppUtils.bandeiraSvg(g.nome);
    const listaJogadores = jogadores.length > 0
      ? jogadores.map(j => `
          <li>
            <span class="avatar">${escapeHtml(iniciais(j.nome))}</span>
            <span>${escapeHtml(j.nome)}</span>
          </li>`).join('')
      : '<li style="background: transparent; color: var(--texto-medio); font-style: italic;">Em breve voce vai saber em qual selecao vai jogar.</li>';

    return `
      <article class="group-card" data-color="${cor}">
        <div class="group-header">
          <div class="group-flag" aria-hidden="true">${flag}</div>
          <div class="group-info">
            <h3>Grupo ${escapeHtml(g.nome)}</h3>
            <p class="ambassador">${g.embaixador ? '👤 Embaixador: ' + escapeHtml(g.embaixador) : 'Embaixador a definir'}</p>
          </div>
        </div>
        <ul class="group-players">${listaJogadores}</ul>
      </article>`;
  }).join('');
}

async function renderClassificacao() {
  const wrap = document.getElementById('classificacaoGrupos');
  const grupos = await Data.listGrupos();
  if (grupos.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  const blocos = await Promise.all(grupos.map(async g => {
    const tabela = await Data.classificacaoGrupo(g.id);
    if (tabela.length === 0) return '';
    const linhas = tabela.map((t, i) => `
      <tr class="${i < 2 ? 'qualified' : ''}">
        <td>${i + 1}. ${escapeHtml(t.nome)}</td>
        <td>${t.pts}</td>
        <td>${t.pj}</td>
        <td>${t.v}</td>
        <td>${t.e}</td>
        <td>${t.d}</td>
        <td>${t.sg > 0 ? '+' : ''}${t.sg}</td>
      </tr>
    `).join('');

    return `
      <div class="admin-card" style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 14px;">Grupo ${escapeHtml(g.nome)}</h3>
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
                <th>SG</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      </div>`;
  }));
  wrap.innerHTML = blocos.join('') || '<p class="empty-state">A classificacao aparecera assim que as partidas comecarem.</p>';
}

async function renderPartidasGrupos() {
  const wrap = document.getElementById('partidasGrupos');
  const todasPartidas = await Data.listPartidas();
  const partidas = todasPartidas.filter(p => p.fase === 'grupos');
  if (partidas.length === 0) return;

  const inscritos = await Data.listParticipantes();
  const nomeDe = id => (inscritos.find(i => i.id === id)?.nome || '—');

  wrap.innerHTML = partidas.map(p => {
    const concluida = p.status === 'concluida';
    const aVenceu = concluida && p.placarA > p.placarB;
    const bVenceu = concluida && p.placarB > p.placarA;
    return `
      <article class="match-card ${concluida ? '' : 'match-pending'}">
        ${p.horario ? `<p class="match-time">⏰ ${escapeHtml(p.horario)}</p>` : `<p class="match-time">Aguardando horario</p>`}
        <div class="match-row ${aVenceu ? 'winner' : ''}">
          <span class="player">${escapeHtml(nomeDe(p.jogadorA))}</span>
          <span class="score">${concluida ? p.placarA : '–'}</span>
        </div>
        <div class="match-row ${bVenceu ? 'winner' : ''}">
          <span class="player">${escapeHtml(nomeDe(p.jogadorB))}</span>
          <span class="score">${concluida ? p.placarB : '–'}</span>
        </div>
      </article>`;
  }).join('');
}

async function renderFairPlay() {
  const wrap = document.getElementById('fairPlayContainer');
  const fp = await Data.getFairPlay();
  if (!fp || !fp.nome) {
    wrap.innerHTML = '<p class="empty-state">O Premio Fair Play sera revelado durante o campeonato.</p>';
    return;
  }
  wrap.innerHTML = `
    <div class="fair-play-card">
      <div class="fair-play-medal" aria-hidden="true">🏅</div>
      <div class="fair-play-info">
        <h3>${escapeHtml(fp.nome)}</h3>
        <p>${escapeHtml(fp.motivo)}</p>
      </div>
    </div>`;
}

async function renderProximas() {
  const wrap = document.getElementById('proximasPartidas');
  const todas = await Data.listPartidas();
  const partidas = todas.filter(p => p.status === 'pendente').slice(0, 5);
  if (partidas.length === 0) return;

  const inscritos = await Data.listParticipantes();
  const nomeDe = id => (inscritos.find(i => i.id === id)?.nome || '—');

  wrap.innerHTML = partidas.map(p => `
    <article class="match-card match-pending">
      ${p.horario ? `<p class="match-time">⏰ ${escapeHtml(p.horario)}</p>` : `<p class="match-time">Em breve</p>`}
      <div class="match-row">
        <span class="player">${escapeHtml(nomeDe(p.jogadorA))}</span>
        <span class="score">–</span>
      </div>
      <div class="match-row">
        <span class="player">${escapeHtml(nomeDe(p.jogadorB))}</span>
        <span class="score">–</span>
      </div>
    </article>`).join('');
}

function inicializarTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      const alvo = t.dataset.tab;
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.dataset.tabContent === alvo);
      });
    });
  });
}

function iniciais(nome) {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[partes.length - 1]?.[0] || '')).toUpperCase();
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
