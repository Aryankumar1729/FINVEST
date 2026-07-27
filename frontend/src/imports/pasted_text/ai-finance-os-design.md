I have an AI Financial Operating System app design in progress. This is a fresher-level portfolio project — a personal finance dashboard with 4 backend agents (Investment/News, Portfolio & Tax, Goals, Q/A Chat Orchestrator). I need you to adjust my existing design so every screen, button, and data field matches what the real backend actually supports — nothing more, nothing less. Don't redesign the visual style; only adjust content, labels, CTAs, and data fields where they don't match the real capabilities listed below.

App flow / navigation structure
Sidebar has exactly 5 tabs: Dashboard, Invest, Goals, Tax, Profile. No other tabs.
Dashboard and Portfolio are merged into one screen — not separate tabs.
Chat is NOT a sidebar tab. It's a persistent floating bubble in the bottom-right corner, visible on every screen except Onboarding. Clicking it opens a ~380px slide-out drawer, not a full page.
Onboarding is a separate one-time flow — no sidebar visible, shown only on first use. It's also re-triggerable later from a "Update Investment Style" button on the Profile screen (same risk-questionnaire component, not a full onboarding replay).
There is no "Journal" tab or screen — that data exists in the backend but is intentionally not user-facing.
Screen-by-screen: what's real vs. what needs adjusting

1. Dashboard (merged with Portfolio)

Real endpoints: fetch portfolio holdings, buy an asset, sell an asset.
Buy takes: symbol, quantity. Sell takes: symbol, quantity (capped at however much is currently held — don't let the design imply selling more than owned).
Real outputs: 4 summary cards (portfolio value, unpaid tax total, goals progress %, net worth), a holdings table showing gain/loss per position, a goals-at-a-glance widget.
Trend chart: no historical price data exists in the backend at all for any asset class. Design this chart as clearly a placeholder/mock visual — don't make it look like it's pulling live historical data, since it currently can't.

2. Invest

Real endpoints: separate fetch calls for Stocks, Mutual Funds, FD, and Gold, each returning a list; each of Stocks and MF also has a detail view.
Use a single horizontal segmented pill switcher at the top: Stocks | Mutual Funds | FD | Gold — one shared list-to-detail layout, swapping data source per pill. Don't design 4 separate page layouts.
FD should be a static table, not a card grid — there's no FD detail view.
Stocks pill should include an "AI Recommendations" row/section — this is a real backend feature (Gemini-generated stock suggestions).
CTA labels — important, adjust conservatively:
Stocks: keep a working "Buy" CTA on cards — real purchase functionality is confirmed to exist for stocks.
Mutual Funds and FD: do NOT use "Buy Now" / "Invest Now" language. Relabel these to "View Details" only — there is no confirmed purchase pathway for MF or FD yet.
Gold: this is uncertain — gold price data lives in the same table as stocks, so it may or may not support a real buy action. For now, design Gold's CTA as easily swappable between "Buy" and "View Details" (e.g. a clearly separated button component) rather than baking in one assumption — this gets finalized once the backend is confirmed.
Detail view chart (for Stocks/MF): same placeholder rule as Dashboard — no real historical series exists, so the chart is mock data for now, not a live feed.

3. Goals

Real endpoints: create a goal (name, target amount, target date), select a goal strategy.
Real outputs: goal cards with a progress bar and status badge; when creating a goal, the backend returns multiple strategy variants for the user to pick from — design a strategy-selection step/cards, not a single fixed strategy.

4. Tax

Real endpoint outputs (don't add fields beyond these — the schema doesn't currently break down further than this): an aggregate unpaid tax liability total, a separate salary tax line item, and a per-sale-allocation table (each row: asset, sale date, computed tax, paid/unpaid status).
"Pay" action: this is a confirmation-only action per row (no amount entry field, no partial payment) — flips that row to paid. Don't design an amount-input field for paying tax.
Don't design any slab-wise or category-wise tax breakdown visual (e.g. "short-term vs long-term" split charts) — that level of detail isn't confirmed to exist in the data yet.

5. Profile

Salary/income and liabilities: the backend requires ALL related fields to be submitted together in one write — there's no partial single-field update. Design this as one form that saves as a unit, not individually-editable inline fields that save one at a time.
Include a risk tier badge (current risk profile) and an "Update Investment Style" button that re-opens the risk questionnaire.

6. Chat drawer

This is a conversational agent that can actually take actions across Portfolio, Goals, and Tax (it's not just Q&A) — design it as a standard chat thread UI, no special action-confirmation UI needed beyond normal chat bubbles.

7. Onboarding

One-time flow collecting whatever the risk questionnaire needs, ending in a submitted risk profile. Same component gets reused later from Profile.
General rule for the whole design

If any screen currently has a button, chart, or data field implying a backend capability not listed above, either remove it or relabel it to something view-only/informational rather than actionable. When in doubt, make it non-committal (view-only) rather than promising an action — it's easier to add a real "Buy" button later once confirmed than to walk one back after it's wired.