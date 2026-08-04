from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user_id
from .. import chroma_client
from .. import db
from ..schemas import JournalCreateRequest, JournalEntryResponse, JournalEntryType

router = APIRouter()


@router.get("/journal", response_model=list[JournalEntryResponse])
def list_journal(
    firebase_uid: str = Depends(get_current_user_id),
    entry_type: JournalEntryType | None = Query(None),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
) -> list[JournalEntryResponse]:
    user_id = db.get_user_id_by_firebase_uid(firebase_uid)
    if user_id is None:
        return []
    rows = db.list_journal_entries(
        user_id=user_id,
        entry_type=entry_type,
        limit=limit,
        offset=offset,
    )
    return [
        JournalEntryResponse(
            journal_id=row["journal_id"],
            entry_type=row["entry_type"],
            linked_ref_type=row["linked_ref_type"],
            linked_ref_id=row["linked_ref_id"],
            text_snapshot=row["text_snapshot"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@router.post("/journal", response_model=JournalEntryResponse)
def create_journal(req: JournalCreateRequest) -> JournalEntryResponse:
    if db.get_user_profile(req.user_id) is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    chroma_id = f"user:{req.user_id}:{uuid4().hex}"
    chroma_client.write_journal_embedding(
        chroma_id=chroma_id,
        user_id=req.user_id,
        entry_type="user_authored",
        text=req.text,
    )
    row = db.write_journal_row(
        user_id=req.user_id,
        entry_type="user_authored",
        linked_ref_type="none",
        linked_ref_id=None,
        chroma_id=chroma_id,
        text_snapshot=req.text,
    )
    return JournalEntryResponse(
        journal_id=row["journal_id"],
        entry_type=row["entry_type"],
        linked_ref_type=row["linked_ref_type"],
        linked_ref_id=row["linked_ref_id"],
        text_snapshot=row["text_snapshot"],
        created_at=row["created_at"],
    )
