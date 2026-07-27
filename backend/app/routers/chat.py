from fastapi import APIRouter, HTTPException

from ..orchestrator.orchestrator import handle_chat
from ..schemas import ChatRequest, ChatResponse

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    try:
        return await handle_chat(req.user_id, req.message, req.conversation_id)
    except Exception as exc:
        # Include type name: some SDK errors (e.g. bare AssertionError) have empty str(exc).
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {type(exc).__name__}: {exc}",
        ) from exc
