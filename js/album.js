/* ============================================
   Album de Figurinhas - Render por grupo
   Usa Data (API + localStorage fallback)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  renderAlbum();
});

async function renderAlbum() {
  const wrap = document.getElementById('albumContainer');
  const inscritos = await Data.listParticipantes();
  const grupos = await Data.listGrupos();

  if (inscritos.length === 0) {
    wrap.innerHTML = `
      <div class="form-card text-center" style="max-width: 600px; margin: 0 auto;">
        <div style="font-size: 70px;" aria-hidden="true">📭</div>
        <h2 style="color: var(--verde-escuro);">Album vazio por enquanto</h2>
        <p style="color: var(--texto-medio);">Assim que as inscricoes comecarem, as figurinhas dos participantes vao aparecer aqui.</p>
        <a href="inscricao.html" class="btn btn-primary mt-md">🎮 Quero ser uma figurinha!</a>
      </div>`;
    return;
  }

  const semGrupo = inscritos.filter(i => !i.grupo);
  let html = '';

  grupos.forEach(g => {
    const participantes = inscritos.filter(i => i.grupo === g.id);
    if (participantes.length === 0) return;
    html += `
      <div class="album-section">
        <div class="album-section-title">
          <h2 style="margin: 0; color: var(--verde-escuro); display: flex; align-items: center; gap: 10px;">
            ${AppUtils.bandeiraSvg(g.nome, 'flag-md')}
            <span>Grupo ${escapeHtml(g.nome)}</span>
          </h2>
          <span class="badge-pill" style="background: var(--ambar-principal); color: #fff;">${participantes.length} figurinha${participantes.length > 1 ? 's' : ''}</span>
        </div>
        <div class="stickers-grid">${participantes.map(p => renderSticker(p, grupos)).join('')}</div>
      </div>`;
  });

  if (semGrupo.length > 0) {
    html += `
      <div class="album-section">
        <div class="album-section-title">
          <h2 style="margin: 0; color: var(--verde-escuro);">Sem grupo definido</h2>
          <span class="badge-pill pending">${semGrupo.length}</span>
        </div>
        <div class="stickers-grid">${semGrupo.map(p => renderSticker(p, grupos)).join('')}</div>
      </div>`;
  }

  wrap.innerHTML = html;
}

function renderSticker(p, grupos) {
  const g = grupos.find(x => x.id === p.grupo);
  const grupoTxt = g ? g.nome : 'A definir';
  const flag = g ? AppUtils.bandeiraSvg(g.nome, 'flag-mini') : '';
  return `
    <article class="sticker">
      <div class="sticker-avatar" aria-hidden="true">${escapeHtml(iniciaisDe(p.nome))}</div>
      <div class="sticker-name">${escapeHtml(p.nome)}</div>
      <span class="sticker-group" style="display: inline-flex; align-items: center; gap: 5px;">${flag}${escapeHtml(grupoTxt)}</span>
      ${p.poder ? `<div class="sticker-power">⭐ ${escapeHtml(p.poder)}</div>` : '<div class="sticker-power" style="opacity: 0.5;">Superpoder a definir</div>'}
    </article>`;
}

function iniciaisDe(nome) {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[partes.length - 1]?.[0] || '')).toUpperCase();
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
