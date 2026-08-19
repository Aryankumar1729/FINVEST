from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user_id
from .. import db
from ..orchestrator.orchestrator import handle_chat
from ..schemas import ChatRequest, ChatResponse

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    firebase_uid: str = Depends(get_current_user_id),
) -> ChatResponse:
    user_id = db.get_user_id_by_firebase_uid(firebase_uid)
    if user_id is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    try:
        return await handle_chat(user_id, req.message, req.conversation_id)
    except Exception as exc:
        # Include type name: some SDK errors (e.g. bare AssertionError) have empty str(exc).
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {type(exc).__name__}: {exc}",
        ) from exc
