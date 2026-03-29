"""SQLAlchemy declarative base setup."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    github_event_type: Mapped[str] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(50), default="")
    repo: Mapped[str] = mapped_column(String(255))
    payload_json: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    workflow_run_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
