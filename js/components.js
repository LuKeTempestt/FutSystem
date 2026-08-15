/* ============================================
   Components — Header e Footer compartilhados
   ============================================ */

const NAV_ITEMS = [
  { href: 'index.html', label: 'Inicio', icon: '🏠' },
  { href: 'sobre.html', label: 'Sobre', icon: '💚' },
  { href: 'memorias.html', label: 'Memorias', icon: '📸' },
  { href: 'inscricao.html', label: 'Inscricao', icon: '📝' },
  { href: 'campeonato.html', label: 'O Campeonato', icon: '🏆' },
  { href: 'album.html', label: 'Album', icon: '⭐' },
  { href: 'ajuda.html', label: 'Ajuda', icon: '❓' }
];

function renderHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return;

  const links = NAV_ITEMS.map(item =>
    `<li><a class="nav-link" href="${item.href}"><span aria-hidden="true">${item.icon}</span>${item.label}</a></li>`
  ).join('');

  const mobileLinks = NAV_ITEMS.map(item =>
    `<li><a href="${item.href}"><span aria-hidden="true">${item.icon}</span>${item.label}</a></li>`
  ).join('');

  // CTA dependente de login
  let ctaDesktop = '';
  let ctaMobile = '';
  const user = (window.Api && Api.getUser) ? Api.getUser() : null;
  const logged = !!(window.Api && Api.isLogged && Api.isLogged());

  if (logged && user) {
    if (user.role === 'admin') {
      ctaDesktop = `<a href="admin/" class="nav-cta"><span aria-hidden="true">⚙️</span> Painel</a>`;
      ctaMobile = `<li><a href="admin/" class="cta-mobile"><span aria-hidden="true">⚙️</span> Painel admin</a></li>
                   <li><a href="#" data-action="logout"><span aria-hidden="true">🚪</span> Sair</a></li>`;
    } else {
      ctaDesktop = `<a href="minha-area.html" class="nav-cta"><span aria-hidden="true">🪪</span> Minha área</a>`;
      ctaMobile = `<li><a href="minha-area.html" class="cta-mobile"><span aria-hidden="true">🪪</span> Minha área</a></li>
                   <li><a href="#" data-action="logout"><span aria-hidden="true">🚪</span> Sair</a></li>`;
    }
  } else {
    ctaDesktop = `<a href="login.html" class="nav-cta"><span aria-hidden="true">🔓</span> Entrar</a>`;
    ctaMobile = `<li><a href="login.html" class="cta-mobile"><span aria-hidden="true">🔓</span> Entrar</a></li>
                 <li><a href="inscricao.html"><span aria-hidden="true">🎮</span> Quero jogar!</a></li>`;
  }

  header.innerHTML = `
    <a class="skip-link" href="#main">Pular para o conteúdo principal</a>
    <header class="site-header">
      <div class="container nav-wrapper">
        <a class="brand" href="index.html" aria-label="Campeonato Digital - página inicial">
          <span class="brand-icon" aria-hidden="true">⚽</span>
          <span class="brand-text">
            <span class="brand-name">Campeonato Digital</span>
            <span class="brand-sub">Copa AVOSOS</span>
          </span>
        </a>
        <nav aria-label="Menu principal">
          <ul class="nav-links">${links}</ul>
        </nav>
        ${ctaDesktop}
        <button class="nav-toggle" data-nav-toggle aria-label="Abrir menu" aria-expanded="false">
          <span aria-hidden="true">☰</span>
        </button>
      </div>
    </header>
    <nav class="mobile-menu" data-mobile-menu aria-label="Menu mobile">
      <ul>
        ${mobileLinks}
        ${ctaMobile}
      </ul>
    </nav>
  `;

  // Logout via menu
  header.querySelectorAll('[data-action="logout"]').forEach(a => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      if (window.Data) await Data.logout();
      else if (window.Api) await Api.logout();
      location.href = 'index.html';
    });
  });
}

async function renderFooter() {
  const footer = document.querySelector('[data-footer]');
  if (!footer) return;

  let cfg;
  try {
    cfg = await (window.Data ? Data.getConfig() : Storage.getConfig());
  } catch {
    cfg = Storage.getConfig();
  }

  const navLinks = NAV_ITEMS.map(item =>
    `<li><a href="${item.href}">› ${item.label}</a></li>`
  ).join('');

  const whatsapp = String(cfg.whatsapp || '').replace(/\D/g, '');
  const email = String(cfg.email || '').trim();
  const emailSeguro = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  const enderecoSeguro = escapeHtmlComponent(cfg.endereco || '');
  const itensContato = [
    whatsapp
      ? `<p><span aria-hidden="true">📱</span> <a href="https://wa.me/55${whatsapp}">${escapeHtmlComponent(formatarTelefone(whatsapp))}</a></p>`
      : '',
    emailSeguro
      ? `<p><span aria-hidden="true">✉️</span> <a href="mailto:${encodeURIComponent(emailSeguro)}">${escapeHtmlComponent(emailSeguro)}</a></p>`
      : '',
    enderecoSeguro
      ? `<p><span aria-hidden="true">📍</span> ${enderecoSeguro}</p>`
      : '',
  ].filter(Boolean).join('');

  footer.innerHTML = `
    <div class="partner-strip">
      Uma iniciativa em parceria com a AVOSOS e Universidade Tiradentes (UNIT)
    </div>
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-col">
            <div class="footer-brand-name">Campeonato Digital</div>
            <p>Copa AVOSOS</p>
            <p style="margin-top: 10px;">Um torneio de futebol em videogame feito com carinho para as crianças e adolescentes da AVOSOS.</p>
            <div class="footer-dots" aria-hidden="true">
              <span class="footer-dot dot-red" title="Portugal"></span>
              <span class="footer-dot dot-yellow" title="Brasil"></span>
              <span class="footer-dot dot-green" title="Argentina"></span>
              <span class="footer-dot dot-blue" title="Japao"></span>
            </div>
          </div>
          <div class="footer-col">
            <h4><span aria-hidden="true">🎮</span> Navegacao</h4>
            <ul>${navLinks}</ul>
          </div>
          <div class="footer-col">
            <h4><span aria-hidden="true">📞</span> Contato</h4>
            ${itensContato || '<p>Contato da organização ainda não configurado.</p>'}
          </div>
          <div class="footer-col">
            <h4><span aria-hidden="true">💚</span> AVOSOS</h4>
            <p>Associacao dos Voluntarios a Servico da Oncologia em Sergipe. Fundada em 1987, atende criancas e adolescentes com cancer em Aracaju.</p>
            <p style="margin-top: 10px;"><a href="https://avosos.org.br" target="_blank" rel="noopener">Visite avosos.org.br</a></p>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© 2026 Copa AVOSOS — Campeonato de Futebol Digital. Projeto de extensão universitária.</span>
          <span>Desenvolvido como projeto acadêmico na UNIT</span>
        </div>
      </div>
    </footer>
  `;
}

function escapeHtmlComponent(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function formatarTelefone(num) {
  const limpo = String(num).replace(/\D/g, '');
  if (limpo.length === 11) {
    return `(${limpo.slice(0,2)}) ${limpo.slice(2,7)}-${limpo.slice(7)}`;
  }
  if (limpo.length === 10) {
    return `(${limpo.slice(0,2)}) ${limpo.slice(2,6)}-${limpo.slice(6)}`;
  }
  return num;
}

// Expoe globalmente pra o polling em main.js poder re-renderizar
window.renderHeader = renderHeader;
window.renderFooter = renderFooter;

document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderFooter();
});
