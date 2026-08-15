/* ============================================
   Data Layer — Camada unificada API + localStorage
   Tenta o backend primeiro; cai para Storage offline.
   Tudo aqui retorna Promise.
   ============================================ */

const Data = (() => {
  let _modo = null; // 'api' ou 'local'

  async function detectarModo() {
    // Se ja confirmado 'api', mantem (servidor ja foi visto online).
    // Se nao foi testado ainda OU estava 'local', re-testa.
    // -> Assim que o servidor liga, proxima operacao automaticamente
    //    passa a usar a API (sem precisar refresh).
    if (_modo === 'api') return 'api';
    try {
      const online = await Api.isOnline();
      _modo = online ? 'api' : 'local';
    } catch {
      _modo = 'local';
    }
    return _modo;
  }
  function modoSincrono() { return _modo || 'local'; }
  function forcarLocal() { _modo = 'local'; }

  // -------- Mapeadores API → formato Storage --------
  function mapInscricaoApi(i) {
    if (!i) return null;
    return {
      id: i.id,
      nome: i.nome,
      nascimento: i.nascimento,
      responsavel: i.responsavel,
      whatsapp: i.whatsapp,
      como: i.como_soube,
      poder: i.superpoder,
      grupo: i.grupo_id,
      criadoEm: i.criado_em,
      consentimentoEm: i.consentimento_em,
    };
  }
  function mapGrupoApi(g) {
    if (!g) return null;
    return {
      id: g.id,
      nome: g.nome,
      cor: g.cor || g.nome.toLowerCase(),
      embaixador: g.embaixador || '',
    };
  }
  function mapPartidaApi(p) {
    if (!p) return null;
    return {
      id: p.id,
      fase: p.fase,
      grupoId: p.grupo_id,
      jogadorA: p.jogador_a_id,
      jogadorB: p.jogador_b_id,
      placarA: p.placar_a,
      placarB: p.placar_b,
      horario: p.horario || '',
      status: p.status,
    };
  }

  // ================== CONFIG ==================
  async function getConfig() {
    if (await detectarModo() === 'api') {
      try {
        const cfg = await Api.getConfig();
        return {
          nomeEvento: cfg.nome_evento,
          homenagem: cfg.homenagem,
          dataEvento: cfg.data_evento,
          local: cfg.local,
          whatsapp: cfg.whatsapp,
          email: cfg.email,
          endereco: cfg.endereco,
          inscricoesAbertas: cfg.inscricoes_abertas,
          gruposDisponiveis: cfg.grupos_disponiveis,
        };
      } catch {
        return Storage.getConfig();
      }
    }
    return Storage.getConfig();
  }

  async function setConfig(c) {
    if (await detectarModo() === 'api') {
      const payload = {
        nome_evento: c.nomeEvento,
        homenagem: c.homenagem,
        data_evento: c.dataEvento,
        local: c.local,
        whatsapp: c.whatsapp,
        email: c.email,
        endereco: c.endereco,
        inscricoes_abertas: c.inscricoesAbertas,
      };
      // Inclui grupos_disponiveis apenas se a propriedade veio (admin
      // pode salvar so os campos basicos sem sincronizar grupos).
      if (Array.isArray(c.gruposDisponiveis)) {
        payload.grupos_disponiveis = c.gruposDisponiveis;
      }
      await Api.putConfig(payload);
    }
    Storage.setConfig(c);
  }

  // ================== PARTICIPANTES (publico, sem dados sensiveis) ==================
  function mapParticipanteApi(p) {
    if (!p) return null;
    return {
      id: p.id,
      nome: p.nome,
      poder: p.superpoder || '',
      grupo: p.grupo_id,
      // Campos sensiveis vazios (LGPD)
      nascimento: '',
      responsavel: '',
      whatsapp: '',
      como: '',
      criadoEm: null,
    };
  }

  async function listParticipantes() {
    if (await detectarModo() === 'api') {
      try {
        const lista = await Api.listarParticipantes();
        return lista.map(mapParticipanteApi);
      } catch {
        // Fallback localStorage (modo offline)
        return Storage.listInscricoes().map(i => ({
          id: i.id, nome: i.nome, poder: i.poder || '', grupo: i.grupo,
          nascimento: '', responsavel: '', whatsapp: '', como: '', criadoEm: null,
        }));
      }
    }
    return Storage.listInscricoes().map(i => ({
      id: i.id, nome: i.nome, poder: i.poder || '', grupo: i.grupo,
      nascimento: '', responsavel: '', whatsapp: '', como: '', criadoEm: null,
    }));
  }

  // ================== INSCRICOES (admin only) ==================
  async function listInscricoes() {
    if (await detectarModo() === 'api') {
      try {
        const lista = await Api.listarInscricoes();
        return lista.map(mapInscricaoApi);
      } catch {
        return Storage.listInscricoes();
      }
    }
    return Storage.listInscricoes();
  }

  async function addInscricao(dados) {
    if (await detectarModo() === 'api') {
      // No backend: criarInscricao retorna LoginOut (token + role)
      const r = await Api.criarInscricao({
        nome: dados.nome,
        nascimento: dados.nascimento,
        responsavel: dados.responsavel,
        whatsapp: dados.whatsapp,
        username: dados.username,
        senha: dados.senha,
        codigo_convite: dados.codigo_convite,
        como_soube: dados.como || dados.como_soube || '',
        superpoder: dados.poder || dados.superpoder || '',
        consentimento: dados.consentimento === true,
        consentimento_versao: dados.consentimento_versao || '2026-08-15',
      });
      // O usuario ja esta logado apos isso
      return { nome: dados.nome, id: r.inscricao_id };
    }
    throw new Error('O cadastro exige conexao com o servidor para proteger sua senha.');
  }

  async function updateInscricao(id, patch) {
    if (await detectarModo() === 'api') {
      const corpo = {};
      if (patch.nome !== undefined) corpo.nome = patch.nome;
      if (patch.responsavel !== undefined) corpo.responsavel = patch.responsavel;
      if (patch.whatsapp !== undefined) corpo.whatsapp = patch.whatsapp;
      if (patch.como !== undefined) corpo.como_soube = patch.como;
      if (patch.poder !== undefined) corpo.superpoder = patch.poder;
      if (patch.grupo !== undefined) corpo.grupo_id = patch.grupo;
      if (patch.grupo_id !== undefined) corpo.grupo_id = patch.grupo_id;
      const r = await Api.atualizarInscricao(id, corpo);
      return mapInscricaoApi(r);
    }
    return Storage.updateInscricao(id, patch);
  }

  async function deleteInscricao(id) {
    if (await detectarModo() === 'api') {
      await Api.excluirInscricao(id);
      return;
    }
    Storage.deleteInscricao(id);
  }

  async function findInscricaoByWhatsapp(numero) {
    if (await detectarModo() === 'api') {
      try {
        const r = await Api.buscarInscricaoPorWhatsapp(numero);
        return mapInscricaoApi(r);
      } catch {
        return Storage.findInscricaoByWhatsapp(numero);
      }
    }
    return Storage.findInscricaoByWhatsapp(numero);
  }

  // ================== GRUPOS ==================
  async function listGrupos() {
    if (await detectarModo() === 'api') {
      try {
        const lista = await Api.listarGrupos();
        return lista.map(mapGrupoApi);
      } catch {
        return Storage.listGrupos();
      }
    }
    return Storage.listGrupos();
  }

  async function setGrupos(novos) {
    // No modo API: atualiza embaixadores apenas (alteracoes finas)
    if (await detectarModo() === 'api') {
      for (const g of novos) {
        if (typeof g.id === 'number') {
          await Api.atualizarGrupo(g.id, {
            nome: g.nome,
            cor: g.cor,
            embaixador: g.embaixador,
          });
        }
      }
      return;
    }
    Storage.setGrupos(novos);
  }

  async function distribuirAleatorio() {
    if (await detectarModo() === 'api') {
      await Api.distribuirAleatorio();
      return await listInscricoes();
    }
    return Storage.distribuirAleatorio();
  }

  // ================== PARTIDAS ==================
  async function listPartidas() {
    if (await detectarModo() === 'api') {
      try {
        const lista = await Api.listarPartidas();
        return lista.map(mapPartidaApi);
      } catch {
        return Storage.listPartidas();
      }
    }
    return Storage.listPartidas();
  }

  async function gerarPartidasGrupos() {
    if (await detectarModo() === 'api') {
      await Api.gerarPartidasGrupos();
      return await listPartidas();
    }
    return Storage.gerarPartidasGrupos();
  }

  async function gerarChaveamento() {
    if (await detectarModo() === 'api') {
      return await Api.gerarChaveamento();
    }
    throw new Error('Geracao de chaveamento requer backend online.');
  }

  async function registrarPlacar(id, placarA, placarB) {
    if (await detectarModo() === 'api') {
      const r = await Api.registrarPlacar(id, Number(placarA), Number(placarB));
      return mapPartidaApi(r);
    }
    return Storage.registrarPlacar(id, placarA, placarB);
  }

  async function classificacaoGrupo(grupoId) {
    if (await detectarModo() === 'api') {
      try {
        const r = await Api.classificacaoGrupo(grupoId);
        return r.map(l => ({
          id: l.inscricao_id, nome: l.nome,
          pj: l.pj, v: l.v, e: l.e, d: l.d,
          gp: l.gp, gc: l.gc, sg: l.sg, pts: l.pts,
        }));
      } catch {
        return Storage.classificacaoGrupo(grupoId);
      }
    }
    return Storage.classificacaoGrupo(grupoId);
  }

  // ================== FAIR PLAY ==================
  async function getFairPlay() {
    if (await detectarModo() === 'api') {
      try {
        const fp = await Api.getFairPlay();
        return fp && fp.nome ? { nome: fp.nome, motivo: fp.motivo } : null;
      } catch {
        return Storage.getFairPlay();
      }
    }
    return Storage.getFairPlay();
  }

  async function setFairPlay(dados) {
    if (await detectarModo() === 'api') {
      await Api.putFairPlay({ nome: dados.nome, motivo: dados.motivo });
      return;
    }
    Storage.setFairPlay(dados);
  }

  // ================== AUTH ==================
  async function login(usuario, senha) {
    if (await detectarModo() === 'api') {
      try {
        const r = await Api.login(usuario, senha);
        return { ok: true, role: r.role, username: r.username };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    }
    return {
      ok: false,
      role: null,
      message: 'Login administrativo indisponivel sem conexao com o servidor.'
    };
  }

  async function logout() {
    if (await detectarModo() === 'api') {
      await Api.logout();
    }
    Storage.logout();
  }

  function isLogged() {
    return Api.isLogged();
  }

  function isAdmin() {
    return Api.isAdmin();
  }

  function isUser() {
    return Api.isUser();
  }

  function getUser() {
    return Api.getUser();
  }

  // ================== RESET ==================
  async function resetTudo() {
    if (await detectarModo() === 'api') {
      try { await Api.reset(); return; } catch (_) {}
    }
    Object.values(Storage.KEYS).forEach(k => localStorage.removeItem(k));
  }

  async function stats() {
    if (await detectarModo() === 'api' && Api.isLogged()) {
      try { return await Api.stats(); } catch (_) {}
    }
    const ins = Storage.listInscricoes();
    const part = Storage.listPartidas();
    return {
      total_inscritos: ins.length,
      total_grupos: Storage.listGrupos().length,
      sem_grupo: ins.filter(i => !i.grupo).length,
      partidas_total: part.length,
      partidas_concluidas: part.filter(p => p.status === 'concluida').length,
      partidas_pendentes: part.filter(p => p.status === 'pendente').length,
    };
  }

  return {
    detectarModo, modoSincrono, forcarLocal,
    getConfig, setConfig,
    listParticipantes,
    listInscricoes, addInscricao, updateInscricao, deleteInscricao, findInscricaoByWhatsapp,
    listGrupos, setGrupos, distribuirAleatorio,
    listPartidas, gerarPartidasGrupos, gerarChaveamento, registrarPlacar,
    classificacaoGrupo,
    getFairPlay, setFairPlay,
    login, logout, isLogged, isAdmin, isUser, getUser,
    resetTudo, stats,
  };
})();

window.Data = Data;
