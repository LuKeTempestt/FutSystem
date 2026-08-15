/* ============================================
   Storage — Camada de persistência (localStorage)
   Simula um backend para o evento.
   ============================================ */

const Storage = (() => {
  const KEYS = {
    INSCRICOES: 'ccr_inscricoes',
    GRUPOS: 'ccr_grupos',
    PARTIDAS: 'ccr_partidas',
    CONFIG: 'ccr_config',
    FAIR_PLAY: 'ccr_fair_play',
    AUTH: 'ccr_admin_auth'
  };

  const ler = (k, fallback) => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  };

  const gravar = (k, v) => {
    localStorage.setItem(k, JSON.stringify(v));
  };

  // ----- Config -----
  function getConfig() {
    const padrao = {
      nomeEvento: 'Campeonato de Futebol Digital',
      homenagem: '',
      // Data do evento: 20 de maio de 2026, 13h
      dataEvento: '2026-05-20T13:00:00',
      local: 'AVOSOS, Aracaju/SE',
      inscricoesAbertas: true,
      whatsapp: '',
      email: '',
      endereco: 'Aracaju – SE, Brasil',
      gruposDisponiveis: [
        'Brasil', 'Argentina', 'Portugal', 'Franca',
        'Espanha', 'Alemanha', 'Inglaterra', 'Japao'
      ]
    };
    return Object.assign(padrao, ler(KEYS.CONFIG, {}));
  }
  function setConfig(c) { gravar(KEYS.CONFIG, c); }

  // ----- Inscrições -----
  function listInscricoes() { return ler(KEYS.INSCRICOES, []); }
  function addInscricao(dados) {
    const lista = listInscricoes();
    const nova = {
      id: 'i_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      criadoEm: new Date().toISOString(),
      grupo: null,
      ...dados
    };
    lista.push(nova);
    gravar(KEYS.INSCRICOES, lista);
    return nova;
  }
  function updateInscricao(id, patch) {
    const lista = listInscricoes();
    const idx = lista.findIndex(i => i.id === id);
    if (idx === -1) return null;
    lista[idx] = { ...lista[idx], ...patch };
    gravar(KEYS.INSCRICOES, lista);
    return lista[idx];
  }
  function deleteInscricao(id) {
    const lista = listInscricoes().filter(i => i.id !== id);
    gravar(KEYS.INSCRICOES, lista);
  }
  function findInscricaoByWhatsapp(numero) {
    const limpo = String(numero).replace(/\D/g, '');
    return listInscricoes().find(i => String(i.whatsapp).replace(/\D/g, '') === limpo);
  }

  // ----- Grupos -----
  function listGrupos() {
    const cfg = getConfig();
    const grupos = ler(KEYS.GRUPOS, null);
    if (grupos) return grupos;
    // Inicializar a partir da configuração
    const iniciais = cfg.gruposDisponiveis.map(nome => ({
      id: 'g_' + nome.toLowerCase().replace(/[^a-z0-9]/g, ''),
      nome,
      embaixador: '',
      cor: nome.toLowerCase()
    }));
    gravar(KEYS.GRUPOS, iniciais);
    return iniciais;
  }
  function setGrupos(g) { gravar(KEYS.GRUPOS, g); }

  function distribuirAleatorio() {
    const grupos = listGrupos();
    const inscritos = listInscricoes();
    // Embaralhamento Fisher-Yates (usa AppUtils.randomInt quando disponivel)
    const _r = (n) =>
      (typeof AppUtils !== 'undefined' && AppUtils.randomInt)
        ? AppUtils.randomInt(n)
        : Math.floor(Math.random() * n);
    const lista = [...inscritos];
    for (let i = lista.length - 1; i > 0; i--) {
      const j = _r(i + 1);
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    const atualizados = lista.map((p, idx) => ({
      ...p,
      grupo: grupos[idx % grupos.length].id
    }));
    gravar(KEYS.INSCRICOES, atualizados);
    return atualizados;
  }

  // ----- Partidas -----
  function listPartidas() { return ler(KEYS.PARTIDAS, []); }
  function setPartidas(p) { gravar(KEYS.PARTIDAS, p); }

  function gerarPartidasGrupos() {
    const partidas = [];
    const grupos = listGrupos();
    const inscritos = listInscricoes();
    grupos.forEach(g => {
      const jogadores = inscritos.filter(i => i.grupo === g.id);
      // Todos contra todos
      for (let i = 0; i < jogadores.length; i++) {
        for (let j = i + 1; j < jogadores.length; j++) {
          partidas.push({
            id: 'p_' + g.id + '_' + i + '_' + j + '_' + Date.now(),
            fase: 'grupos',
            grupoId: g.id,
            jogadorA: jogadores[i].id,
            jogadorB: jogadores[j].id,
            placarA: null,
            placarB: null,
            horario: null,
            status: 'pendente'
          });
        }
      }
    });
    setPartidas(partidas);
    return partidas;
  }

  function registrarPlacar(partidaId, placarA, placarB) {
    const partidas = listPartidas();
    const idx = partidas.findIndex(p => p.id === partidaId);
    if (idx === -1) return null;
    partidas[idx] = {
      ...partidas[idx],
      placarA: Number(placarA),
      placarB: Number(placarB),
      status: 'concluida'
    };
    gravar(KEYS.PARTIDAS, partidas);
    return partidas[idx];
  }

  // ----- Classificação por grupo -----
  function classificacaoGrupo(grupoId) {
    const inscritos = listInscricoes().filter(i => i.grupo === grupoId);
    const partidas = listPartidas().filter(p =>
      p.grupoId === grupoId && p.status === 'concluida'
    );
    const tabela = inscritos.map(i => ({
      id: i.id,
      nome: i.nome,
      pj: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pts: 0
    }));
    const indexar = id => tabela.find(t => t.id === id);

    partidas.forEach(p => {
      const a = indexar(p.jogadorA); const b = indexar(p.jogadorB);
      if (!a || !b) return;
      a.pj++; b.pj++;
      a.gp += p.placarA; a.gc += p.placarB;
      b.gp += p.placarB; b.gc += p.placarA;
      if (p.placarA > p.placarB) { a.v++; b.d++; a.pts += 3; }
      else if (p.placarA < p.placarB) { b.v++; a.d++; b.pts += 3; }
      else { a.e++; b.e++; a.pts++; b.pts++; }
    });

    tabela.forEach(t => t.sg = t.gp - t.gc);
    tabela.sort((x, y) =>
      y.pts - x.pts || y.sg - x.sg || y.gp - x.gp || x.nome.localeCompare(y.nome)
    );
    return tabela;
  }

  // ----- Fair Play -----
  function getFairPlay() { return ler(KEYS.FAIR_PLAY, null); }
  function setFairPlay(dados) { gravar(KEYS.FAIR_PLAY, dados); }

  // O modo offline nao autentica administradores nem armazena credenciais.
  function login() { return false; }
  function logout() { sessionStorage.removeItem(KEYS.AUTH); }
  function isLogged() { return false; }

  return {
    KEYS,
    getConfig, setConfig,
    listInscricoes, addInscricao, updateInscricao, deleteInscricao, findInscricaoByWhatsapp,
    listGrupos, setGrupos, distribuirAleatorio,
    listPartidas, setPartidas, gerarPartidasGrupos, registrarPlacar,
    classificacaoGrupo,
    getFairPlay, setFairPlay,
    login, logout, isLogged
  };
})();

if (typeof window !== 'undefined') {
  window.Storage = Storage;
}
