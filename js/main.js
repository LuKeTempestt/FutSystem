/* ============================================
   Main — Navegacao, menu mobile, utilitarios,
   contagem regressiva e registro do service worker
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  inicializarMenu();
  inicializarCountdowns();
  inicializarServiceWorker();
  inicializarPollingConfig();
  marcarLinkAtivo();

  // Escuta o evento custom disparado quando o admin salva config —
  // atualiza imediatamente sem esperar o tick do polling.
  window.addEventListener('config:updated', atualizarConfigGlobal);

  // Primeira execucao logo apos load para preencher os data-cfg-*
  // que comecam com '—' no HTML estatico.
  setTimeout(atualizarConfigGlobal, 100);
});

// Polling global de config: a cada 15s, refresca countdown + footer.
// Permite que mudancas feitas pelo admin apareçam em outras telas
// (site publico, Minha Area, etc.) sem precisar de F5.
const POLLING_CONFIG_MS = 15000;
function inicializarPollingConfig() {
  setInterval(() => {
    if (!document.hidden) atualizarConfigGlobal();
  }, POLLING_CONFIG_MS);
}

// Formata uma data ISO como "20 de Maio de 2026, às 13h"
function formatarDataExtensa(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const dia = d.getDate();
  const mes = d.toLocaleString('pt-BR', { month: 'long' });
  const mesCap = mes.charAt(0).toUpperCase() + mes.slice(1);
  const ano = d.getFullYear();
  const hora = d.getHours();
  const min = d.getMinutes();
  const horaStr = min === 0 ? `${hora}h` : `${hora}h${String(min).padStart(2,'0')}`;
  return `${dia} de ${mesCap} de ${ano}, às ${horaStr}`;
}

// Formata um numero brasileiro de WhatsApp em "(DD) NNNNN-NNNN"
function _formatarWhatsapp(num) {
  const limpo = String(num || '').replace(/\D/g, '');
  if (limpo.length === 11) return `(${limpo.slice(0,2)}) ${limpo.slice(2,7)}-${limpo.slice(7)}`;
  if (limpo.length === 10) return `(${limpo.slice(0,2)}) ${limpo.slice(2,6)}-${limpo.slice(6)}`;
  return num || '';
}

// Re-le a config do servidor e atualiza UI dependente em tempo real.
// Cobre TODAS as paginas publicas — qualquer elemento com data-cfg-*
// sera atualizado automaticamente sem precisar de F5.
async function atualizarConfigGlobal() {
  if (!window.Data) return;
  let cfg;
  try {
    cfg = await Data.getConfig();
  } catch (_) { return; }

  // 1. Countdown: atualiza o target se a data mudou
  if (cfg.dataEvento) {
    window._dataEventoMs = new Date(cfg.dataEvento).getTime();
  }

  // 2. Textos dinamicos baseados em data-cfg-*
  const dataExtensa = formatarDataExtensa(cfg.dataEvento);
  const whatsappLimpo = String(cfg.whatsapp || '').replace(/\D/g, '');
  const whatsappFmt = _formatarWhatsapp(cfg.whatsapp);

  document.querySelectorAll('[data-cfg-data-extenso]').forEach(el => {
    el.textContent = dataExtensa;
  });
  document.querySelectorAll('[data-cfg-local]').forEach(el => {
    el.textContent = cfg.local || '';
  });
  document.querySelectorAll('[data-cfg-nome-evento]').forEach(el => {
    el.textContent = cfg.nomeEvento || '';
  });
  document.querySelectorAll('[data-cfg-homenagem]').forEach(el => {
    el.textContent = cfg.homenagem || '';
  });
  document.querySelectorAll('[data-cfg-whatsapp]').forEach(el => {
    el.textContent = whatsappFmt;
  });
  document.querySelectorAll('[data-cfg-email]').forEach(el => {
    el.textContent = cfg.email || '';
  });
  document.querySelectorAll('[data-cfg-endereco]').forEach(el => {
    el.textContent = cfg.endereco || '';
  });

  // 2b. Links dinamicos: <a data-cfg-whatsapp-link> ganha href=wa.me/...
  //     <a data-cfg-email-link> ganha href=mailto:...
  document.querySelectorAll('a[data-cfg-whatsapp-link]').forEach(a => {
    if (whatsappLimpo) a.setAttribute('href', `https://wa.me/55${whatsappLimpo}`);
  });
  document.querySelectorAll('a[data-cfg-email-link]').forEach(a => {
    if (cfg.email) a.setAttribute('href', `mailto:${cfg.email}`);
  });

  // 3. Footer: re-renderiza (whatsapp, email, endereco)
  if (typeof window.renderFooter === 'function') {
    try { await window.renderFooter(); } catch (_) {}
  }

  // 4. Inscricoes encerradas: desabilita TODOS os links que apontam pra
  //    inscricao.html em qualquer pagina publica (CTA, header, footer, etc.).
  //    Quando admin reabrir, volta ao normal — tudo automatico.
  const fechadas = cfg.inscricoesAbertas === false;
  document.querySelectorAll('a[href$="inscricao.html"], a[data-cta-jogar]').forEach(a => {
    if (fechadas) {
      a.style.opacity = '0.5';
      a.style.pointerEvents = 'none';
      a.setAttribute('title', 'Inscrições encerradas');
      a.setAttribute('aria-disabled', 'true');
    } else {
      a.style.opacity = '';
      a.style.pointerEvents = '';
      a.removeAttribute('title');
      a.removeAttribute('aria-disabled');
    }
  });

  // 4b. Na propria pagina de inscricao: bloqueia o formulario inteiro e
  //     exibe banner. Funciona em tempo real — se admin fechar enquanto
  //     alguem esta na pagina, o submit fica desabilitado no proximo tick.
  const formInscricao = document.getElementById('formInscricao');
  if (formInscricao) {
    let banner = document.getElementById('avisoInscricoesFechadas');
    if (fechadas) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'avisoInscricoesFechadas';
        banner.className = 'form-card';
        banner.style.cssText = 'background:#FFF3CD;border-left:6px solid #F1BF00;color:#7A5A00;margin-bottom:18px;';
        banner.innerHTML = '<strong>⚠️ Inscrições encerradas.</strong> No momento não estamos recebendo novas inscrições. Volte mais tarde ou entre em contato com a equipe.';
        formInscricao.parentNode.insertBefore(banner, formInscricao);
      }
      formInscricao.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = true);
      formInscricao.style.opacity = '0.55';
    } else {
      if (banner) banner.remove();
      formInscricao.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = false);
      formInscricao.style.opacity = '';
    }
  }
}

// Nota: o comportamento padrao do navegador para <input type="date">
// apaga apenas a parte focada (dia/mes/ano) com Backspace ou Delete.
// Nao adicionamos handler custom para preservar esse comportamento nativo.

// ----- Menu hamburguer -----
function inicializarMenu() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const aberto = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', aberto);
    document.body.style.overflow = aberto ? 'hidden' : '';
  });

  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', false);
      document.body.style.overflow = '';
    });
  });
}

// ----- Destaque do link ativo no menu -----
function marcarLinkAtivo() {
  const arquivo = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.nav-link, .mobile-menu a').forEach(a => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (href === arquivo || (arquivo === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
}

// ----- Contagem regressiva -----
async function inicializarCountdowns() {
  const containers = document.querySelectorAll('[data-countdown]');
  if (containers.length === 0) return;

  // Aguarda a config (API ou local). Em caso de falha, usa data fixa do documento.
  // O target fica em window._dataEventoMs para poder ser atualizado pelo
  // polling global de config (em tempo real).
  try {
    const cfg = await (window.Data ? Data.getConfig() : Storage.getConfig());
    window._dataEventoMs = new Date(cfg.dataEvento).getTime();
  } catch {
    window._dataEventoMs = new Date('2026-05-20T13:00:00').getTime();
  }

  const render = () => {
    const agora = Date.now();
    const diff = window._dataEventoMs - agora;

    containers.forEach(c => {
      const elDias = c.querySelector('[data-cd-dias]');
      const elHoras = c.querySelector('[data-cd-horas]');
      const elMin = c.querySelector('[data-cd-min]');
      const elSeg = c.querySelector('[data-cd-seg]');
      const elMsg = c.querySelector('[data-cd-msg]');

      if (diff <= 0) {
        if (elMsg) {
          elMsg.innerHTML = `O campeonato aconteceu! <a href="memorias.html" style="color: var(--amarelo-medio); text-decoration: underline;">Confira as memorias</a>.`;
          elMsg.style.display = 'block';
        }
        if (elDias) elDias.textContent = '00';
        if (elHoras) elHoras.textContent = '00';
        if (elMin) elMin.textContent = '00';
        if (elSeg) elSeg.textContent = '00';
        return;
      }

      const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
      const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const min = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seg = Math.floor((diff % (1000 * 60)) / 1000);

      if (elDias) elDias.textContent = String(dias).padStart(2, '0');
      if (elHoras) elHoras.textContent = String(horas).padStart(2, '0');
      if (elMin) elMin.textContent = String(min).padStart(2, '0');
      if (elSeg) elSeg.textContent = String(seg).padStart(2, '0');
    });
  };

  render();
  setInterval(render, 1000);
}

// ----- Service Worker (PWA) -----
function inicializarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

// ----- Toast (notificacoes) -----
function showToast(mensagem, tipo = 'success', duracaoMs = 3500) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = mensagem;
  toast.className = 'toast ' + tipo;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), duracaoMs);
}

// ----- Helpers de formatacao -----
function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function calcularIdade(dataNasc) {
  if (!dataNasc) return null;
  const hoje = new Date();
  const n = new Date(dataNasc);
  let idade = hoje.getFullYear() - n.getFullYear();
  const m = hoje.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < n.getDate())) idade--;
  return idade;
}

function iniciais(nomeCompleto) {
  if (!nomeCompleto) return '?';
  const partes = nomeCompleto.trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[partes.length - 1]?.[0] || '')).toUpperCase();
}

// Numero aleatorio inteiro em [0, max) sem vies de modulo.
// Usa crypto.getRandomValues (CSPRNG) com rejection sampling para distribuicao
// estritamente uniforme — o que da garantia tecnica de que NENHUM grupo
// tem chance maior que outro de ser sorteado.
function randomInt(max) {
  if (!Number.isInteger(max) || max <= 0) return 0;
  if (max === 1) return 0;
  // Buffer de 32 bits; rejeita valores no "resto" do divisor para evitar vies
  const buffer = new Uint32Array(1);
  const limite = Math.floor(0xFFFFFFFF / max) * max;
  let valor;
  do {
    crypto.getRandomValues(buffer);
    valor = buffer[0];
  } while (valor >= limite);
  return valor % max;
}

function pickAleatorio(lista) {
  if (!Array.isArray(lista) || lista.length === 0) return undefined;
  return lista[randomInt(lista.length)];
}

// ----- Bandeiras dos grupos (mapa global) -----
// Chave: nome do grupo normalizado (lowercase, sem acentos).
const BANDEIRAS_GRUPO = {
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
  marrocos: '🇲🇦',
  holanda: '🇳🇱',
  paisesbaixos: '🇳🇱',
  suica: '🇨🇭',
  estadosunidos: '🇺🇸',
  eua: '🇺🇸',
  canada: '🇨🇦',
  australia: '🇦🇺',
  coreiadosul: '🇰🇷',
  coreia: '🇰🇷',
  senegal: '🇸🇳',
  camaroes: '🇨🇲',
  ghana: '🇬🇭',
  tunisia: '🇹🇳',
  arabiasaudita: '🇸🇦',
  catar: '🇶🇦',
  ira: '🇮🇷',
  ira_: '🇮🇷',
};

// Normaliza um nome de grupo para uso como chave (lowercase + sem acentos)
function normalizarChaveGrupo(nome) {
  if (!nome) return '';
  return String(nome)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

// Retorna o emoji da bandeira, ou bola se nao mapeado.
function bandeira(nomeGrupo) {
  const chave = normalizarChaveGrupo(nomeGrupo);
  return BANDEIRAS_GRUPO[chave] || '⚽';
}

// ===== Bandeiras em SVG inline =====
// Por que SVG? Emoji de bandeira nacional usa "Regional Indicator Symbols"
// (ex: 🇧🇷 = U+1F1E7 + U+1F1F7). Muitos navegadores no Windows mostram esses
// codepoints como letras cruas ("BR") porque a fonte do sistema nao tem
// suporte. SVG resolve definitivamente — funciona em qualquer SO/navegador.
// (Mapa BANDEIRAS_SVG abaixo usa SVG inline direto — sem helpers,
//  mantendo qualidade visual alta em cada bandeira.)

const BANDEIRAS_SVG = {
  // === Americas ===
  brasil: '<svg viewBox="0 0 30 21" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="21" fill="#009C3B"/><polygon points="15,2 28,10.5 15,19 2,10.5" fill="#FFDF00"/><circle cx="15" cy="10.5" r="4.5" fill="#002776"/></svg>',
  argentina: '<svg viewBox="0 0 30 18" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="18" fill="#75AADB"/><rect y="6" width="30" height="6" fill="#FFFFFF"/><circle cx="15" cy="9" r="1.8" fill="#F6B40E"/></svg>',
  uruguai: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#FFFFFF"/><rect y="2.2" width="30" height="2.2" fill="#0038A8"/><rect y="6.7" width="30" height="2.2" fill="#0038A8"/><rect y="11.1" width="30" height="2.2" fill="#0038A8"/><rect y="15.6" width="30" height="2.2" fill="#0038A8"/><rect width="11" height="11" fill="#FFFFFF"/><circle cx="5.5" cy="5.5" r="2.5" fill="#FCD116"/></svg>',
  chile: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="10" fill="#FFFFFF"/><rect y="10" width="30" height="10" fill="#D52B1E"/><rect width="10" height="10" fill="#0039A6"/><polygon points="5,3 5.8,5 7.5,5 6.1,6.2 6.7,8 5,7 3.3,8 3.9,6.2 2.5,5 4.2,5" fill="#FFFFFF"/></svg>',
  paraguai: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#D52B1E"/><rect y="6.67" width="30" height="6.66" fill="#FFFFFF"/><rect y="13.33" width="30" height="6.67" fill="#0038A8"/></svg>',
  peru: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect x="0" width="10" height="20" fill="#D91023"/><rect x="10" width="10" height="20" fill="#FFFFFF"/><rect x="20" width="10" height="20" fill="#D91023"/></svg>',
  bolivia: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#D52B1E"/><rect y="6.67" width="30" height="6.66" fill="#F4E400"/><rect y="13.33" width="30" height="6.67" fill="#007934"/></svg>',
  colombia: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="10" fill="#FCD116"/><rect y="10" width="30" height="5" fill="#003893"/><rect y="15" width="30" height="5" fill="#CE1126"/></svg>',
  venezuela: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#FCE300"/><rect y="6.67" width="30" height="6.66" fill="#003893"/><rect y="13.33" width="30" height="6.67" fill="#CE1126"/></svg>',
  equador: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="10" fill="#FFDD00"/><rect y="10" width="30" height="5" fill="#0072CE"/><rect y="15" width="30" height="5" fill="#ED2939"/></svg>',
  mexico: '<svg viewBox="0 0 30 17" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="17" fill="#006847"/><rect x="10" width="10" height="17" fill="#FFFFFF"/><rect x="20" width="10" height="17" fill="#CE1126"/></svg>',
  estadosunidos: '<svg viewBox="0 0 30 16" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="16" fill="#FFFFFF"/><rect width="30" height="1.2" fill="#BF0A30"/><rect y="2.5" width="30" height="1.2" fill="#BF0A30"/><rect y="5" width="30" height="1.2" fill="#BF0A30"/><rect y="7.5" width="30" height="1.2" fill="#BF0A30"/><rect y="10" width="30" height="1.2" fill="#BF0A30"/><rect y="12.5" width="30" height="1.2" fill="#BF0A30"/><rect y="14.8" width="30" height="1.2" fill="#BF0A30"/><rect width="12" height="9" fill="#002868"/></svg>',
  eua: '<svg viewBox="0 0 30 16" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="16" fill="#FFFFFF"/><rect width="30" height="1.2" fill="#BF0A30"/><rect y="2.5" width="30" height="1.2" fill="#BF0A30"/><rect y="5" width="30" height="1.2" fill="#BF0A30"/><rect y="7.5" width="30" height="1.2" fill="#BF0A30"/><rect y="10" width="30" height="1.2" fill="#BF0A30"/><rect y="12.5" width="30" height="1.2" fill="#BF0A30"/><rect y="14.8" width="30" height="1.2" fill="#BF0A30"/><rect width="12" height="9" fill="#002868"/></svg>',
  canada: '<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"><rect width="7.5" height="15" fill="#D52B1E"/><rect x="7.5" width="15" height="15" fill="#FFFFFF"/><rect x="22.5" width="7.5" height="15" fill="#D52B1E"/><path d="M15,3.5 L15.6,5.5 L17.5,5 L16.8,6.6 L18.5,6.4 L17.2,7.7 L19,8.2 L17.5,9 L18.2,10.3 L16.5,10 L16.8,11.5 L15,10.5 L13.2,11.5 L13.5,10 L11.8,10.3 L12.5,9 L11,8.2 L12.8,7.7 L11.5,6.4 L13.2,6.6 L12.5,5 L14.4,5.5 Z" fill="#D52B1E"/></svg>',
  // === Europa ===
  portugal: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#DA291C"/><rect width="12" height="20" fill="#046A38"/><circle cx="12" cy="10" r="3.2" fill="#FFE800" stroke="#FFFFFF" stroke-width="0.4"/><circle cx="12" cy="10" r="1.8" fill="#DA291C"/></svg>',
  espanha: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/></svg>',
  franca: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20" fill="#002395"/><rect x="10" width="10" height="20" fill="#FFFFFF"/><rect x="20" width="10" height="20" fill="#ED2939"/></svg>',
  alemanha: '<svg viewBox="0 0 30 18" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6" fill="#000000"/><rect y="6" width="30" height="6" fill="#DD0000"/><rect y="12" width="30" height="6" fill="#FFCE00"/></svg>',
  inglaterra: '<svg viewBox="0 0 30 18" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="18" fill="#FFFFFF"/><rect x="13" width="4" height="18" fill="#CE1124"/><rect y="7" width="30" height="4" fill="#CE1124"/></svg>',
  italia: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#FFFFFF"/><rect x="20" width="10" height="20" fill="#CE2B37"/></svg>',
  holanda: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#AE1C28"/><rect y="6.67" width="30" height="6.67" fill="#FFFFFF"/><rect y="13.34" width="30" height="6.67" fill="#21468B"/></svg>',
  paisesbaixos: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#AE1C28"/><rect y="6.67" width="30" height="6.67" fill="#FFFFFF"/><rect y="13.34" width="30" height="6.67" fill="#21468B"/></svg>',
  belgica: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20" fill="#000000"/><rect x="10" width="10" height="20" fill="#FAE042"/><rect x="20" width="10" height="20" fill="#ED2939"/></svg>',
  suica: '<svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="30" fill="#FF0000"/><rect x="12.5" y="7" width="5" height="16" fill="#FFFFFF"/><rect x="7" y="12.5" width="16" height="5" fill="#FFFFFF"/></svg>',
  croacia: '<svg viewBox="0 0 30 18" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6" fill="#FF0000"/><rect y="6" width="30" height="6" fill="#FFFFFF"/><rect y="12" width="30" height="6" fill="#171796"/></svg>',
  polonia: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="10" fill="#FFFFFF"/><rect y="10" width="30" height="10" fill="#DC143C"/></svg>',
  ucrania: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="10" fill="#005BBB"/><rect y="10" width="30" height="10" fill="#FFD500"/></svg>',
  russia: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#FFFFFF"/><rect y="6.67" width="30" height="6.67" fill="#0039A6"/><rect y="13.34" width="30" height="6.67" fill="#D52B1E"/></svg>',
  servia: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#C6363C"/><rect y="6.67" width="30" height="6.67" fill="#0C4076"/><rect y="13.34" width="30" height="6.67" fill="#FFFFFF"/></svg>',
  dinamarca: '<svg viewBox="0 0 37 28" xmlns="http://www.w3.org/2000/svg"><rect width="37" height="28" fill="#C8102E"/><rect x="12" width="4" height="28" fill="#FFFFFF"/><rect y="12" width="37" height="4" fill="#FFFFFF"/></svg>',
  suecia: '<svg viewBox="0 0 30 19" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="19" fill="#006AA7"/><rect x="9" width="3" height="19" fill="#FECC00"/><rect y="8" width="30" height="3" fill="#FECC00"/></svg>',
  noruega: '<svg viewBox="0 0 30 22" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="22" fill="#EF2B2D"/><rect x="9" width="3.5" height="22" fill="#FFFFFF"/><rect y="9" width="30" height="4" fill="#FFFFFF"/><rect x="10" width="2" height="22" fill="#002868"/><rect y="10" width="30" height="2" fill="#002868"/></svg>',
  finlandia: '<svg viewBox="0 0 30 18" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="18" fill="#FFFFFF"/><rect x="9" width="3" height="18" fill="#003580"/><rect y="7.5" width="30" height="3" fill="#003580"/></svg>',
  irlanda: '<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="15" fill="#169B62"/><rect x="10" width="10" height="15" fill="#FFFFFF"/><rect x="20" width="10" height="15" fill="#FF883E"/></svg>',
  escocia: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#0065BD"/><path d="M0,0 L30,20 M30,0 L0,20" stroke="#FFFFFF" stroke-width="3"/></svg>',
  // === Asia ===
  japao: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#FFFFFF"/><circle cx="15" cy="10" r="6" fill="#BC002D"/></svg>',
  coreiadosul: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#FFFFFF"/><circle cx="15" cy="10" r="4" fill="#CD2E3A"/><path d="M 11 10 A 2 2 0 0 1 15 10 A 2 2 0 0 0 19 10 A 4 4 0 0 1 11 10 Z" fill="#0047A0"/><rect x="3" y="4.4" width="3.5" height="0.7" fill="#000000"/><rect x="3" y="5.6" width="3.5" height="0.7" fill="#000000"/><rect x="3" y="6.8" width="3.5" height="0.7" fill="#000000"/><rect x="23.5" y="4.4" width="3.5" height="0.7" fill="#000000"/><rect x="23.5" y="5.6" width="1.4" height="0.7" fill="#000000"/><rect x="25.6" y="5.6" width="1.4" height="0.7" fill="#000000"/><rect x="23.5" y="6.8" width="3.5" height="0.7" fill="#000000"/><rect x="3" y="13.4" width="3.5" height="0.7" fill="#000000"/><rect x="3" y="14.6" width="1.4" height="0.7" fill="#000000"/><rect x="5.1" y="14.6" width="1.4" height="0.7" fill="#000000"/><rect x="3" y="15.8" width="1.4" height="0.7" fill="#000000"/><rect x="5.1" y="15.8" width="1.4" height="0.7" fill="#000000"/><rect x="23.5" y="13.4" width="1.4" height="0.7" fill="#000000"/><rect x="25.6" y="13.4" width="1.4" height="0.7" fill="#000000"/><rect x="23.5" y="14.6" width="1.4" height="0.7" fill="#000000"/><rect x="25.6" y="14.6" width="1.4" height="0.7" fill="#000000"/><rect x="23.5" y="15.8" width="1.4" height="0.7" fill="#000000"/><rect x="25.6" y="15.8" width="1.4" height="0.7" fill="#000000"/></svg>',
  coreia: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#FFFFFF"/><circle cx="15" cy="10" r="4" fill="#CD2E3A"/><path d="M 11 10 A 2 2 0 0 1 15 10 A 2 2 0 0 0 19 10 A 4 4 0 0 1 11 10 Z" fill="#0047A0"/><rect x="3" y="4.4" width="3.5" height="0.7" fill="#000000"/><rect x="3" y="5.6" width="3.5" height="0.7" fill="#000000"/><rect x="3" y="6.8" width="3.5" height="0.7" fill="#000000"/><rect x="23.5" y="4.4" width="3.5" height="0.7" fill="#000000"/><rect x="23.5" y="5.6" width="1.4" height="0.7" fill="#000000"/><rect x="25.6" y="5.6" width="1.4" height="0.7" fill="#000000"/><rect x="23.5" y="6.8" width="3.5" height="0.7" fill="#000000"/><rect x="3" y="13.4" width="3.5" height="0.7" fill="#000000"/><rect x="3" y="14.6" width="1.4" height="0.7" fill="#000000"/><rect x="5.1" y="14.6" width="1.4" height="0.7" fill="#000000"/><rect x="3" y="15.8" width="1.4" height="0.7" fill="#000000"/><rect x="5.1" y="15.8" width="1.4" height="0.7" fill="#000000"/><rect x="23.5" y="13.4" width="1.4" height="0.7" fill="#000000"/><rect x="25.6" y="13.4" width="1.4" height="0.7" fill="#000000"/><rect x="23.5" y="14.6" width="1.4" height="0.7" fill="#000000"/><rect x="25.6" y="14.6" width="1.4" height="0.7" fill="#000000"/><rect x="23.5" y="15.8" width="1.4" height="0.7" fill="#000000"/><rect x="25.6" y="15.8" width="1.4" height="0.7" fill="#000000"/></svg>',
  china: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#DE2910"/><polygon points="6,3 7.2,6 10.4,6 7.8,8 8.8,11 6,9 3.2,11 4.2,8 1.6,6 4.8,6" fill="#FFDE00"/><polygon points="11.5,2 11.9,2.9 12.9,2.9 12.1,3.5 12.4,4.4 11.5,3.8 10.6,4.4 10.9,3.5 10.1,2.9 11.1,2.9" fill="#FFDE00"/><polygon points="13.5,4.5 13.9,5.4 14.9,5.4 14.1,6 14.4,6.9 13.5,6.3 12.6,6.9 12.9,6 12.1,5.4 13.1,5.4" fill="#FFDE00"/><polygon points="13.5,7.5 13.9,8.4 14.9,8.4 14.1,9 14.4,9.9 13.5,9.3 12.6,9.9 12.9,9 12.1,8.4 13.1,8.4" fill="#FFDE00"/><polygon points="11.5,10 11.9,10.9 12.9,10.9 12.1,11.5 12.4,12.4 11.5,11.8 10.6,12.4 10.9,11.5 10.1,10.9 11.1,10.9" fill="#FFDE00"/></svg>',
  arabiasaudita: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#006C35"/><path d="M4,8.5 Q6,7.5 8,8.5 Q10,9.5 12,8.5 Q14,7.5 16,8.5 Q18,9.5 20,8.5 Q22,7.5 24,8.5" stroke="#FFFFFF" stroke-width="0.6" fill="none"/><path d="M5,9.5 Q7,8.8 9,9.5 Q11,10.2 13,9.5 Q15,8.8 17,9.5 Q19,10.2 21,9.5 Q23,8.8 25,9.5" stroke="#FFFFFF" stroke-width="0.6" fill="none"/><rect x="3.5" y="13" width="21" height="0.8" fill="#FFFFFF"/><polygon points="3.5,13 6,12.3 6,14.5" fill="#FFFFFF"/><rect x="24.5" y="12.6" width="2.5" height="1.6" fill="#FFFFFF"/></svg>',
  catar: '<svg viewBox="0 0 28 11" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="11" fill="#8A1538"/><path d="M0,0 L8,0 L9.5,0.7 L8,1.4 L9.5,2.1 L8,2.8 L9.5,3.5 L8,4.2 L9.5,4.9 L8,5.6 L9.5,6.3 L8,7 L9.5,7.7 L8,8.4 L9.5,9.1 L8,9.8 L9.5,10.5 L8,11 L0,11 Z" fill="#FFFFFF"/></svg>',
  iran: '<svg viewBox="0 0 30 17" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="17" fill="#FFFFFF"/><rect width="30" height="5.5" fill="#239F40"/><rect y="11.5" width="30" height="5.5" fill="#DA0000"/><path d="M14,7.5 Q14.5,8.5 15,7.8 Q15.5,8.5 16,7.5 L16,9 Q15,9.8 14,9 Z" fill="#DA0000"/></svg>',
  ira: '<svg viewBox="0 0 30 17" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="17" fill="#FFFFFF"/><rect width="30" height="5.5" fill="#239F40"/><rect y="11.5" width="30" height="5.5" fill="#DA0000"/><path d="M14,7.5 Q14.5,8.5 15,7.8 Q15.5,8.5 16,7.5 L16,9 Q15,9.8 14,9 Z" fill="#DA0000"/></svg>',
  india: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#FF9933"/><rect y="6.67" width="30" height="6.67" fill="#FFFFFF"/><rect y="13.34" width="30" height="6.67" fill="#138808"/><circle cx="15" cy="10" r="2.5" fill="none" stroke="#000080" stroke-width="0.4"/><line x1="15" y1="7.5" x2="15" y2="12.5" stroke="#000080" stroke-width="0.25"/><line x1="12.5" y1="10" x2="17.5" y2="10" stroke="#000080" stroke-width="0.25"/><line x1="13.2" y1="8.2" x2="16.8" y2="11.8" stroke="#000080" stroke-width="0.25"/><line x1="16.8" y1="8.2" x2="13.2" y2="11.8" stroke="#000080" stroke-width="0.25"/></svg>',
  // === Africa ===
  marrocos: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#C1272D"/><polygon points="15,6 16.5,10 20.5,10 17.2,12.5 18.5,16.5 15,14 11.5,16.5 12.8,12.5 9.5,10 13.5,10" fill="none" stroke="#006233" stroke-width="0.8"/></svg>',
  senegal: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20" fill="#00853F"/><rect x="10" width="10" height="20" fill="#FDEF42"/><rect x="20" width="10" height="20" fill="#E31B23"/><polygon points="15,8 16,10.5 18.5,10.5 16.5,12 17.3,14.5 15,13 12.7,14.5 13.5,12 11.5,10.5 14,10.5" fill="#00853F"/></svg>',
  gana: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#CE1126"/><rect y="6.67" width="30" height="6.67" fill="#FCD116"/><rect y="13.34" width="30" height="6.67" fill="#006B3F"/><polygon points="15,8.5 16,11 13.5,9.5 16.5,9.5 14,11" fill="#000000"/></svg>',
  egito: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#CE1126"/><rect y="6.67" width="30" height="6.67" fill="#FFFFFF"/><rect y="13.34" width="30" height="6.67" fill="#000000"/><path d="M15,8 L13.5,10 L12,9 L13,11 L11.5,11.5 L13.5,12 L15,11.5 L16.5,12 L18.5,11.5 L17,11 L18,9 L16.5,10 Z" fill="#C09300"/></svg>',
  nigeria: '<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="15" fill="#008753"/><rect x="10" width="10" height="15" fill="#FFFFFF"/><rect x="20" width="10" height="15" fill="#008753"/></svg>',
  camaroes: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20" fill="#007A5E"/><rect x="10" width="10" height="20" fill="#CE1126"/><rect x="20" width="10" height="20" fill="#FCD116"/><polygon points="15,8 16,10.5 18.5,10.5 16.5,12 17.3,14.5 15,13 12.7,14.5 13.5,12 11.5,10.5 14,10.5" fill="#FCD116"/></svg>',
  tunisia: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#E70013"/><circle cx="15" cy="10" r="5" fill="#FFFFFF"/><circle cx="15.8" cy="10" r="3.8" fill="#E70013"/><circle cx="16.6" cy="10" r="3" fill="#FFFFFF"/><polygon points="14.5,8 15,9.4 16.4,9.4 15.3,10.2 15.7,11.6 14.5,10.8 13.3,11.6 13.7,10.2 12.6,9.4 14,9.4" fill="#E70013"/></svg>',
  africadosul: '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#FFFFFF"/><polygon points="0,0 30,0 30,7 13,10 30,13 30,20 0,20" fill="#FFFFFF"/><polygon points="0,0 30,0 30,5 11,10 30,15 30,20 0,20" fill="#FFFFFF"/><polygon points="0,0 30,0 30,3.5 9,10 30,16.5 30,20 0,20" fill="#FFFFFF"/><polygon points="30,0 30,4 11,10 30,16 30,20 14,10" fill="#FFFFFF"/><polygon points="0,0 14,10 0,20" fill="#000000"/><polygon points="0,2 11,10 0,18" fill="#FFB81C"/><polygon points="0,5 8,10 0,15" fill="#000000"/><polygon points="0,0 30,0 30,3 9.5,10 0,4" fill="#DE3831"/><polygon points="0,16 9.5,10 30,17 30,20 0,20" fill="#002395"/><polygon points="0,4 11,10 0,16" fill="#FFFFFF"/><polygon points="0,5.5 9,10 0,14.5" fill="#007749"/></svg>',
  // === Oceania ===
  australia: '<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="15" fill="#012169"/><rect width="15" height="8" fill="#012169"/><path d="M0,0 L15,8 M15,0 L0,8" stroke="#FFFFFF" stroke-width="1.5"/><path d="M0,0 L15,8 M15,0 L0,8" stroke="#C8102E" stroke-width="0.8"/><rect x="6.5" width="2" height="8" fill="#FFFFFF"/><rect y="3" width="15" height="2" fill="#FFFFFF"/><rect x="7" width="1" height="8" fill="#C8102E"/><rect y="3.5" width="15" height="1" fill="#C8102E"/><polygon points="7.5,10 8.1,11.6 9.8,11.6 8.5,12.6 9,14.2 7.5,13.2 6,14.2 6.5,12.6 5.2,11.6 6.9,11.6" fill="#FFFFFF"/><polygon points="22,3 22.3,3.9 23.2,3.9 22.5,4.4 22.7,5.3 22,4.8 21.3,5.3 21.5,4.4 20.8,3.9 21.7,3.9" fill="#FFFFFF"/><polygon points="25.5,5.5 25.8,6.4 26.7,6.4 26,6.9 26.2,7.8 25.5,7.3 24.8,7.8 25,6.9 24.3,6.4 25.2,6.4" fill="#FFFFFF"/><polygon points="22.5,8 22.8,8.9 23.7,8.9 23,9.4 23.2,10.3 22.5,9.8 21.8,10.3 22,9.4 21.3,8.9 22.2,8.9" fill="#FFFFFF"/><polygon points="26,10 26.3,10.9 27.2,10.9 26.5,11.4 26.7,12.3 26,11.8 25.3,12.3 25.5,11.4 24.8,10.9 25.7,10.9" fill="#FFFFFF"/><polygon points="24,12.5 24.25,13.2 24.95,13.2 24.4,13.6 24.6,14.3 24,13.85 23.4,14.3 23.6,13.6 23.05,13.2 23.75,13.2" fill="#FFFFFF"/></svg>',
  novazelandia: '<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="15" fill="#012169"/><rect width="15" height="8" fill="#012169"/><path d="M0,0 L15,8 M15,0 L0,8" stroke="#FFFFFF" stroke-width="1.5"/><path d="M0,0 L15,8 M15,0 L0,8" stroke="#C8102E" stroke-width="0.8"/><rect x="6.5" width="2" height="8" fill="#FFFFFF"/><rect y="3" width="15" height="2" fill="#FFFFFF"/><rect x="7" width="1" height="8" fill="#C8102E"/><rect y="3.5" width="15" height="1" fill="#C8102E"/><polygon points="22,3.5 22.3,4.4 23.2,4.4 22.5,4.9 22.7,5.8 22,5.3 21.3,5.8 21.5,4.9 20.8,4.4 21.7,4.4" fill="#C8102E" stroke="#FFFFFF" stroke-width="0.25"/><polygon points="25.5,6 25.8,6.9 26.7,6.9 26,7.4 26.2,8.3 25.5,7.8 24.8,8.3 25,7.4 24.3,6.9 25.2,6.9" fill="#C8102E" stroke="#FFFFFF" stroke-width="0.25"/><polygon points="22.5,9 22.8,9.9 23.7,9.9 23,10.4 23.2,11.3 22.5,10.8 21.8,11.3 22,10.4 21.3,9.9 22.2,9.9" fill="#C8102E" stroke="#FFFFFF" stroke-width="0.25"/><polygon points="26,11 26.3,11.9 27.2,11.9 26.5,12.4 26.7,13.3 26,12.8 25.3,13.3 25.5,12.4 24.8,11.9 25.7,11.9" fill="#C8102E" stroke="#FFFFFF" stroke-width="0.25"/></svg>',
};

// Mantida apenas a lista original de ~50 seleções com SVG de qualidade alta.

// Lista publica de selecoes disponiveis (para popular dropdowns no admin).
// Mantem o nome de exibicao + a chave usada pra buscar a bandeira.
const SELECOES_DISPONIVEIS = [
  { nome: 'Brasil', chave: 'brasil' },
  { nome: 'Argentina', chave: 'argentina' },
  { nome: 'Uruguai', chave: 'uruguai' },
  { nome: 'Chile', chave: 'chile' },
  { nome: 'Paraguai', chave: 'paraguai' },
  { nome: 'Peru', chave: 'peru' },
  { nome: 'Bolívia', chave: 'bolivia' },
  { nome: 'Colômbia', chave: 'colombia' },
  { nome: 'Venezuela', chave: 'venezuela' },
  { nome: 'Equador', chave: 'equador' },
  { nome: 'México', chave: 'mexico' },
  { nome: 'Estados Unidos', chave: 'estadosunidos' },
  { nome: 'Canadá', chave: 'canada' },
  { nome: 'Portugal', chave: 'portugal' },
  { nome: 'Espanha', chave: 'espanha' },
  { nome: 'França', chave: 'franca' },
  { nome: 'Alemanha', chave: 'alemanha' },
  { nome: 'Inglaterra', chave: 'inglaterra' },
  { nome: 'Itália', chave: 'italia' },
  { nome: 'Holanda', chave: 'holanda' },
  { nome: 'Bélgica', chave: 'belgica' },
  { nome: 'Suíça', chave: 'suica' },
  { nome: 'Croácia', chave: 'croacia' },
  { nome: 'Polônia', chave: 'polonia' },
  { nome: 'Ucrânia', chave: 'ucrania' },
  { nome: 'Rússia', chave: 'russia' },
  { nome: 'Sérvia', chave: 'servia' },
  { nome: 'Dinamarca', chave: 'dinamarca' },
  { nome: 'Suécia', chave: 'suecia' },
  { nome: 'Noruega', chave: 'noruega' },
  { nome: 'Finlândia', chave: 'finlandia' },
  { nome: 'Irlanda', chave: 'irlanda' },
  { nome: 'Escócia', chave: 'escocia' },
  { nome: 'Japão', chave: 'japao' },
  { nome: 'Coreia do Sul', chave: 'coreiadosul' },
  { nome: 'China', chave: 'china' },
  { nome: 'Arábia Saudita', chave: 'arabiasaudita' },
  { nome: 'Catar', chave: 'catar' },
  { nome: 'Irã', chave: 'iran' },
  { nome: 'Índia', chave: 'india' },
  { nome: 'Marrocos', chave: 'marrocos' },
  { nome: 'Senegal', chave: 'senegal' },
  { nome: 'Gana', chave: 'gana' },
  { nome: 'Egito', chave: 'egito' },
  { nome: 'Nigéria', chave: 'nigeria' },
  { nome: 'Camarões', chave: 'camaroes' },
  { nome: 'Tunísia', chave: 'tunisia' },
  { nome: 'África do Sul', chave: 'africadosul' },
  { nome: 'Austrália', chave: 'australia' },
  { nome: 'Nova Zelândia', chave: 'novazelandia' },
];

// Retorna um <span> com o SVG inline da bandeira (fallback: emoji).
// Funciona em qualquer SO/navegador sem depender de fonte de emoji.
// `classes` permite customizar tamanho/estilo (ex: 'flag-inline').
function bandeiraSvg(nomeGrupo, classes = 'flag-svg') {
  const chave = normalizarChaveGrupo(nomeGrupo);
  const svg = BANDEIRAS_SVG[chave];
  if (svg) {
    return `<span class="${classes}" aria-hidden="true">${svg}</span>`;
  }
  // Fallback: emoji ou bola
  return `<span class="${classes}" aria-hidden="true">${BANDEIRAS_GRUPO[chave] || '⚽'}</span>`;
}

window.AppUtils = {
  showToast, formatarData, calcularIdade, iniciais,
  randomInt, pickAleatorio,
  bandeira, bandeiraSvg, normalizarChaveGrupo,
  selecoesDisponiveis: () => SELECOES_DISPONIVEIS,
};
