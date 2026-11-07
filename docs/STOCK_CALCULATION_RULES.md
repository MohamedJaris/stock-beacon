# Stock Calculation & Historical Reporting Rules
# StockBeacon — Authoritative Domain Specification

---

## 1. Non-Negotiable Core Invariants

1. **No Sales or Outgoing Transactions**: StockBeacon does not track sales or outgoing stock movements. Only four ledger event types exist:
   - `OPENING_STOCK`
   - `STOCK_INWARD`
   - `PHYSICAL_COUNT`
   - `STOCK_ADJUSTMENT`
2. **Baseline Requirement (`UNKNOWN` vs `0`)**:
   - A product or variant without an `OPENING_STOCK` or `PHYSICAL_COUNT` event has **no verified baseline**.
   - Until a baseline event (`OPENING_STOCK` or `PHYSICAL_COUNT`) occurs, its `recorded_quantity` is `null` and its `stock_status` is `UNKNOWN` (and `quantity_source` is `UNKNOWN`).
   - An `UNKNOWN` balance is **never** treated as `0` and **never** classified as `OUT_OF_STOCK`.
3. **Safe Scaled-Integer Decimal Arithmetic**:
   - All quantity calculations use scaled integer arithmetic (`scale = 1000`, supporting up to 3 decimal places such as `0.250 kg` or `1.500 m`):
     $$\text{scaled}(q) = \text{Math.round}(q \times 1000)$$
     $$\text{unscaled}(S) = \frac{S}{1000}$$
   - Quantities can never drop below `0` after any event; attempting a negative adjustment that would result in `< 0` is rejected with a domain validation error.

---

## 2. Chronological Event Processing Rules

Given an ordered sequence of `StockEvent` items $(e_1, e_2, \dots, e_n)$ sorted by `(event_date ASC, event_timestamp ASC, sequence_no ASC)`:

Let state be $(B, P, L_{pc})$, representing:
- $B \in \mathbb{R}_{\ge 0} \cup \{\text{null}\}$: Current recorded balance (initially `null`).
- $P \in \{\text{UNKNOWN}, \text{CALCULATED\_INWARD\_ONLY}, \text{PHYSICAL\_COUNT}, \text{CARRIED\_FORWARD}\}$: Provenance (initially `UNKNOWN`).
- $L_{pc} \in \text{DateString} \cup \{\text{null}\}$: Last physical count date (initially `null`).

For each event $e_i$:
1. **`OPENING_STOCK`**:
   - Establishes the initial baseline:
     $$B_{\text{new}} = e_i.\text{quantity}$$
   - Provenance becomes `CALCULATED_INWARD_ONLY`.
2. **`STOCK_INWARD`**:
   - Requires an existing baseline ($B \neq \text{null}$), or if recorded before an explicit opening stock, establishes $B = 0 + e_i.\text{quantity}$ only if an implicit zero-opening is explicitly opted in; otherwise requires baseline or treats opening baseline as 0 when user explicitly sets opening stock to 0.
   - Increases balance:
     $$B_{\text{new}} = B + e_i.\text{quantity}$$
   - Provenance becomes `CALCULATED_INWARD_ONLY` (because inward stock has been added on top of the previous baseline without a fresh physical count).
3. **`PHYSICAL_COUNT`**:
   - Resets the recorded balance to the observed physical quantity:
     $$\text{variance} = B \neq \text{null} ? (e_i.\text{quantity} - B) : \text{null}$$
     $$B_{\text{new}} = e_i.\text{quantity}$$
   - Provenance becomes `PHYSICAL_COUNT`.
   - $L_{pc} = e_i.\text{event\_date}$.
   - **Important**: Even if $\text{variance} < 0$, this event is strictly a `PHYSICAL_COUNT` reconciliation, never a "sale".
4. **`STOCK_ADJUSTMENT`**:
   - Changes balance by signed delta $e_i.\text{quantity}$:
     $$B_{\text{new}} = \max(0, B + e_i.\text{quantity})$$
   - Provenance becomes `CALCULATED_INWARD_ONLY`.

---

