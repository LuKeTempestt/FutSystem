/* ============================================
   Inscricao — Validacao + envio + checagem de username
   Cria a conta de usuario (role='user') e ja loga
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formInscricao');
  const telaSucesso = document.getElementById('telaSucesso');

  const inputNome = document.getElementById('nome');
  const inputWhats = document.getElementById('whatsapp');
  const inputUser = document.getElementById('username');

  // Mascara WhatsApp
  inputWhats.addEventListener('input', e => {
    e.target.value = mascaraTelefone(e.target.value);
  });

  // Sugestao automatica de username a partir do nome — so se usuario nao editou ainda
  let userEditadoManualmente = false;
  inputUser.addEventListener('input', () => {
    userEditadoManualmente = true;
    inputUser.value = normalizarUsername(inputUser.value);
    checarUsernameComDebounce();
  });

  inputNome.addEventListener('input', () => {
    if (!userEditadoManualmente) {
      inputUser.value = sugerirUsername(inputNome.value);
      checarUsernameComDebounce();
    }
  });

  // Submit
  form.addEventListener('submit', async e => {
    e.preventDefault();
    limparErros(form);

    const dados = Object.fromEntries(new FormData(form).entries());
    const erros = validar(dados);

    if (Object.keys(erros).length > 0) {
      Object.entries(erros).forEach(([campo, msg]) => mostrarErro(campo, msg));
      const primeiro = form.querySelector('.error');
      if (primeiro) primeiro.focus();
      return;
    }

    try {
      const inscricao = await Data.addInscricao({
        nome: dados.nome.trim(),
        nascimento: dados.nascimento,
        responsavel: dados.responsavel.trim(),
        whatsapp: dados.whatsapp.replace(/\D/g, ''),
        username: dados.username.toLowerCase().trim(),
        senha: dados.senha,
        codigo_convite: dados.codigo_convite,
        como: dados.como,
        poder: (dados.poder || '').trim(),
        consentimento: dados.consentimento === 'on',
        consentimento_versao: '2026-08-15'
      });

      form.hidden = true;
      telaSucesso.hidden = false;
      const msg = document.getElementById('msgSucesso');
      const nomeExibir = (inscricao && inscricao.nome) || dados.nome;
      msg.innerHTML = `
        <strong>${escapeHtml(nomeExibir)}</strong>, você está dentro do campeonato!<br>
        Sua conta foi criada com o usuário <code>${escapeHtml(dados.username)}</code> — você já está logado.<br>
        Em breve você descobre em qual seleção vai jogar.
      `;
      AppUtils.showToast('Inscrição confirmada! 🎉');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const msg = err.message || 'Não foi possível salvar.';
      if (/whatsapp/i.test(msg)) mostrarErro('whatsapp', msg);
      else if (/usuario|username/i.test(msg)) mostrarErro('username', msg);
      AppUtils.showToast(msg, 'error');
    }
  });
});

// ---- Username helpers ----
// Remove diacriticos (combining marks U+0300 a U+036F)
const REGEX_ACENTOS = /[̀-ͯ]/g;

function normalizarUsername(v) {
  return (v || '')
    .toLowerCase()
    .normalize('NFD').replace(REGEX_ACENTOS, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30);
}

function sugerirUsername(nome) {
  if (!nome) return '';
  const limpo = nome
    .toLowerCase()
    .normalize('NFD').replace(REGEX_ACENTOS, '')
    .replace(/[^a-z\s]/g, '')
    .trim();
  if (!limpo) return '';
  const partes = limpo.split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 20);
  return (partes[0] + partes[partes.length - 1]).slice(0, 20);
}

function checarUsernameComDebounce() {
  const status = document.querySelector('[data-status-for="username"]');
  const val = document.getElementById('username').value;
  if (!val) { status.textContent = ''; return; }
  if (val.length < 3) {
    status.textContent = '✋ Mínimo 3 caracteres';
    status.style.color = 'var(--texto-medio)';
    return;
  }
  status.textContent = '✓ Formato válido';
  status.style.color = 'var(--verde-escuro)';
}

function mascaraTelefone(valor) {
  const v = valor.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 2) return v;
  if (v.length <= 7) return `(${v.slice(0,2)}) ${v.slice(2)}`;
  return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
}

function validar(dados) {
  const erros = {};

  if (!dados.nome || dados.nome.trim().length < 3) {
    erros.nome = 'O nome do participante precisa ter pelo menos 3 letras.';
  }
  if (!dados.nascimento) {
    erros.nascimento = 'Escolha a data de nascimento.';
  } else {
    const idade = AppUtils.calcularIdade(dados.nascimento);
    if (idade === null || idade < 0 || idade > 120) {
      erros.nascimento = 'Confira a data de nascimento — algo parece fora do comum.';
    }
  }
  if (!dados.responsavel || dados.responsavel.trim().length < 3) {
    erros.responsavel = 'Informe o nome do responsável legal.';
  }
  const wpp = (dados.whatsapp || '').replace(/\D/g, '');
  if (wpp.length !== 10 && wpp.length !== 11) {
    erros.whatsapp = 'O número de WhatsApp deve ter 10 ou 11 dígitos com DDD.';
  }
  const user = (dados.username || '').toLowerCase().trim();
  if (!user || user.length < 3 || user.length > 30) {
    erros.username = 'O usuário precisa ter entre 3 e 30 caracteres.';
  } else if (!/^[a-z0-9_]+$/.test(user)) {
    erros.username = 'Use apenas letras minúsculas, números e underline.';
  }
  if (!dados.senha || dados.senha.length < 8) {
    erros.senha = 'A senha precisa ter pelo menos 8 caracteres.';
  }
  if (!dados.codigo_convite || dados.codigo_convite.length < 8 || dados.codigo_convite.length > 64) {
    erros.codigo_convite = 'Informe o código de convite fornecido pela organização.';
  }
  if (!dados.como) {
    erros.como = 'Por favor, escolha como você conheceu o evento.';
  }
  if (!dados.consentimento) {
    erros.consentimento = 'Precisamos da sua concordância para prosseguir.';
  }

  return erros;
}

function mostrarErro(campo, mensagem) {
  const input = document.querySelector(`[name="${campo}"], #${campo}`);
  if (input) input.classList.add('error');
  const msg = document.querySelector(`[data-error-for="${campo}"]`);
  if (msg) {
    msg.textContent = mensagem;
    msg.classList.add('show');
  }
}

function limparErros(form) {
  form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  form.querySelectorAll('.form-error').forEach(el => el.classList.remove('show'));
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
