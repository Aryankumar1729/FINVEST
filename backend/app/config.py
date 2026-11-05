from dotenv import load_dotenv

load_dotenv()

# PLACEHOLDER: replace with your real deployed frontend origin(s) before production.
CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

