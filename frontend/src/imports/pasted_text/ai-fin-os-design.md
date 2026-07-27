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
Exact flow: this is the landing screen after login. On load it fetches and shows the 4 summary cards + holdings table + goals widget immediately (no user action needed to see them). From the holdings table, each row has a Buy and Sell action — clicking either opens a modal (Buy modal: symbol pre-filled from the row + quantity input; Sell modal: same, but quantity input is capped/validated against that row's held amount). On submit, the modal closes and the holdings table + the affected summary cards (portfolio value, net worth) update to reflect the new position — no separate confirmation screen needed, just an inline success state (e.g. toast/row highlight) then refreshed data.
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
Exact flow: user lands on Invest with "Stocks" as the default active pill → sees a card grid (or table for FD) fetched from that asset type's endpoint → can search/filter within the currently active pill only (switching pills re-fetches, it doesn't filter client-side across all 4 types at once) → clicking a Stocks or MF card slides in a detail panel (from the right or as an overlay) showing extra stats + the placeholder chart, with a Buy CTA inside the detail panel too (Stocks only) → clicking Buy opens the same buy modal pattern as Dashboard (symbol pre-filled, quantity input) → on submit, closes back to the detail/list view. FD and Gold don't have this detail-panel step unless Gold is later confirmed to support it.

3. Goals

Real endpoints: create a goal (name, target amount, target date), select a goal strategy.
Exact flow: the user submits one goal request (name, target amount, target date) → the backend responds with exactly 3 strategy variants for that same goal (e.g. different risk/allocation approaches to hit the target) → the user picks ONE of the 3 → that selection is what actually gets saved as the goal via the select endpoint.
Design this as a two-step flow: (1) Create Goal modal/form → (2) a strategy-selection screen/step showing 3 side-by-side cards (not 2, not a variable number) for the user to compare and pick from before confirming.
Real outputs after a goal is active: goal cards with a progress bar and status badge on the main Goals screen.

4. Tax

Real endpoint outputs (don't add fields beyond these — the schema doesn't currently break down further than this): an aggregate unpaid tax liability total, a separate salary tax line item, and a per-sale-allocation table (each row: asset, sale date, computed tax, paid/unpaid status).
"Pay" action: this is a confirmation-only action per row (no amount entry field, no partial payment) — flips that row to paid. Don't design an amount-input field for paying tax.
Exact flow: screen loads with a summary header (aggregate liability total + salary tax line) above the per-sale-allocation table. Each unpaid row has a "Pay" action → clicking it opens a lightweight confirm (not a full modal with fields, just "Confirm payment for this allocation?") → on confirm, that row's badge flips to "Paid" and the aggregate total at the top recalculates. There's currently no guard against re-confirming an already-paid row, so don't design a disabled/greyed-out state that assumes the backend blocks it — a simple paid badge replacing the Pay button is enough.
Don't design any slab-wise or category-wise tax breakdown visual (e.g. "short-term vs long-term" split charts) — that level of detail isn't confirmed to exist in the data yet.

5. Profile

Salary/income and liabilities: the backend requires ALL related fields to be submitted together in one write — there's no partial single-field update. Design this as one form that saves as a unit, not individually-editable inline fields that save one at a time.
Include a risk tier badge (current risk profile) and an "Update Investment Style" button that re-opens the risk questionnaire.
Exact flow: screen loads pre-filled with current values (salary/income fields, liabilities list, risk tier badge). User edits any of the salary/income fields → a single "Save" action submits all 4 fields together, even the ones untouched (design one Save button for that whole block, not per-field saves). Liabilities have their own add/remove interaction (list with an "Add" row and a remove icon per item). "Update Investment Style" is a separate button that launches the same risk-questionnaire flow used in Onboarding, ending back on Profile with the risk tier badge updated.

6. Chat drawer

This is a conversational agent that can actually take actions across Portfolio, Goals, and Tax (it's not just Q&A) — design it as a standard chat thread UI, no special action-confirmation UI needed beyond normal chat bubbles.
Exact flow: floating bubble bottom-right on every screen except Onboarding → click opens a ~380px slide-out drawer over whatever screen is currently open (not a navigation away from it) → standard message thread (user message right-aligned, assistant left-aligned) → user can ask things like "what's my portfolio worth" or "pay my tax" and the assistant responds conversationally, potentially reflecting an action it took (e.g. "I've marked that allocation as paid") — the underlying screen behind the drawer should reflect updated data once the drawer closes, since the same backend state changed.

7. Onboarding

One-time flow collecting whatever the risk questionnaire needs, ending in a submitted risk profile. Same component gets reused later from Profile.
Exact flow: shown full-screen (no sidebar, no chat bubble) immediately after signup/first login, before the user ever sees the Dashboard. It's a short step-by-step questionnaire (multiple choice/slider style questions about risk tolerance, goals, etc.) ending in a submit action that saves the risk profile, then routes the user into the Dashboard for the first time. When re-triggered later from Profile, it's the same questionnaire component but it returns the user to Profile afterward instead of Dashboard.
General rule for the whole design

If any screen currently has a button, chart, or data field implying a backend capability not listed above, either remove it or relabel it to something view-only/informational rather than actionable. When in doubt, make it non-committal (view-only) rather than promising an action — it's easier to add a real "Buy" button later once confirmed than to walk one back after it's wired.