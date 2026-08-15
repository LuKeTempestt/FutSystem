/* ============================================
   API Client — Comunicacao com o backend FastAPI
   ============================================ */

const Api = (() => {
  function descobrirBaseUrl() {
    if (typeof window === 'undefined') return 'http://localhost:8001/api';
    if (window.API_BASE_URL) return window.API_BASE_URL.replace(/\/$/, '') + '/api';
    const { protocol, hostname, origin } = window.location;
    if (protocol === 'file:' || !hostname) {
      return 'http://localhost:8001/api';
    }
    return `${origin}/api`;
  }

  const BASE_URL = descobrirBaseUrl();
  const TOKEN_KEY = 'ccr_api_token';
  const USER_KEY = 'ccr_api_user'; // {username, role, inscricao_id}

  // ----- Token / user storage -----
  // Credenciais duram apenas enquanto a aba/sessao estiver aberta.
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (_) {}
  const getToken = () => sessionStorage.getItem(TOKEN_KEY);
  const setToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    } catch { return null; }
  }
  function setUser(u) { sessionStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function clearUser() { sessionStorage.removeItem(USER_KEY); }

  // ----- Fetch wrapper -----
  async function request(path, options = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      options.headers || {}
    );
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      cache: 'no-store',  // garante leitura fresca, sem cache do navegador/SW
      body: options.body && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
    });

    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try {
        const data = await res.json();
        msg = formatarDetalheErro(data.detail) || msg;
      } catch (_) {}
      const err = new ApiError(msg, res.status);
      if (res.status === 401) {
        clearToken();
        clearUser();
      }
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /**
   * Converte o campo "detail" do FastAPI em string legivel.
   * - string: retorna direto (HTTPException padrao)
   * - array: formato Pydantic 422 → junta erros campo:mensagem
   * - objeto: JSON.stringify
   */
  function formatarDetalheErro(detail) {
    if (!detail) return null;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map(err => {
        if (typeof err === 'string') return err;
        if (err && typeof err === 'object') {
          const campo = Array.isArray(err.loc) && err.loc.length > 0
            ? String(err.loc[err.loc.length - 1])
            : '';
          const mensagem = (err.msg || JSON.stringify(err))
            .replace(/^Value error,\s*/i, '');
          return campo ? `${campo}: ${mensagem}` : mensagem;
        }
        return String(err);
      }).join(' · ');
    }
    if (typeof detail === 'object') {
      try { return JSON.stringify(detail); } catch (_) { return '[erro]'; }
    }
    return String(detail);
  }

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  // ----- Health check -----
  // Re-testa quando o status anterior era 'offline' — assim que o servidor liga,
  // a proxima chamada ja reconhece (sem precisar dar F5).
  let _isOnline = null;
  async function isOnline() {
    if (_isOnline === true) return true;  // ja confirmado online, mantem
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(`${BASE_URL}/health`, {
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(t);
      _isOnline = res.ok;
    } catch {
      _isOnline = false;
    }
    return _isOnline;
  }

  function invalidarStatusOnline() {
    _isOnline = null;
  }

  // ----- Auth -----
  async function login(username, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    setToken(data.token);
    setUser({
      username: data.username,
      role: data.role,
      inscricao_id: data.inscricao_id,
    });
    return data;
  }

  async function logout() {
    try { await request('/auth/logout', { method: 'POST' }); } catch (_) {}
    clearToken();
    clearUser();
  }

  async function me() {
    return request('/auth/me');
  }

  async function trocarSenha(senha_atual, senha_nova) {
    return request('/auth/senha', {
      method: 'PUT',
      body: { senha_atual, senha_nova },
    });
  }

  // sortearMeuGrupo removido: sorteio agora e exclusivo do administrador.

  function isLogged() { return !!getToken(); }
  function isAdmin() { return getUser()?.role === 'admin'; }
  function isUser() { return getUser()?.role === 'user'; }

  // ----- Participantes (publico, dados resumidos) -----
  const listarParticipantes = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/participantes${qs ? '?' + qs : ''}`);
  };

  // ----- Inscricoes (admin only, dados completos) -----
  const listarInscricoes = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/inscricoes${qs ? '?' + qs : ''}`);
  };
  const buscarInscricaoPorWhatsapp = (whatsapp) =>
    request(`/inscricoes/buscar?whatsapp=${encodeURIComponent(whatsapp)}`);
  // criarInscricao retorna LoginOut (token + role) - ja loga o usuario
  async function criarInscricao(dados) {
    const r = await request('/inscricoes', { method: 'POST', body: dados });
    if (r && r.token) {
      setToken(r.token);
      setUser({
        username: r.username,
        role: r.role,
        inscricao_id: r.inscricao_id,
      });
    }
    return r;
  }
  const atualizarInscricao = (id, patch) =>
    request(`/inscricoes/${id}`, { method: 'PUT', body: patch });
  const excluirInscricao = (id) =>
    request(`/inscricoes/${id}`, { method: 'DELETE' });

  // ----- Grupos -----
  const listarGrupos = () => request('/grupos');
  const criarGrupo = (dados) =>
    request('/grupos', { method: 'POST', body: dados });
  const atualizarGrupo = (id, patch) =>
    request(`/grupos/${id}`, { method: 'PUT', body: patch });
  const excluirGrupo = (id) =>
    request(`/grupos/${id}`, { method: 'DELETE' });
  const distribuirAleatorio = () =>
    request('/grupos/distribuir', { method: 'POST' });

  // ----- Partidas -----
  const listarPartidas = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/partidas${qs ? '?' + qs : ''}`);
  };
  const gerarPartidasGrupos = () =>
    request('/partidas/gerar-grupos', { method: 'POST' });
  const gerarChaveamento = () =>
    request('/partidas/gerar-chaveamento', { method: 'POST' });
  const registrarPlacar = (id, placarA, placarB) =>
    request(`/partidas/${id}/placar`, {
      method: 'POST',
      body: { placar_a: placarA, placar_b: placarB },
    });

  // ----- Classificacao -----
  const classificacaoGrupo = (grupoId) =>
    request(`/classificacao/${grupoId}`);

  // ----- Config -----
  const getConfig = () => request('/config');
  const putConfig = (patch) =>
    request('/config', { method: 'PUT', body: patch });

  // ----- Fair Play -----
  const getFairPlay = () => request('/fair-play');
  const putFairPlay = (dados) =>
    request('/fair-play', { method: 'PUT', body: dados });

  // ----- Usuarios (admin only) -----
  const listarUsuarios = (role) =>
    request(`/usuarios${role ? '?role=' + role : ''}`);
  const criarAdmin = (username, senha) =>
    request('/usuarios/admin', {
      method: 'POST',
      body: { username, senha },
    });
  const excluirUsuario = (id) =>
    request(`/usuarios/${id}`, { method: 'DELETE' });

  // ----- Admin meta -----
  const stats = () => request('/stats');
  const reset = () => request('/reset', { method: 'DELETE' });

  return {
    BASE_URL,
    ApiError,
    isOnline,
    getToken, setToken, clearToken,
    getUser, setUser, clearUser,
    login, logout, me, trocarSenha,
    isLogged, isAdmin, isUser,
    listarParticipantes,
    listarInscricoes, buscarInscricaoPorWhatsapp,
    criarInscricao, atualizarInscricao, excluirInscricao,
    listarGrupos, criarGrupo, atualizarGrupo, excluirGrupo, distribuirAleatorio,
    listarPartidas, gerarPartidasGrupos, gerarChaveamento,
    registrarPlacar,
    classificacaoGrupo,
    getConfig, putConfig,
    getFairPlay, putFairPlay,
    listarUsuarios, criarAdmin, excluirUsuario,
    stats, reset,
  };
})();

window.Api = Api;
