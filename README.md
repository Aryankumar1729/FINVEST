# FINVEST — AI Financial Operating System

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.139+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Gemini](https://img.shields.io/badge/Google_Gemini-3.1_Flash--Lite-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector_Store-FF6F00?style=for-the-badge)](https://www.trychroma.com)

**Finvest** is an institutional-grade autonomous personal wealth management, tax optimization, and AI advisory platform. Unlike traditional personal finance applications that function purely as passive record-keepers, Finvest pairs **deterministic mathematical calculation engines** (zero-hallucination FIFO capital gains, tax computation, and portfolio drift math) with an **autonomous multi-stage AI intelligence layer** powered by Google Gemini and ChromaDB.

---

## Architecture Overview

Finvest is built as a **Modular Monolith** with domain boundary isolation, backed by a Single-Page Application (SPA) frontend and a dual-store persistence model (PostgreSQL for ACID transactional data, ChromaDB for semantic memory).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              React 18 Single-Page Application                          │
│                      (Vite, TypeScript, TailwindCSS, Radix UI, Recharts)               │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ HTTPS / REST (RS256 Bearer JWT)
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         FastAPI Application Server (Modular Monolith)                  │
│                                                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │ Firebase Auth Engine │  │ Pydantic V2 Schemas  │  │ psycopg_pool Connection Pool │  │
│  │ (Stateless RSA Check)│  │ (Strict DTO Schemas) │  │ (Thread-Safe DB Pooling)     │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────────────────┘  │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                               Domain Subsystems                                  │  │
│  │   /onboarding    /portfolio    /invest    /tax    /goal    /journal    /chat     │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│           │                     │             │         │                │             │
│           │  Deterministic Math │             │ Dual    │ Tool Use / RAG │ Context     │
│           ▼                     ▼             │ Write   ▼                ▼ Snapshot    │
│  ┌─────────────────────────────────┐          │  ┌──────────────────────────────────┐  │
│  │   Deterministic Engines         │          │  │     AI Orchestration Subsystem   │  │
│  │   - FIFO Lot Decrementing       │          │  │   - Gemini Generative Chat       │  │
│  │   - Capital Gains Tax Evaluator │          │  │   - Two-Stage Stock Screener     │  │
│  │   - Strategy Drift Calculator   │          │  │   - Dynamic Prompt Assembler     │  │
│  └─────────────────────────────────┘          │  │   - Semantic Journal RAG Memory  │  │
│                                               │  └──────────────────────────────────┘  │
└───────────────────────────────────────────────┼────────────────────────────────────────┘
                                                │                    │
                        ACID SQL Reads / Writes │                    │ Dense Vector Queries
                                                ▼                    ▼
┌───────────────────────────────┐   ┌──────────────────────────┐   ┌─────────────────────────┐
│     Firebase Auth Service     │   │   PostgreSQL Database    │   │  ChromaDB Vector Store  │
│   (Google Identity Provider)  │   │  - 13 Core Ledger Tables │   │  - Semantic Audit Logs  │
│   - RS256 Token Issuance      │   │  - ACID Transactions     │   │  - Cosine Sim Search    │
│   - Public Key Distribution   │   │  - JSONB Strategy Config │   │  - Tenant-Filtered RAG  │
└───────────────────────────────┘   └──────────────────────────┘   └─────────────────────────┘
```

---

## Core Capabilities

### 1. Granular Tax-Lot Portfolio Ledger
* **Discrete Lot Tracking**: Every asset purchase creates an immutable record tracking acquisition date, price (`numeric(18,4)`), original quantity, remaining units, and associated life goals.
* **Concurrency Controls**: Order execution uses pessimistic row locking (`SELECT ... FOR UPDATE`) and ACID transactions to ensure zero phantom deductions or race conditions.
* **Unified Balance Sheet**: Real-time aggregation of cash reserves, Nifty 500 equities, AMFI mutual funds, fixed income, and liabilities.

### 2. Deterministic FIFO Capital Gains & Tax Engine
* **Statutory Compliance**: Calculates Short-Term Capital Gains (STCG) and Long-Term Capital Gains (LTCG) following Indian Income Tax rules.
* **FIFO Lot Depletion**: Liquidations automatically decrement oldest lots first, computing exact holding period durations.
* **Loss Set-off & Carry-Forward**: Implements Section 74 statutory rules (STCG losses offset both STCG and LTCG gains; LTCG losses offset only LTCG gains) across an 8-year statutory window.
* **Immutable Tax Audit Records**: Every sale writes calculated tax, holding duration, and gain classifications to permanent `sell_allocations` rows.

### 3. Two-Stage AI Stock Recommendation Engine
Solves context window saturation and token wastage when screening hundreds of market equities:
* **Stage 1 (Macro Market Screen)**: Compresses the entire market universe into dense tabular data and runs a macro evaluation via Google Gemini to filter ~500 listings down to an 80–120 symbol candidate shortlist. Validated with an exact-match anti-hallucination check against the database and cached in PostgreSQL (`stock_shortlist_cache`) for 24 hours.
* **Stage 2 (Personalized User Matching)**: Merges the candidate shortlist with the user's live profile (risk tier, cash reserves, sector concentration from existing holdings, goal horizons). Gemini outputs 5–10 personalized buy recommendations with strict JSON schema constraints, confidence levels (`High` / `Moderate`), and tailored rationales.

### 4. Financial Goal Engineering & Strategy Formulation
* **Strategy Triad Pipeline**: Generates three distinct allocation blueprints (Conservative, Moderate, Aggressive) spanning equities, debt, mutual funds, and gold.
* **PostgreSQL `JSONB` Storage**: Strategy allocation structures and projected contributions are stored in JSONB columns for schema flexibility while preserving relational integrity.
* **Portfolio Drift Detection**: Computes live delta between target allocations and actual holdings ($\Delta \text{Allocation} = \text{Actual}_{\%} - \text{Target}_{\%}$), generating deviation alerts when market swings imbalance risk profiles.

### 5. Conversational Financial Agent & Semantic Memory (RAG)
* **Grounded Context Injection**: Assembles real-time financial snapshots (salary, expenses, net worth, open lots, liabilities, goals) into the model prompt before response generation.
* **ChromaDB Semantic Memory**: Dual-writes financial milestones and user decisions into an audit journal and ChromaDB vector store, enabling historical recall via cosine similarity search without prompt bloat.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, Radix UI Primitives, Lucide React, Recharts, Framer Motion |
| **Backend** | Python 3.11+, FastAPI, Pydantic V2, `uvicorn`, `psycopg_pool` (Thread-safe pool) |
| **AI / LLM** | Google GenAI SDK (`google-genai`), Gemini 3.1 Flash-Lite, Structured JSON output mode |
| **Databases** | PostgreSQL (Relational Source of Truth), ChromaDB (Vector Store) |
| **Market Data** | `yfinance` (real-time equity quotes), AMFI NAV feed (mutual funds) |
| **Security** | Firebase Auth (RS256 JWT validation), Row-Level Tenant Isolation (`user_id = %s`) |

---

## Project Structure

```
finance/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI application factory & middleware
│   │   ├── auth.py                 # Firebase JWT verification & user_id resolver
│   │   ├── config.py               # Application configuration & CORS settings
│   │   ├── db.py                   # PostgreSQL connection pool & query helpers
│   │   ├── schemas.py              # Pydantic request/response data contracts
│   │   ├── tools.py                # AI agent tools & calculation routines
│   │   ├── gemini_client.py        # Google GenAI client initialization
│   │   ├── chroma_client.py        # ChromaDB vector store client & embeddings
│   │   ├── orchestrator/           # Agentic loop & dynamic prompt assembly
│   │   └── routers/
│   │       ├── chat.py             # Conversational AI assistant endpoint
│   │       ├── goal.py             # Goal CRUD & strategy triad formulation
│   │       ├── invest.py           # Stock & MF catalog, orders & AI recommendations
│   │       ├── journal.py          # Audit log & semantic search
│   │       ├── onboarding.py       # Risk questionnaire & profile initialization
│   │       ├── portfolio.py        # Holdings, net worth & balance sheet
│   │       ├── profile.py          # User profile & liabilities management
│   │       └── tax.py              # Capital gains calculations & tax reports
│   └── scripts/
│       ├── seed_catalog.py         # Seeds initial equity & mutual fund catalog
│       ├── seed_nifty500.py        # Seeds Nifty 500 equities into database
│       └── refresh_nav_amfi.py     # Live AMFI mutual fund NAV synchronization
├── database/
│   ├── schema.sql                  # Primary PostgreSQL schema (13 tables)
│   └── migrations/                 # Incremental SQL migration scripts
├── frontend/
│   ├── src/
│   │   ├── app/routes.tsx          # Application routing & navigation
│   │   ├── context/AuthContext.tsx # Firebase authentication context provider
│   │   ├── lib/api.ts              # Authenticated REST client wrapper
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # Net worth overview & asset allocation
│   │   │   ├── InvestScreen.tsx    # Equities & mutual funds catalog with AI picks
│   │   │   ├── InvestDetailView.tsx# Asset detail, live charts & buy/sell modal
│   │   │   ├── GoalsScreen.tsx     # Goal tracking & strategy deviation alerts
│   │   │   ├── TaxScreen.tsx       # FIFO capital gains & tax loss harvesting
│   │   │   ├── AIScreen.tsx        # Conversational AI assistant interface
│   │   │   ├── ProfileScreen.tsx   # Income, liabilities & risk score settings
│   │   │   ├── Onboarding.tsx      # Multi-step financial onboarding flow
│   │   │   └── Login.tsx           # Firebase email/password & Google OAuth
│   │   └── components/             # Reusable UI component library (Radix UI)
│   ├── package.json
│   └── vite.config.ts
├── run.py                          # Backend entrypoint (uvicorn on port 8000)
├── requirements.txt                # Python dependencies
└── README.md
```

---

## Getting Started

### Prerequisites
* **Python 3.11+**
* **Node.js 18+** & `npm`
* **PostgreSQL 14+** (running locally or cloud-hosted)
* **Google Gemini API Key** ([Google AI Studio](https://aistudio.google.com/))
* **Firebase Project** (with Authentication enabled)

---

### 1. Database Setup

Create a PostgreSQL database and run the schema and migration scripts:

```bash
# Create database
createdb finance

# Apply base schema
psql -d finance -f database/schema.sql

# Apply migrations
for file in database/migrations/*.sql; do
  psql -d finance -f "$file"
done
```

---

### 2. Backend Configuration & Setup

1. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the project root:
   ```env
   # Database
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finance

   # Google Gemini API
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-3.1-flash-lite

   # Firebase Authentication
   GOOGLE_APPLICATION_CREDENTIALS=backend/firebase-service-account.json

   # Environment
   ENV=development
   # Set to "true" to bypass Firebase verification during local offline testing:
   AUTH_DISABLED=false
   ```

4. **Seed Market Catalog:**
   ```bash
   # Seed Nifty 500 stocks and initial catalog
   python -m backend.scripts.seed_catalog
   python -m backend.scripts.seed_nifty500

   # Sync live Mutual Fund NAVs from AMFI
   python -m backend.scripts.refresh_nav_amfi
   ```

5. **Start the Backend API Server:**
   ```bash
   python run.py
   ```
   The API will be available at `http://localhost:8000` with interactive Swagger docs at `http://localhost:8000/docs`.

---

### 3. Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Frontend Environment Variables:**
   Create a `frontend/.env` file:
   ```env
   VITE_API_BASE_URL=http://localhost:8000

   # Firebase Web App Config
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

4. **Start the Frontend Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## Database Schema Highlights

The database encompasses 13 core relational tables engineered with strict foreign key constraints and audit tracing:

| Table | Purpose |
|---|---|
| `users_profile` | User identity, `firebase_uid`, monthly income, cash reserves, and risk profile scores. |
| `stocks` | Market equity catalog (symbol, name, sector, P/E, 52W high/low, volume ratios). |
| `mutual_funds` | Mutual fund catalog with AMFI scheme codes, NAV history, and categories. |
| `lots` | Immutable asset purchase ledger tracking quantities, purchase prices, and dates. |
| `sell_allocations` | Permanent FIFO liquidation records with computed LTCG/STCG tax and assessment years. |
| `goals` | Financial aspirations with target amounts, horizons, and selected strategy variants. |
| `goal_strategy_variants`| AI-formulated allocation strategies stored in dynamic `JSONB` structures. |
| `liabilities` | Debt tracking (home loans, personal loans, credit cards) with interest rates and EMIs. |
| `journal` | Immutable audit log of all financial events and state changes. |
| `stock_shortlist_cache` | 24-hour cache for Stage 1 macro equity shortlist. |
| `tax_config` | Statutory tax rates and exemption limits by fiscal assessment year. |

---

## Security & Reliability

* **Zero-Trust Identity**: Asymmetric verification of RS256 JWT signatures directly on the application server using cached Google public certificates.
* **Multi-Tenant Isolation**: Every database query is strictly parameterized by the verified `user_id`.
* **Pessimistic Concurrency**: `SELECT ... FOR UPDATE` row locks prevent double-spending or overselling of investment lots.
* **Anti-Hallucination Gate**: LLM-generated stock tickers are cross-referenced against the relational database before reaching the client or persistence layers.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