## 3. Stock Status Evaluation Rule

Given a recorded balance $B$ and applicable minimum stock threshold $T \ge 0$:

1. If $B === \text{null}$:
   $$\text{status} = \text{UNKNOWN}$$
2. Else if $B === 0$:
   $$\text{status} = \text{OUT\_OF\_STOCK}$$
3. Else if $0 < B \le T$:
   $$\text{status} = \text{LOW\_STOCK}$$
4. Else ($B > T$):
   $$\text{status} = \text{IN\_STOCK}$$

---

## 4. Daily Inventory Snapshot & Provenance Rules

For any item and any calendar date $D$ (`YYYY-MM-DD` in the business's local timezone):

### 4.1 Applicable Historical Threshold $T(D)$
Let $H$ be the item's `product_threshold_history` records sorted by `(effective_from_date ASC, sequence_no ASC)`.
- The threshold applicable on date $D$ is the `min_stock_threshold` of the latest threshold history record with `effective_from_date <= D`.
- If no record has `effective_from_date <= D` (e.g., $D$ is prior to the first threshold record), the earliest recorded threshold is used.
- Consequently, changing a product's minimum threshold on **November 5** inserts a new `product_threshold_history` row with `effective_from_date = '2026-11-05'`, leaving the applicable threshold for **November 1–4** completely unchanged.

### 4.2 End-of-Day Quantity & Provenance $Q(D), P(D)$
Consider all `stock_events` for the item with `event_date <= D`:
1. **No baseline event (`OPENING_STOCK` or `PHYSICAL_COUNT`) exists with `event_date <= D`**:
   - `recorded_quantity = null`
   - `quantity_source = 'UNKNOWN'`
   - `stock_status = 'UNKNOWN'`
2. **One or more events occurred ON date $D$ (`event_date == D`)**:
   - `recorded_quantity` = resulting balance of the last event on date $D$.
   - If the last event on date $D$ is `PHYSICAL_COUNT` (or a `PHYSICAL_COUNT` occurred on date $D$ with no subsequent inward/adjustment on date $D$), then:
     - `quantity_source = 'PHYSICAL_COUNT'`
   - Otherwise (e.g. `OPENING_STOCK`, `STOCK_INWARD`, or `STOCK_ADJUSTMENT` occurred on date $D$):
     - `quantity_source = 'CALCULATED_INWARD_ONLY'`
3. **No events occurred ON date $D$, but a baseline exists prior to date $D$ (`event_date < D`)**:
   - `recorded_quantity` = end-of-day balance carried forward from $D - 1$.
   - `quantity_source = 'CARRIED_FORWARD'`
   - `stock_status` is evaluated using `recorded_quantity` against $T(D)$ (since a threshold change could have taken effect on date $D$ even if no stock event occurred on $D$).

---

## 5. Low-Stock Alert State Machine

To prevent duplicate notifications when the user opens the dashboard repeatedly:

Each item tracks `active_alert_state` $\in \{\text{NONE}, \text{LOW\_STOCK\_ALERTED}, \text{OUT\_OF\_STOCK\_ALERTED}\}$ in `inventory_balances`.

When an item's `stock_status` is evaluated after a stock event or threshold change:
- **Transition to `IN_STOCK` or `UNKNOWN`**:
  - Reset `active_alert_state = 'NONE'`. No alert emitted.
- **Transition to `LOW_STOCK`**:
  - If `active_alert_state !== 'LOW_STOCK_ALERTED'`, emit a `LOW_STOCK_ALERT` notification and set `active_alert_state = 'LOW_STOCK_ALERTED'`.
  - If already `'LOW_STOCK_ALERTED'`, do **not** emit a duplicate alert.
- **Transition to `OUT_OF_STOCK`**:
  - If `active_alert_state !== 'OUT_OF_STOCK_ALERTED'`, emit an `OUT_OF_STOCK_ALERT` notification and set `active_alert_state = 'OUT_OF_STOCK_ALERTED'`.
  - If already `'OUT_OF_STOCK_ALERTED'`, do **not** emit a duplicate alert.
