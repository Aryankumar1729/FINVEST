from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import backend.app.tools as tools


tools.fetch_with_retry_and_cache.__kwdefaults__["cache_loader"] = lambda cache_key: None
tools.write_price_cache = lambda *args, **kwargs: None

from backend.app.tools import fetch_finapi_overlap, fetch_mf_nav


SCHEME_CODE = "120503"


def main() -> None:
    nav = fetch_mf_nav(SCHEME_CODE)
    overlap = fetch_finapi_overlap(SCHEME_CODE)
    print(json.dumps({"nav": nav, "overlap": overlap}, indent=2, default=str))


if __name__ == "__main__":
    main()
