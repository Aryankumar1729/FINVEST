from __future__ import annotations

import os
from typing import Any

import chromadb
from google.genai import types

from .gemini_client import get_gemini_client
from dotenv import load_dotenv

load_dotenv()

def get_chroma_client() -> chromadb.ClientAPI:
    # Relies on CHROMA_API_KEY, CHROMA_TENANT, CHROMA_DATABASE (read by CloudClient).
    return chromadb.CloudClient(
        api_key=os.environ.get("CHROMA_API_KEY"),
        tenant=os.environ.get("CHROMA_TENANT"),
        database=os.environ.get("CHROMA_DATABASE"),
    )


def get_journal_collection(client: chromadb.ClientAPI) -> chromadb.Collection:
    return client.get_or_create_collection(name="journal_entries")


def embed_text(text: str, task_type: str) -> list[float]:
    client = get_gemini_client()
    result = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(task_type=task_type),
    )
    return result.embeddings[0].values


def write_journal_embedding(*, chroma_id: str, user_id: str, entry_type: str, text: str) -> None:
    vector = embed_text(text, task_type="RETRIEVAL_DOCUMENT")
    get_journal_collection(get_chroma_client()).add(
        ids=[chroma_id],
        embeddings=[vector],
        documents=[text],
        metadatas=[{"user_id": user_id, "entry_type": entry_type}],
    )


def query_journal(*, user_id: str, query_text: str, k: int = 5) -> list[dict[str, Any]]:
    vector = embed_text(query_text, task_type="RETRIEVAL_QUERY")
    result = get_journal_collection(get_chroma_client()).query(
        query_embeddings=[vector],
        n_results=k,
        where={"user_id": user_id},
        include=["metadatas", "documents", "distances"],
    )
    ids = (result.get("ids") or [[]])[0]
    docs = (result.get("documents") or [[]])[0]
    metas = (result.get("metadatas") or [[]])[0]
    dists = (result.get("distances") or [[]])[0]
    return [
        {
            "chroma_id": ids[i],
            "text": docs[i],
            "entry_type": (metas[i] or {}).get("entry_type"),
            "distance": dists[i],
        }
        for i in range(len(ids))
    ]
