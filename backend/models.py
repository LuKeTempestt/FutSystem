"""
Modelos ORM SQLAlchemy 2.0 (estilo declarativo + mapped_column).

Modelo de acesso:
  - Usuario com role 'admin'  -> acesso total (painel administrativo)
  - Usuario com role 'user'   -> acesso limitado (sua propria inscricao)
  - Toda Inscricao tem um Usuario associado (criado no momento do registro)
  - Usuarios 'admin' podem existir sem inscricao (apenas operadores do evento)

Tabelas:
  - grupos        : grupos do campeonato
  - inscricoes    : dados do participante (vinculados a um Usuario role=user)
  - partidas      : partidas (fase de grupos e eliminatorias)
  - config        : configuracoes do evento (linha unica)
  - fair_play     : premio fair play atual (linha unica)
  - usuarios      : contas com login (admins e usuarios)
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Grupo(Base):
    __tablename__ = "grupos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    cor: Mapped[str] = mapped_column(String(30), default="")
    embaixador: Mapped[str] = mapped_column(String(120), default="")

    inscricoes: Mapped[list["Inscricao"]] = relationship(
        back_populates="grupo",
        cascade="save-update, merge",
    )


class Usuario(Base):
    """Conta com login. Pode ser admin ou usuario comum."""
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    senha_hash: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    # 'admin' | 'user'
    inscricao_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("inscricoes.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    inscricao: Mapped[Optional["Inscricao"]] = relationship(
        back_populates="usuario",
        foreign_keys=[inscricao_id],
    )


class Inscricao(Base):
    __tablename__ = "inscricoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    nascimento: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    responsavel: Mapped[str] = mapped_column(String(160), default="")
    # WhatsApp NAO e mais unique — varias inscricoes podem compartilhar
    # (caso comum: irmaos sob o mesmo responsavel)
    whatsapp: Mapped[str] = mapped_column(String(15), nullable=False, index=True)
    como_soube: Mapped[str] = mapped_column(String(60), default="")
    superpoder: Mapped[str] = mapped_column(String(80), default="")
    # Prova minima de consentimento. Registros antigos permanecem sem data e,
    # por isso, nao aparecem nas consultas publicas ate serem recadastrados.
    consentimento_versao: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    consentimento_em: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    grupo_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("grupos.id", ondelete="SET NULL"), nullable=True
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    grupo: Mapped[Optional["Grupo"]] = relationship(back_populates="inscricoes")
    usuario: Mapped[Optional["Usuario"]] = relationship(
        back_populates="inscricao",
        foreign_keys="Usuario.inscricao_id",
        uselist=False,
    )


class Partida(Base):
    __tablename__ = "partidas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fase: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    grupo_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("grupos.id", ondelete="SET NULL"), nullable=True
    )
    jogador_a_id: Mapped[int] = mapped_column(
        ForeignKey("inscricoes.id", ondelete="CASCADE"), nullable=False
    )
    jogador_b_id: Mapped[int] = mapped_column(
        ForeignKey("inscricoes.id", ondelete="CASCADE"), nullable=False
    )
    placar_a: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    placar_b: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    horario: Mapped[str] = mapped_column(String(60), default="")
    status: Mapped[str] = mapped_column(String(20), default="pendente")

    grupo: Mapped[Optional["Grupo"]] = relationship()
    jogador_a: Mapped["Inscricao"] = relationship(foreign_keys=[jogador_a_id])
    jogador_b: Mapped["Inscricao"] = relationship(foreign_keys=[jogador_b_id])


class Config(Base):
    """Linha unica (id=1) com as configuracoes do evento."""
    __tablename__ = "config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    nome_evento: Mapped[str] = mapped_column(String(160), default="Campeonato de Futebol Digital")
    homenagem: Mapped[str] = mapped_column(String(160), default="")
    data_evento: Mapped[str] = mapped_column(String(25), default="2026-05-20T13:00:00")
    local: Mapped[str] = mapped_column(String(160), default="AVOSOS, Aracaju/SE")
    whatsapp: Mapped[str] = mapped_column(String(15), default="")
    email: Mapped[str] = mapped_column(String(120), default="")
    endereco: Mapped[str] = mapped_column(String(160), default="Aracaju - SE, Brasil")
    inscricoes_abertas: Mapped[bool] = mapped_column(Boolean, default=True)


class FairPlay(Base):
    """Linha unica (id=1) com o premio fair play atual."""
    __tablename__ = "fair_play"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    nome: Mapped[str] = mapped_column(String(160), default="")
    motivo: Mapped[str] = mapped_column(Text, default="")
