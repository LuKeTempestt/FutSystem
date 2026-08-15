"""
Schemas Pydantic v2 — DTOs de entrada e saida da API.
"""
import re
from datetime import datetime, date
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator


USERNAME_REGEX = re.compile(r"^[a-z0-9_]+$")
CONSENTIMENTO_VERSAO_ATUAL = "2026-08-15"


def validar_username_str(v: str) -> str:
    """Normaliza e valida um username. Lanca ValueError em caso de invalido."""
    v = (v or "").strip().lower()
    if len(v) < 3 or len(v) > 30:
        raise ValueError("O usuario precisa ter entre 3 e 30 caracteres.")
    if not USERNAME_REGEX.match(v):
        raise ValueError("Use apenas letras minusculas, numeros e underline.")
    return v


# ---------- Grupos ----------
class GrupoBase(BaseModel):
    nome: str = Field(..., min_length=2, max_length=60)
    cor: str = ""
    embaixador: str = ""


class GrupoCreate(GrupoBase):
    pass


class GrupoUpdate(BaseModel):
    nome: Optional[str] = None
    cor: Optional[str] = None
    embaixador: Optional[str] = None


class GrupoOut(GrupoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Inscricoes ----------
class InscricaoBase(BaseModel):
    nome: str = Field(..., min_length=3, max_length=160)
    nascimento: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    responsavel: str = Field(default="", max_length=160)
    whatsapp: str = Field(..., min_length=10, max_length=15)
    como_soube: str = Field(default="", max_length=60)
    superpoder: str = Field(default="", max_length=80)


class InscricaoCreate(InscricaoBase):
    # username + senha criam a conta de login (role='user')
    username: str = Field(..., min_length=3, max_length=30)
    senha: str = Field(..., min_length=8, max_length=128)
    codigo_convite: str = Field(..., min_length=8, max_length=64)
    consentimento: Literal[True]
    consentimento_versao: Literal["2026-08-15"] = CONSENTIMENTO_VERSAO_ATUAL

    @field_validator("username")
    @classmethod
    def _normaliza_username(cls, v: str) -> str:
        return validar_username_str(v)

    @field_validator("nascimento")
    @classmethod
    def _valida_data_nascimento(cls, v: str) -> str:
        """Apenas valida que a data e logicamente real (nao no futuro,
        nao centenaria absurda). Nao limita por idade."""
        try:
            nasc = date.fromisoformat(v)
        except ValueError:
            raise ValueError("Data de nascimento invalida.")
        hoje = date.today()
        idade = hoje.year - nasc.year - ((hoje.month, hoje.day) < (nasc.month, nasc.day))
        if idade < 0 or idade > 120:
            raise ValueError("Data de nascimento fora do intervalo esperado.")
        return v


class InscricaoUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=3, max_length=160)
    nascimento: Optional[str] = None
    responsavel: Optional[str] = Field(default=None, max_length=160)
    whatsapp: Optional[str] = Field(default=None, min_length=10, max_length=15)
    como_soube: Optional[str] = Field(default=None, max_length=60)
    superpoder: Optional[str] = Field(default=None, max_length=80)
    grupo_id: Optional[int] = None


class InscricaoOut(InscricaoBase):
    """Versao COMPLETA da inscricao — apenas admins. Inclui dados pessoais."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    grupo_id: Optional[int] = None
    criado_em: datetime
    consentimento_versao: Optional[str] = None
    consentimento_em: Optional[datetime] = None


class ParticipanteOut(BaseModel):
    """Versao PUBLICA — apenas dados nao-sensiveis (para Album, Campeonato).
    Nao expoe data de nascimento, WhatsApp, responsavel etc."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    nome: str
    superpoder: str = ""
    grupo_id: Optional[int] = None


# ---------- Partidas ----------
FaseLiteral = Literal["grupos", "oitavas", "quartas", "semi", "final"]
StatusPartida = Literal["pendente", "concluida"]


class PartidaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    fase: str
    grupo_id: Optional[int] = None
    jogador_a_id: int
    jogador_b_id: int
    placar_a: Optional[int] = None
    placar_b: Optional[int] = None
    horario: str
    status: str


class PartidaResultado(BaseModel):
    placar_a: int = Field(..., ge=0, le=99)
    placar_b: int = Field(..., ge=0, le=99)


class PartidaUpdate(BaseModel):
    horario: Optional[str] = None
    placar_a: Optional[int] = None
    placar_b: Optional[int] = None
    status: Optional[StatusPartida] = None


# ---------- Classificacao ----------
class LinhaClassificacao(BaseModel):
    inscricao_id: int
    nome: str
    pj: int
    v: int
    e: int
    d: int
    gp: int
    gc: int
    sg: int
    pts: int


# ---------- Config ----------
class ConfigBase(BaseModel):
    nome_evento: Optional[str] = None
    homenagem: Optional[str] = None
    data_evento: Optional[str] = None
    local: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    endereco: Optional[str] = None
    inscricoes_abertas: Optional[bool] = None
    # Quando informado, sincroniza a lista de grupos (cria os que faltam,
    # remove os que nao estao mais). Comparacao ignora acentos.
    grupos_disponiveis: Optional[list[str]] = None


class ConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    nome_evento: str
    homenagem: str
    data_evento: str
    local: str
    whatsapp: str
    email: str
    endereco: str
    inscricoes_abertas: bool
    grupos_disponiveis: list[str] = []


# ---------- Fair Play ----------
class FairPlayUpdate(BaseModel):
    nome: str = Field(..., max_length=160)
    motivo: str = Field(..., max_length=600)


class FairPlayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    nome: str
    motivo: str


# ---------- Auth ----------
class LoginIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=1, max_length=128)


class LoginOut(BaseModel):
    token: str
    username: str
    role: str
    inscricao_id: Optional[int] = None


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    inscricao_id: Optional[int] = None
    ativo: bool
    criado_em: datetime


class AdminCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    senha: str = Field(..., min_length=12, max_length=128)

    @field_validator("username")
    @classmethod
    def _normaliza_username(cls, v: str) -> str:
        return validar_username_str(v)


class TrocaSenhaIn(BaseModel):
    senha_atual: str
    senha_nova: str = Field(..., min_length=8, max_length=128)


class MeuPerfilOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    inscricao: Optional[InscricaoOut] = None
