from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from google import genai


@lru_cache(maxsize=None)
def get_gemini_client() -> Any:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    return genai.Client(api_key=api_key) if api_key else genai.Client()
