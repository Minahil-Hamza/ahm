"""Sync push/pull (SPEC 7.4).

Rules implemented here:

- Idempotent by UUID: sending the same item again changes nothing and is
  reported as accepted, so a retry after a lost response cannot duplicate
  a record ("exactly once").
- Soft delete: a delete sets `deleted_at`; the row and its payload stay.
- Version conflict (the same record changed on two devices): the copy
  with the newer `updatedAt` becomes the live row (a tie goes to the
  server). The losing copy is stored verbatim in `sync_conflicts`.
- Same-date conflict (two different logs for one astronaut and date): the
  log already on the server stays live; the incoming one is stored in
  `sync_conflicts`. Records that belong to that incoming log are stored
  there too.
- Nothing in this module deletes a health record or its payload.
- The server's own clock is used only for `serverTime` and the pull
  cursor (`server_updated_at`); ordering between copies uses each
  record's `updatedAt` plus `version` (SPEC 17 item 8).
"""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AdviceFollowup,
    Astronaut,
    AuditLog,
    DailyLog,
    Evaluation,
    Reminder,
    SurgeonNote,
    SymptomEntry,
    SyncConflict,
    SyncDevice,
    utcnow,
)
from app.schemas.sync import RECORD_SCHEMAS, PushItem

MODELS: dict[str, type] = {
    "astronaut": Astronaut,
    "daily_log": DailyLog,
    "symptom_entry": SymptomEntry,
    "evaluation": Evaluation,
    "advice_followup": AdviceFollowup,
    "reminder": Reminder,
    "surgeon_note": SurgeonNote,
}

# Pull order: parents before children, so a device can apply in order.
PULL_ORDER = (
    "astronaut",
    "daily_log",
    "symptom_entry",
    "evaluation",
    "advice_followup",
    "reminder",
    "surgeon_note",
)

_LOG_VALUE_FIELDS = (
    "heart_rate",
    "bp_systolic",
    "bp_diastolic",
    "glucose_mgdl",
    "temperature_c",
    "spo2",
    "sleep_hours",
    "sleep_quality",
    "mood",
    "stress",
    "team_relations",
    "weight_kg",
    "exercise_resistance_min",
    "exercise_cardio_min",
    "water_ml",
    "radiation_msv",
)


def _maybe_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value))
    except (ValueError, TypeError):
        return None


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _days_of_week(weekday: int | None) -> list[int]:
    """App: unset = every day, 0..6 with 0 = Sunday. Server column:
    1 = Monday .. 7 = Sunday."""
    if weekday is None:
        return [1, 2, 3, 4, 5, 6, 7]  # no-fake-data-ok: weekdays Mon..Sun, not health data
    return [7 if weekday == 0 else weekday]


def _columns(entity: str, record: Any) -> dict[str, Any]:
    """Typed column values for server-side queries (crew list, ground
    views). The full record is kept separately in `payload`."""
    if entity == "astronaut":
        return {
            "display_name": record.name,
            "crew_code": record.crewCode.strip().upper(),
            "role": record.role,
            "environment": record.environment,
            "mission_start": record.missionStart,
            "mission_end": record.missionEnd,
            "gravity_changed_on": record.gravityChangedOn,
            "client_pin_hash": record.pinHash,
            "client_pin_salt": record.pinSalt,
            "is_active": record.isActive,
            "created_at": as_utc(record.createdAt),
        }
    if entity == "daily_log":
        values = {field: getattr(record, field) for field in _LOG_VALUE_FIELDS}
        return {
            **values,
            "astronaut_id": record.astronautId,
            "log_date": record.date,
            "is_backdated": record.isBackdated,
            "eva_today": bool(record.eva_today),
            "created_at": as_utc(record.createdAt),
        }
    if entity == "symptom_entry":
        return {
            "log_id": record.logId,
            "astronaut_id": record.astronautId,
            "symptom": record.symptom,
            "severity": record.severity,
            "created_at": as_utc(record.createdAt),
        }
    if entity == "evaluation":
        return {
            "log_id": record.logId,
            "astronaut_id": record.astronautId,
            "overall_status": record.overallStatus,
            "rules_version": record.rulesVersion,
            "result_json": record.result,
            "created_at": as_utc(record.createdAt),
        }
    if entity == "advice_followup":
        return {
            "astronaut_id": record.astronautId,
            "evaluation_id": record.evaluationId,
            "action_id": record.actionId,
            "followup_date": record.date,
            "response": record.response,
            "created_at": as_utc(record.createdAt),
        }
    if entity == "reminder":
        return {
            "astronaut_id": record.astronautId,
            "kind": record.kind,
            "local_time": record.time,
            "days_of_week": _days_of_week(record.weekday),
            "message": record.label,
            "enabled": record.enabled,
            "created_at": as_utc(record.createdAt),
        }
    if entity == "surgeon_note":
        return {
            "astronaut_id": record.astronautId,
            "author_id": record.authorId,
            "text": record.text,
            "created_at": as_utc(record.createdAt),
        }
    raise ValueError(entity)


async def _apply_audit_entry(
    session: AsyncSession, item: PushItem
) -> tuple[str, dict[str, Any] | None]:
    """Access-log entries are append-only and one-way (device -> server):
    stored once, keyed by the app's id, never updated, never sent back."""
    if item.op != "upsert" or item.data is None:
        return "rejected", {"reason": "An access-log entry cannot be changed or deleted."}
    try:
        record = RECORD_SCHEMAS["audit_entry"].model_validate(item.data)
    except ValidationError as error:
        first = error.errors()[0]
        location = ".".join(str(part) for part in first["loc"])
        return "rejected", {"reason": f"{location}: {first['msg']}"}
    if record.id != item.id:
        return "rejected", {"reason": "The record id does not match the item id."}
    already = (
        await session.execute(select(AuditLog).where(AuditLog.client_id == item.id))
    ).scalar_one_or_none()
    if already is None:
        session.add(
            AuditLog(
                client_id=item.id,
                actor=f"{record.viewerCrewCode} ({record.viewerRole})",
                action=record.action,
                entity="astronaut",
                entity_id=record.astronautId,
                at=as_utc(record.at),
            )
        )
    return "accepted", None


def _row_version(row: Any) -> int:
    return getattr(row, "version", 1)


def _row_updated_at(row: Any) -> datetime:
    return as_utc(getattr(row, "updated_at", None) or row.created_at)  # type: ignore[return-value]


def _archive(
    session: AsyncSession,
    *,
    entity: str,
    entity_id: UUID,
    astronaut_id: UUID | None,
    device_id: UUID,
    kind: str,
    loser: str,
    version: int | None,
    payload: dict | None,
) -> None:
    session.add(
        SyncConflict(
            entity=entity,
            entity_id=entity_id,
            astronaut_id=astronaut_id,
            device_id=device_id,
            kind=kind,
            loser=loser,
            losing_version=version,
            losing_payload=payload,
        )
    )


def _conflict(item: PushItem, kind: str, row: Any | None) -> dict[str, Any]:
    return {
        "id": item.id,
        "entity": item.entity,
        "kind": kind,
        "serverVersion": _row_version(row) if row is not None else None,
        "serverData": row.payload if row is not None else None,
        "serverDeleted": bool(row is not None and getattr(row, "deleted_at", None)),
    }


async def _apply_upsert(
    session: AsyncSession, item: PushItem, device_id: UUID
) -> tuple[str, dict[str, Any] | None]:
    """Returns ("accepted" | "conflict" | "rejected", detail)."""
    data = item.data
    if data is None:
        return "rejected", {"reason": "An upsert needs the record in `data`."}
    if item.entity == "surgeon_note":
        # Only a surgeon's notes are accepted, whatever device sent them.
        author = await session.get(Astronaut, _maybe_uuid(data.get("authorId")))
        if author is None or author.role != "surgeon":
            return "rejected", {"reason": "Only the flight surgeon can add notes."}
    try:
        record = RECORD_SCHEMAS[item.entity].model_validate(data)
    except ValidationError as error:
        first = error.errors()[0]
        location = ".".join(str(part) for part in first["loc"])
        return "rejected", {"reason": f"{location}: {first['msg']}"}
    if record.id != item.id:
        return "rejected", {"reason": "The record id does not match the item id."}

    model = MODELS[item.entity]
    columns = _columns(item.entity, record)
    astronaut_id = columns.get("astronaut_id") or (
        item.id if item.entity == "astronaut" else None
    )
    incoming_updated = as_utc(item.updatedAt) or as_utc(
        getattr(record, "updatedAt", None) or record.createdAt
    )
    incoming_version = item.version

    if item.entity != "astronaut":
        owner = await session.get(Astronaut, columns["astronaut_id"])
        if owner is None:
            return "rejected", {"reason": "That astronaut is not on the server yet."}

    existing = await session.get(model, item.id)

    if existing is None:
        if item.entity in ("symptom_entry", "evaluation"):
            parent = await session.get(DailyLog, columns["log_id"])
            if parent is None:
                _archive(
                    session,
                    entity=item.entity,
                    entity_id=item.id,
                    astronaut_id=astronaut_id,
                    device_id=device_id,
                    kind="parent_missing",
                    loser="client",
                    version=incoming_version,
                    payload=data,
                )
                return "conflict", _conflict(item, "parent_missing", None)
        if item.entity == "daily_log":
            same_date = (
                await session.execute(
                    select(DailyLog).where(
                        DailyLog.astronaut_id == columns["astronaut_id"],
                        DailyLog.log_date == columns["log_date"],
                    )
                )
            ).scalar_one_or_none()
            if same_date is not None:
                _archive(
                    session,
                    entity=item.entity,
                    entity_id=item.id,
                    astronaut_id=astronaut_id,
                    device_id=device_id,
                    kind="same_date",
                    loser="client",
                    version=incoming_version,
                    payload=data,
                )
                return "conflict", _conflict(item, "same_date", same_date)
        row = model(id=item.id, **columns)
        if hasattr(row, "version"):
            row.version = incoming_version
        if hasattr(row, "updated_at"):
            row.updated_at = incoming_updated
        row.payload = data
        session.add(row)
        return "accepted", None

    # ---- the record already exists on the server ----
    existing_version = _row_version(existing)
    if existing.payload == data and getattr(existing, "deleted_at", None) is None:
        return "accepted", None  # replay of something already stored

    if incoming_version <= existing_version and hasattr(existing, "version"):
        server_updated = _row_updated_at(existing)
        if incoming_updated is None or incoming_updated <= server_updated:
            # Server copy wins and stays live; keep the device's copy.
            _archive(
                session,
                entity=item.entity,
                entity_id=item.id,
                astronaut_id=astronaut_id,
                device_id=device_id,
                kind="version",
                loser="client",
                version=incoming_version,
                payload=data,
            )
            return "conflict", _conflict(item, "version", existing)
        # Device copy is newer: it becomes live; keep the server's copy.
        _archive(
            session,
            entity=item.entity,
            entity_id=item.id,
            astronaut_id=astronaut_id,
            device_id=device_id,
            kind="version",
            loser="server",
            version=existing_version,
            payload=existing.payload,
        )
        incoming_version = existing_version + 1
        data = {**data, "version": incoming_version}

    for field, value in columns.items():
        if field == "created_at":
            continue
        setattr(existing, field, value)
    if hasattr(existing, "version"):
        existing.version = incoming_version
    if hasattr(existing, "updated_at"):
        existing.updated_at = incoming_updated
    if hasattr(existing, "deleted_at"):
        existing.deleted_at = None
    if item.entity == "evaluation":
        existing.created_at = columns["created_at"]
    existing.payload = data
    return "accepted", None


async def _apply_delete(
    session: AsyncSession, item: PushItem
) -> tuple[str, dict[str, Any] | None]:
    if item.entity == "surgeon_note":
        return "rejected", {"reason": "A surgeon note cannot be deleted."}
    model = MODELS[item.entity]
    if not hasattr(model, "deleted_at"):
        return "rejected", {"reason": f"A {item.entity} cannot be deleted."}
    existing = await session.get(model, item.id)
    if existing is None or existing.deleted_at is not None:
        return "accepted", None  # nothing to do; deleting twice is fine
    now = utcnow()
    existing.deleted_at = now
    existing.updated_at = as_utc(item.updatedAt) or now
    existing.version = _row_version(existing) + 1
    return "accepted", None


async def push(
    session: AsyncSession, device_id: UUID, items: list[PushItem]
) -> dict[str, Any]:
    accepted: list[UUID] = []
    conflicts: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for item in items:
        try:
            # One savepoint per item: a bad item cannot undo the others.
            async with session.begin_nested():
                if item.entity == "audit_entry":
                    outcome, detail = await _apply_audit_entry(session, item)
                elif item.op == "upsert":
                    outcome, detail = await _apply_upsert(session, item, device_id)
                else:
                    outcome, detail = await _apply_delete(session, item)
                await session.flush()
        except IntegrityError as error:
            reason = "The server refused this record."
            if item.entity == "astronaut" and "crew_code" in str(error.orig):
                reason = "That crew ID is already registered with a different identity."
            outcome, detail = "rejected", {"reason": reason}

        if outcome == "accepted":
            accepted.append(item.id)
        elif outcome == "conflict":
            conflicts.append(detail)  # type: ignore[arg-type]
        else:
            rejected.append({"id": item.id, "entity": item.entity, **(detail or {})})

    device = await session.get(SyncDevice, device_id)
    if device is None:
        session.add(SyncDevice(id=device_id, last_seen_at=utcnow()))
    else:
        device.last_seen_at = utcnow()
    await session.commit()
    return {
        "accepted": accepted,
        "conflicts": conflicts,
        "rejected": rejected,
        "serverTime": utcnow(),
    }


async def pull(session: AsyncSession, since: datetime | None) -> dict[str, Any]:
    """Everything changed on the server at or after `since` (all of it if
    `since` is omitted). `serverTime` is read BEFORE the queries, so using
    it as the next `since` can re-deliver a change but never skip one."""
    server_time = utcnow()
    since_utc = as_utc(since)
    changes: dict[str, list[dict[str, Any]]] = {}
    for entity in PULL_ORDER:
        model = MODELS[entity]
        query = select(model).where(model.payload.is_not(None))
        if since_utc is not None:
            query = query.where(model.server_updated_at >= since_utc)
        rows = (await session.execute(query.order_by(model.server_updated_at))).scalars().all()
        changes[entity] = [
            {
                "id": row.id,
                "version": _row_version(row),
                "updatedAt": _row_updated_at(row),
                "deleted": bool(getattr(row, "deleted_at", None)),
                "data": row.payload,
            }
            for row in rows
        ]
    return {"serverTime": server_time, "changes": changes}
