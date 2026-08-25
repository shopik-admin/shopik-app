# Orders & Checkout — Hyp Pay Integration Plan

> Status: planning (v3 — generic schemas, SSR callback, external/ folder, order Timeline)
> Provider: **Hyp Pay** (hyp.co.il, formerly YaadPay) — docs: https://developers.hyp.co.il
> Scope: end-to-end checkout (J5 auth → J4 capture), partial refunds from cart lines, cancellations, transaction ledger, order Timeline audit.

---

## 1. How Hyp Pay works (verified against their docs)

Hyp Pay has **no classic server-to-server webhook** in its standard product (that exists only in "Hyp Enterprise" via SNS). The outcome arrives as a **browser redirect** back to our server with signed query params, which we must validate server-side.

### 1.1 Checkout flow (two-phase commit)

```
Client                Shopik server                     Hyp Pay
  │  POST /api/payment/create                             │
  │──────────────────────►│  GET APISign (What=SIGN)      │
  │                       │──────────────────────────────►│
  │                       │◄──signed params───────────────│
  │◄──{ paymentUrl }──────│   create pending Transaction  │
  │  redirect browser     │                               │
  │──────────────────────────────────────────────────────►│
  │            customer enters card on hosted page        │
  │◄─redirect─ callback URL ?Id&CCode=700&Amount&ACode&Order&UID&UserId&Sign...
  │                       │  GET APISign (What=VERIFY)    │
  │                       │──────────────────────────────►│
  │                       │◄──CCode=0 (valid)─────────────│
  │                       │  GET getToken(TransId=Id)     │
  │                       │──────────────────────────────►│
  │                       │◄──Token+Tokef─────────────────│
  │                       │  save auth txn, order → paid  │
  │◄── 200 HTML (simple SSR page, not SPA) ───────────────│
```

**Step 1 — J5 authorization.** Payment-page request to `https://pay.hyp.co.il/p/` with:
`action=APISign&What=SIGN&Sign=True&Masof=<terminal>&KEY=<key>&PassP=<pass>&Amount=<sum>&Order=<orderNumber>&J5=True&MoreData=True` (+ customer info, `tmp`, `PageLang`, `Tash`, `Coin`).
Response is a query string → the payment page URL is `https://pay.hyp.co.il/p/?<that exact string>`.
Success redirect carries **`CCode=700`** (= authorized, funds held; `800` = postponed success). With `MoreData=True` the redirect also includes **`UID`** and **`UserId`** — required later for capture.
Save from redirect: **`Id`** (transaction id), **`ACode`**, **`UID`**, **`UserId`**.

**Step 2 — token.** `GET action=getToken&Masof=..&PassP=..&TransId=<Id>` → `Token`, `Tokef` (expiry MMYY), `CCode=0`. Needed because capture is server-to-server and references the card by token.

**Step 3 — J4 capture** (when admin moves order → `ready`). Server-to-server GET:
`action=soft&Masof=..&PassP=..&UserId=<UserId|000000000>&ClientName=..&Token=True&CC=<Token>&Tmonth=<MM>&Tyear=<YY>&AuthNum=<ACode>&Amount=<capture amount ≤ authorized>&inputObj.originalAmount=<authorized amount in agorot>&inputObj.originalUid=<UID>&inputObj.authorizationCodeManpik=7&Info=..`
→ `Id=<newCaptureTxnId>&CCode=0` = charged.
Capture may be for the same or a **smaller** amount than authorized. Larger is rejected — see §9 risks.

### 1.2 Success / failure routes — answer

The Hyp portal (**Settings → API-דף תשלום ו → הפנייה לאחר עסקה**) has separate fields for successful-transaction URL and failed-transaction URL.

**Decision:** configure **only the success URL** (`https://<domain>/api/payment/hyp/callback`) and keep errors displayed on Hyp's own payment page (their official recommendation — the customer can retry with another card right there). We therefore need **one callback route**, not two. If we ever add an error URL it can point to the same route; logic keys off `CCode`.

### 1.3 Invoices (built-in, EZcount)

Invoicing is active on the terminal by default: every successful transaction (charges **and refunds/cancellations**) automatically generates a tax-invoice-receipt or receipt (default doc type configurable in portal). The transaction response only signals `Hesh=EZ` (document created) — it does **not** return a link.

Links are **temporary and signed**, built on demand:

1. Backend GET: `action=APISign&What=SIGN&Masof=..&KEY=..&PassP=..&TransId=<providerTxnId>&type=EZCOUNT&ACTION=PrintHesh` → signed param string
2. Final link = `https://pay.hyp.co.il/p/?<that exact response string>` → clicking downloads the PDF

Because signatures are short-lived, we never persist the link — we generate it fresh whenever an admin or user opens it. Optional knobs: `SendHesh=True` (email PDF to customer), `sendHeshSMS=True`, `Pritim=True` + `heshDesc=[code~name~qty~price]...` for itemized documents (**must sum exactly to `Amount`**), `EZ.lang=he|en`.

### 1.4 Refund & cancellation actions

| Action | Call | Notes |
|---|---|---|
| Refund (settled txns) | `action=zikoyAPI&Masof=..&PassP=..&TransId=<capture Id>&Amount=<partial ok>` | Creates a **new** credit txn; returns new `Id`; error `33` = refund exceeds original |
| Cancel before transmission | `action=CancelTrans&Masof=..&PassP=..&TransId=..` | Same-day until 22:00 IL time; success → `ReversalStatus=777`; already-transmitted → `CCode=920` → fall back to refund |
| Validation of any redirect | `action=APISign&What=VERIFY&Masof=..&KEY=..&PassP=..&<all redirect params in original order>` | `CCode=0` = authentic |

---

## 2. Order lifecycle & status mapping

Existing `ORDER_STATUS` (server/dl/schemas/order.js:38): cart, paid, paid-edit, picking, picked, packed, shipped, done, canceled, failed. Existing flags: `paid`, `paidAt`, `paymentError`, `paymentAttempts`.

```
cart ──checkout──► [J5 auth] ──CCode=700 verified──► paid ──admin picks──► picking ──► packed ──► ready? ──► shipped
                                                                                        │ [J4 capture]
                                                                        shipped ◄── done? ◄──┘
```
> Note: actual picking statuses are `picking/picked/packed` — capture triggers on transition to the final pre-shipment status the project uses (currently `ready` alias / `packed`; see §4.4 hook). Adjust the enum check to the chosen status; logic is identical.

Per product decision:

| Event | Order change | Timeline entry |
|---|---|---|
| Checkout initiated | pending `Transaction(kind=auth, status=pending)` created; `paymentAttempts++` | `PAYMENT` — initiated (user actor, amount, orderNumber) |
| J5 callback verified (`CCode` ∈ {0*, 700}) | `status='paid'`, store `payment` subdoc (§3); `paid=false` still | `PAYMENT` — authorized (system actor, providerTxnId, authCode, amount) |
| J5 VERIFY failed / CCode error | no order mutation, `paymentError` set | `PAYMENT` — failed (outcome.success=false, providerCode, error) |
| Admin sets status → packed/ready | server triggers **J4 capture** for current `finalSumWithShippingAndHandling` (≤ authorized). On success: `paid=true`, `paidAt=now`. On failure: `paymentError`, retry button | `PAYMENT` — captured / capture_failed + optional second charge entry |
| Admin cancels order pre-capture | release hold via `CancelTrans` (§6) | `PAYMENT` — canceled (hold released) |
| Admin cancels post-capture | `CancelTrans` or full `zikoyAPI` refund (§6) | `PAYMENT` / `REFUND` — canceled + refund entry |
| Admin refunds post-capture | partial per-cart-line refunds via `zikoyAPI` (§5) | `REFUND` — per batch with items[] breakdown |

\* plain immediate charge would return `CCode=0`; we always run `J5=True` so expect 700. Treat {0, 700} as success defensively.

**Capture trigger point:** hook inside the status transition rather than trusting client calls. Intercept in `order/update.js:5` when payload transitions to the configured ready/packed status and `!order.paid && order.payment?.cardToken` → run capture before/after persisting (see §4.4).

All rows above use `utils.data.timeline.record` — see §11 for the canonical pattern.

---

## 3. Data model — generic naming

> **Convention:** all schemas/fields use **provider-agnostic (generic) names**. The only place `hyp` appears is the `provider='hyp'` value and inside `providerData`/`raw` bags that store the raw gateway payload. No column is called `hypTxnId`/`masof`/`acode` — those are `providerTxnId`/`terminalId`/`authCode` etc. This keeps the model usable if a second provider is added later.

### 3.1 New collection: `payment_transactions` (generic)

`server/dl/schemas/payment_transaction.js` → auto-model `PaymentTransaction`, collection `payment_transactions` (createModels.js convention).

```js
// server/dl/schemas/payment_transaction.js
const TRANSACTION_KIND = { AUTH: 'auth', CAPTURE: 'capture', REFUND: 'refund', CANCEL: 'cancel' }
const TRANSACTION_STATUS = { PENDING: 'pending', SUCCESS: 'success', FAILED: 'failed' }

const paymentTransactionSchema = {
    domainId: String,
    storeId: String,
    orderId: String,          // shopik order id
    orderNumber: String,       // shopik order number (human)
    userId: String,
    provider: { type: String, default: 'hyp', filter: true }, // generic — 'hyp' | future providers
    kind:     { type: String, enum: Object.values(TRANSACTION_KIND), filter: true },
    status:   { type: String, enum: Object.values(TRANSACTION_STATUS), default: 'pending', filter: true },
    amount: Number,            // ILS, generic

    // generic provider fields (no hyp prefix)
    terminalId: String,        // was masof
    providerTxnId: String,     // was hypTxnId / Id from gateway
    parentProviderTxnId: String, // for capture/refund: original txn
    providerCode: Number,      // was ccode (CCode)
    authCode: String,          // was acode / AuthNum (ACode)
    providerUid: String,       // was uid (UID param from J5)
    providerPayerId: String,   // was userIdParam (UserId param, '000000000' if none)
    signature: String,         // was sign
    cardToken: String,         // was token (card token, on auth txn only)
    cardExpiry: String,        // was tokef (MMYY)
    items: [{                  // refund breakdown — generic (§5)
        _id: false,
        productId: String, barcode: String, name: String,
        amount: Number         // refunded from this line (ILS)
    }],
    reason: String,
    providerData: Object,      // was raw — full gateway response/redirect params (generic bag)
    error: String
}
const index = [
    { orderId: -1 },
    { orderNumber: -1 },
    { providerTxnId: 1 },      // lookups + idempotency checks
    { provider: 1, kind: 1, status: 1 },
]
export const meta = { index, constants: { TRANSACTION_KIND, TRANSACTION_STATUS } }
export default paymentTransactionSchema
```

Migration note: if a legacy `transactions` collection exists, either rename or create the new `payment_transactions` collection; do not reuse hyp-specific field names.

### 3.2 Order schema additions (generic)

```js
// on orderSchema (server/dl/schemas/order.js):
payment: {
    provider: { type: String, default: 'hyp' },
    providerTxnId: String,     // was authId — Id of J5
    authCode: String,          // was acode — ACode from redirect
    providerUid: String,       // was authUid — UID from redirect
    providerPayerId: String,   // was userIdParam — UserId ('000000000' if none)
    cardToken: String,         // was token
    cardExpiry: String,        // was tokef (MMYY)
    terminalId: String,        // terminal used
    authorizedAmount: Number,  // ILS
    capturedAt: Date,
    captureProviderTxnId: String, // was captureId — Id of J4 (generic)
    // when over-capture split occurs, the second charge id is stored on the
    // second capture Transaction (kind=capture, parentProviderTxnId=auth id),
    // not as an extra field here — see §4.4
},
refundedTotal: { type: Number, default: 0 },

// on each cart line (cartSchema — server/dl/schemas/order.js:129):
refundedAmount: { type: Number, default: 0 } // refundable = totalSum - refundedAmount
```

### 3.3 Timeline collection — already exists, no new schema

Reuse `server/dl/schemas/timeline.js:1` (`EVENT_TYPES.PAYMENT`, `EVENT_TYPES.REFUND`) and `server/utils/data/timeline.js:19` (`record`, `userActor`, `adminActor`). No new collection. Each payment step writes one entry — see §4, §5, §6 and the summary table in §11. Timeline entries are the **audit source of truth** for the order history UI (`server/api/order/timeline.js:1`).

### 3.4 Permissions

Add to `server/utils/auth/permissions.js`:

```
'payment:create',      // reserved (checkout is user-owned, not admin)
'transaction:read',    // keep existing name for backward compat, or alias 'payment_transaction:read'
'order:payment',       // capture retry / cancel / refund actions
```

---

## 4. Server routes

All under `server/api/` (auto-registered by loadDir → `/api/<path>`).

### 4.1 `POST /api/payment/create` — `server/api/payment/create.js`
- `config`: default user auth (must own the order), `required: ['orderId']`, `preventMultiple: body => ':' + body.orderId`
- Load order; assert `status='cart'`, ownership (`userId === _user.id`), `finalSumWithShippingAndHandling > 0`
- Build APISign SIGN query via external helper (§4.5): `Amount`, `Order=order.number`, `J5=True`, `MoreData=True`, customer fields from order (name/phone/email/address), `Info=orderId`; include `SendHesh=True` + `email` when the order has an email so Hyp emails the invoice automatically (line-itemized docs via `Pritim`/`heshDesc` are a later refinement — totals must match exactly)
- Create `PaymentTransaction(kind=AUTH, status=PENDING, amount)` with generic fields; return `{ paymentUrl }` (full `pay.hyp.co.il/p/?<signedParams>`)
- Timeline (generic, via `utils.data.timeline.record`):
  ```js
  await record({ DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
    actor: userActor(_user),
    context: { step: 'payment_initiated', provider: 'hyp', amount, orderNumber: order.number, terminalId },
    outcome: { success: true } })
  ```

### 4.2 `GET /api/payment/hyp/callback` — `server/api/payment/hyp/callback.js`
- Path: folder `payment/hyp/` + file `callback.js` (loadDir splits on folders; `hyp_callback.js` would also work but folder is preferred)
- `config: { auth: 'none', log: true }`
- Reads **query params** → requires router change (§4.7)
- Flow:
  1. `VERIFY` call (external helper) with all received params in original order; on `providerCode !== 0` → record failure timeline (see below), respond with **simple HTML** failure page (not redirect), `res.type('html').send(html)` and return (router skips JSON when headersSent).
  2. Look up order by number (`Order` param); 404-guard
  3. Idempotency: check `PaymentTransaction.providerTxnId == Id` — if exists, just re-serve the same HTML (no mutation, no duplicate timeline entry)
  4. `providerCode ∈ {0, 700}` → success: `getToken(TransId=Id)` → store cardToken/cardExpiry; create/complete auth `PaymentTransaction(status=SUCCESS)` with generic fields (`providerTxnId=Id`, `authCode=ACode`, `providerUid=UID`, `providerPayerId=UserId`, `signature=Sign`); update `order.payment.*`, `status='paid'`, `$inc: { paymentAttempts: 1 }`
  5. Else → mark txn `FAILED`, `order.paymentError = mapped message`, leave status `cart`
  6. **Response — simple SSR HTML, not a redirect and not the full SPA:**
     ```js
     // inside hyp/callback.js handler (info contains res via bootData or req context)
     const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? 'תשלום אושר' : 'שגיאת תשלום'}</title><style>body{font-family:system-ui;max-width:560px;margin:40px auto;padding:24px;text-align:center} .btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:8px}</style></head><body><h1>${ok ? 'התשלום אושר' : 'התשלום נכשל'}</h1><p>${ok ? 'ההזמנה התקבלה. החיוב יתבצע בעת הכנת המשלוח.' : errMsg}</p><a class="btn" href="${ok ? `/account/orders/${order.id}` : `/checkout/${order.id}`}">${ok ? 'לצפייה בהזמנה' : 'חזרה לתשלום'}</a></body></html>`
     res.status(ok ? 200 : 400).type('html').send(html)
     return // headersSent → router will not send JSON
     ```
     Why not `res.redirect('/payment/result?order=...')`: that would hit the client SSR (`server/ssr.js:110` → `client/entry-server.jsx`) and hydrate the full SPA, which we explicitly avoid for the gateway callback (lighter, no auth flicker, no extra redirect). If a SPA result page is still desired elsewhere, keep it as a separate `client/pages/PaymentResult` route, but **the gateway callback itself serves the minimal HTML above**.
- Timeline:
  ```js
  // success — after order update
  await record({ DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
    actor: null, // gateway callback is system-initiated; optionally userActor from order.user
    context: { step: 'payment_authorized', provider: 'hyp', providerTxnId: Id, authCode: ACode, providerUid: UID, amount, orderNumber: Order },
    outcome: { success: true } })
  // verify failed or CCode not in {0,700}
  await record({ DL, order: order || { id: Order }, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
    actor: null,
    context: { step: 'payment_failed', provider: 'hyp', providerCode: CCode, amount, orderNumber: Order },
    outcome: { success: false, errorMessage: mappedMsg } })
  // idempotent replay → no new timeline entry (or optional context: { step: 'payment_callback_replay', note: 'idempotent' })
  ```

### 4.3 Client result page (optional SPA route)

- Keep `client/pages/PaymentResult` or reuse `Account/Orders` view for users who navigate after the HTML page's button. It reads order status via `order/read` and shows "order placed, card will be charged on delivery preparation" (J5 = reservation). This page is **not** the gateway callback target.

### 4.4 Capture (J4)
- External helper `server/external/hyp/index.js` exposing `verifyRedirect()`, `getToken()`, `capture(order)`, `refund(order, lines)`, `cancel(order)` — all using global `fetch` (Node ≥18), no new deps. Module is a factory `export default function hypFactory({ DL }) { return { ... } }` following `server/external/index.js:5` pattern and is wired via `server/external/index.js`.
- Hook: extend `server/api/order/update.js:5` — after diff/update, if transitioned to the configured ready/packed status (`payload.status === ORDER_STATUS.PACKED` — adjust to actual enum) and `!order.paid && order.payment?.cardToken` → `await hyp.capture(order)`; capture targets current `finalSumWithShippingAndHandling`; if it exceeds `authorizedAmount`, apply over-capture strategy (§9.1). On success patch `{ paid:true, paidAt, payment.capturedAt, payment.captureProviderTxnId }` (+ second transaction when split); on failure set `paymentError` and **do not block** the status change (admin retries)
- Manual retry: `POST /api/payment/capture` (`permissions:['order:payment']`, admin)
- Timeline (inside capture flow, both hook and retry endpoint):
  ```js
  const { record, adminActor } = utils.data.timeline
  // success
  await record({ DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
    actor: adminActor(_admin), // or system actor if hook runs without admin context — pass _admin when available
    context: { step: 'payment_captured', provider: 'hyp', providerTxnId: captureId, parentProviderTxnId: order.payment.providerTxnId, amount: captureAmount, authorizedAmount },
    changes: { oldData: { paid: false }, newData: { paid: true, capturedAt } } })
  // split second charge (when over-capture fallback)
  await record({ DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
    actor: adminActor(_admin),
    context: { step: 'payment_captured_overflow', provider: 'hyp', providerTxnId: secondId, amount: overflowAmount },
    outcome: { success: true } })
  // failure
  await record({ DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
    actor: adminActor(_admin),
    context: { step: 'payment_capture_failed', provider: 'hyp', providerCode, amount: attemptedAmount },
    outcome: { success: false, errorMessage: mappedMsg } })
  ```

### 4.5 Hyp helper module — `server/external/hyp/index.js` (not services)

Single place owning base URL (`https://pay.hyp.co.il/p/`), credentials from env, query-string building/parsing (URLSearchParams, preserve param order for VERIFY), agorot conversion for `inputObj.originalAmount`, CCode → message mapping, and `invoiceLink(providerTxnId)` (two-step PrintHesh signing, §1.3).

```js
// server/external/hyp/index.js
export default function hypFactory({ DL }) {
  const baseUrl = process.env.HYP_BASE_URL || 'https://pay.hyp.co.il/p/'
  // buildSignParams, verifyRedirect, getToken, capture, refund, cancel, invoiceLink
  return { buildSignParams, verifyRedirect, getToken, capture, refund, cancel, invoiceLink, parseResponse }
}
// wired in server/external/index.js:
import hypFactory from './hyp/index.js'
export default function externalBuilder({ DL }) {
  return { sms: smsFactory({ DL }), geocode, comax: comaxFactory({ DL }), hyp: hypFactory({ DL }) }
}
```

Credentials/env remain `HYP_MASOF`, `HYP_KEY`, `HYP_PASSP` — mapped to generic `terminalId` internally; no `hyp` prefix leaks into schemas.

### 4.6 Invoice link — `GET /api/payment/invoice` (`server/api/payment/invoice.js`)
- Payload/query: `{ orderId }`
- **Two variants in one route**: admin with `transaction:read` → any order; regular user → only own order (default user auth + ownership check)
- Flow: find latest successful capture (or auth, pre-cancellation) `PaymentTransaction` for the order → `external.hyp.invoiceLink(txn.providerTxnId)` (two-step §1.3) → return `{ url }`; client opens it in a new tab (PDF download)
- Never cached/persisted; regenerate per request. If no document exists yet, surface gateway error
- Consumers: Payments panel "Download invoice" button (admin), Account/Order view link (user)
- Timeline: optional `INVOICE_OPEN` entry when admin/user opens invoice:
  ```js
  await record({ DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.INVOICE_OPEN,
    actor: _admin ? adminActor(_admin) : userActor(_user),
    context: { provider: 'hyp', providerTxnId } })
  ```

### 4.7 Router tweak — `server/router.js:47`
Handlers currently receive only `body`. Add query exposure, e.g. in `info`:
```js
info = { ...bootData, platform, ip, headers, cookies, files, query: req.query, ... }
```
Callback route then reads `query` directly. Also expose `res` on `info` (or pass `req/res` through) so the callback can call `res.type('html').send(...)` and set `headersSent`. (Do **not** blanket-merge query into payload — avoids surprises elsewhere.)

### 4.8 Env vars
```
HYP_MASOF=<terminal number>        # → terminalId in code/schemas
HYP_KEY=<api key>
HYP_PASSP=<api password>
HYP_BASE_URL=https://pay.hyp.co.il/p/   # optional override for tests
PUBLIC_BASE_URL=https://<domain>        # builds callback URLs (if needed elsewhere)
```

---

## 5. Partial refunds (admin picks amounts from cart lines)

### Rules
- Refundable per line = `line.totalSum − line.refundedAmount` (weights/substitutions make line-level granularity necessary; coupons/shipping are handled by allowing the sum of picked amounts to be any value ≤ remaining order total)
- Sum of a refund batch must be > 0 and ≤ `finalSumWithShippingAndHandling − refundedTotal`
- A refunded amount can never be refunded again — enforced by the two counters above, updated atomically with the refund txn write
- Multiple partial refunds allowed; each creates its own `PaymentTransaction(kind=REFUND)` with generic `items[]` breakdown

### API — `POST /api/payment/refund` (`server/api/payment/refund.js`)
```js
payload = {
    orderId,
    items: [{ productId, amount }],   // amount in ₪ to refund from this line (generic)
    reason: String
}
```
Server flow (all in one update, use `preventMultiple: ':orderId'` lock):
1. Read order; require `paid=true` (captured) and a capture `PaymentTransaction`
2. Validate every line against `totalSum − refundedAmount`; compute total; validate vs remaining order total
3. Call `external.hyp.refund({ providerTxnId: capture.providerTxnId, amount: total })` → `zikoyAPI`; on non-zero `providerCode` → throw with mapped message (33 ⇒ exceeds original)
4. Write `PaymentTransaction(kind=REFUND, status=SUCCESS, amount=total, items=[...], parentProviderTxnId=capture.providerTxnId)`
5. `$inc: { refundedTotal: total }` + `$set` per-line `refundedAmount` bumps via `cart.$[line]` arrayFilters on productId
6. `$set: { finalSumAfterRefunds: finalSumWithShippingAndHandling − refundedTotal }`
7. Timeline:
   ```js
   await record({ DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
     actor: adminActor(_admin),
     context: { step: 'refund', provider: 'hyp', providerTxnId: newRefundId, parentProviderTxnId: capture.providerTxnId, amount: total, reason },
     changes: { oldData: { refundedTotal: prev }, newData: { refundedTotal: prev + total } },
     outcome: { success: true } })
   // on failure, same event with outcome.success=false and providerCode
   ```

### Admin UI
In the existing Orders page (`admin/Pages/Orders`) add a **Payments panel** on the order detail view:
- Shows payment state: authorized amount / captured / refundedTotal / transactions list (`useApi('payment_transaction/read', { filter: { orderId } })` or `transaction/read` alias, needs `filterFields` on schema)
- **Refund modal:** lists cart lines (name, qty, line total, already-refunded, remaining), numeric input per line capped at remaining, live total, reason field, submit → `payment/refund`
- **Cancel order** button (§6)
- **Retry capture** button (post-failure)
- **Invoice** button per transaction → `payment/invoice` link (opens PDF; refunds have their own credit document via their `providerTxnId`)

---

## 6. Cancellations

`POST /api/payment/cancel` (`permissions:['order:payment']`) — **one button, zero manual decisions**. The server inspects payment state and settles automatically:

| State | Automatic action | Timeline entry |
|---|---|---|
| Only J5 held, no capture | `external.hyp.cancel({ providerTxnId: order.payment.providerTxnId })` → `CancelTrans` → release hold; mark auth txn canceled | `PAYMENT` step=`payment_canceled_hold_released` |
| Captured today, before transmission (~22:00 same business day) | try `CancelTrans(captureProviderTxnId)` first (no commission); on `providerCode=920` fall through to refund below | `PAYMENT` step=`payment_canceled` or `REFUND` on fallback |
| Already transmitted | **refund entire remaining amount** — `zikoyAPI(Amount = finalSumWithShippingAndHandling − refundedTotal)` — creating a `REFUND` PaymentTransaction | `REFUND` step=`refund` (full) |

In every case the flow ends the same way: money fully settled back (or hold released) → `order.status='canceled'`, `cancelDate=now`, timeline entries as above. The admin just clicks Cancel.

```js
// inside cancel handler — always record
await record({ DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
  actor: adminActor(_admin),
  context: { step: 'payment_canceled', provider: 'hyp', providerTxnId: targetId, amount: refundedOrReleased },
  changes: { oldData: { status: prevStatus }, newData: { status: 'canceled' } },
  outcome: { success: true } })
// if fallback refund was needed, an additional REFUND entry like §5 is written with reason='cancel_fallback_refund'
```

⚠️ Confirm sandbox behavior for cancelling an uncaptured J5 hold (docs cover cancel generically; verify a released hold actually disappears from the ~5-day window).

---

## 7. One-time portal configuration (manual checklist)

1. Settings → **API-דף תשלום ו**: copy KEY + PassP → `.env`
2. אימות section: enable **אימות על ידי חתימה בעמודי התשלום** (signature in redirects) — required for VERIFY
3. הפנייה לאחר עסקה → עסקה שהצליחה → **לינק מותאם אישית** = `https://<domain>/api/payment/hyp/callback`
4. Leave failure address at default (**display error on payment page**)
5. הגדרת מסמך ברירת מחדל: pick default doc type (**קבלה/חשבונית מס** tax-invoice-receipt vs קבלה receipt) and `EZ.lang` preference — invoices are generated automatically per successful txn/refund
6. Ask Hyp during onboarding (must-have for this platform): enable **over-capture on the terminal + acquirer approval** so J4 may exceed J5 (§9.1), and **confirm Apple/Google Pay work with J5→J4** — undocumented; wallet tokens are single-use which may break token-based capture. Verify both in sandbox before enabling wallets in production
7. Enable desired methods (3DS, bit, Apple/Google Pay) once verified
8. Repeat for test + production terminals

---

## 8. Implementation order

| # | Task | Files | Effort | Depends on |
|---|---|---|---|---|
| 1 | Generic `payment_transaction` schema + generic order `payment` subdoc + generic cart `refundedAmount` + permissions | `server/dl/schemas/payment_transaction.js`, `server/dl/schemas/order.js`, `server/utils/auth/permissions.js` | 0.5 d | — |
| 2 | Router: expose `req.query` + `res` on `info` | `server/router.js` | 0.5 d | — |
| 3 | External Hyp helper (`server/external/hyp/index.js`, wired via `server/external/index.js`) — sign/verify/getToken/capture/refund/cancel/invoiceLink | `server/external/hyp/index.js`, `server/external/index.js` | 2–3 d | 1 |
| 4 | `payment/create` + `payment/hyp/callback` (simple HTML response, timeline) | `server/api/payment/create.js`, `server/api/payment/hyp/callback.js` | 3 d | 2, 3 |
| 5 | Capture hook on →packed/ready + retry endpoint + timeline entries | `server/api/order/update.js`, `server/api/payment/capture.js` | 1.5 d | 3, 4 |
| 6 | Refund endpoint (generic fields, atomic counters) + timeline REFUND | `server/api/payment/refund.js` | 1.5 d | 1, 3, 5 |
| 7 | Cancel endpoint + invoice-link endpoint + timeline entries | `server/api/payment/cancel.js`, `server/api/payment/invoice.js` | 1.5 d | 3, 5 |
| 8 | Admin Payments panel + refund modal + txn list + invoice button; user order view invoice link | `admin/Pages/Orders/*`, `client/pages/Account/*` | 4 d | 5, 6, 7 |
| 9 | Sandbox end-to-end test (§12 scenarios) + hardening | — | 3 d | all |

No new npm dependencies (global fetch + URLSearchParams only). Total **≈ 18 dev-days**.

---

## 9. Risks & open questions

1. **Pick total > authorized amount** — by default J4 capture **cannot exceed J5** (docs: capture "can be equal to or less than the authorized amount"). Exceeding is possible **only with a special terminal configuration + explicit acquirer approval** (Hyp FAQ) — not something we can toggle ourselves. Since pickers replacing/adding products makes over-capture a must for this platform:
   - **Primary path:** request that terminal configuration during onboarding (§7.6) and verify in sandbox. Server logic is then trivial: always capture the final picked sum.
   - **Fallback if not approved:** charge only up to the authorized amount via J4, then immediately token-charge the difference as a separate immediate transaction (`action=soft`, `Token=True&CC=<cardToken>` without `originalUid/originalAmount` refs — valid because we hold the card token from the J5). Customer sees two charges; confirm commissions/customer-experience implications with Hyp.
   - Implementation: config flag `HYP_OVER_CAPTURE=true|false` picks the strategy; overflow detection at capture time decides whether to split.
2. **J5 window ≈ 5 days** — orders sitting between checkout and picking longer than the window may have expired holds. Consider re-auth flow or capture-failure alerting (we have the latter).
3. **UserId param** — customers may not enter Israeli ID on the page; capture defaults to `000000000` per docs.
4. **Refund of shipping/coupons** — v1 lets admins pick arbitrary totals across lines (≤ remaining); a dedicated "shipping refund" row can be added to the modal cheaply.
5. **Concurrent refunds** — guarded by router `preventMultiple` lock + DB-side validation; worst case Hyp rejects over-refund (code 33).
6. **CCode 800** — postponed-charge success; we don't use postponement in v1 but treat {0,700} (not 800) as success deliberately.

---

## 10. Env & dependencies

- Node ≥18 (global `fetch`)
- MongoDB (`payment_transactions` collection + `timelines` collection)
- Redis/BullMQ existing — no new queue needed for v1 (capture is synchronous on status change; async queue is later optimization)
- External: Hyp Pay sandbox + production terminals, EZcount invoice module enabled

---

## 11. Timeline (order history) — `server/dl/schemas/timeline.js` + `server/utils/data/timeline.js`

> This is the **order Timeline collection**, not a project schedule. Every payment step writes an entry via `utils.data.timeline.record` so the order history UI (`server/api/order/timeline.js:1` → `GET /api/order/timeline?orderId=...`) and admin view show a complete audit trail.

### 11.1 Principles

- Use **generic context** (`provider`, `providerTxnId`, `providerCode`, `amount`) — never hyp-prefixed keys in `context`/`changes`.
- Use `EVENT_TYPES.PAYMENT` for auth/capture/cancel/capture-fail, `EVENT_TYPES.REFUND` for refunds (including cancel-fallback refunds), `EVENT_TYPES.INVOICE_OPEN` for invoice link opens. See `server/dl/schemas/timeline.js:1`.
- Actor: `userActor(_user)` for user-initiated `payment/create`; `adminActor(_admin)` for capture retry / refund / cancel; `null` (system) for gateway callback (or `userActor` resolved from `order.userId` if you prefer attribution). Follow existing pattern in `server/api/order/update.js:25` and `server/utils/data/getUserOrder.js:3`.
- Always set `outcome.success` and `outcome.errorMessage` on failure; `changes` for state mutations (paid flag, refundedTotal, status).
- Idempotent callback replays **do not** create duplicate entries — check `providerTxnId` first.

### 11.2 Events written

| Step | Route / hook | Event type | Actor | Context `step` | When |
|---|---|---|---|---|---|
| Initiate checkout | `POST /payment/create` | `PAYMENT` | `userActor(_user)` | `payment_initiated` | After `PaymentTransaction(pending)` + before returning `paymentUrl` |
| Authorized (J5 ok) | `GET /payment/hyp/callback` | `PAYMENT` | `null` / order user | `payment_authorized` | `VERIFY ok` + `getToken` success + order → `paid` |
| Auth failed | `GET /payment/hyp/callback` | `PAYMENT` | `null` | `payment_failed` | `VERIFY fail` or `CCode∉{0,700}` — `outcome.success=false` |
| Captured | `order/update` hook + `POST /payment/capture` | `PAYMENT` | `adminActor(_admin)` | `payment_captured` | `capture` returns `providerCode=0` |
| Capture failed | same | `PAYMENT` | `adminActor(_admin)` | `payment_capture_failed` | gateway error — `outcome.success=false`, `paymentError` set |
| Overflow charge | same (split mode) | `PAYMENT` | `adminActor(_admin)` | `payment_captured_overflow` | second immediate charge for `amount - authorizedAmount` |
| Refund (partial) | `POST /payment/refund` | `REFUND` | `adminActor(_admin)` | `refund` | after `zikoyAPI` + DB `$inc` — `context.items[]`, `reason` |
| Refund failed | same | `REFUND` | `adminActor(_admin)` | `refund_failed` | `outcome.success=false`, `providerCode` |
| Cancel (hold release) | `POST /payment/cancel` | `PAYMENT` | `adminActor(_admin)` | `payment_canceled_hold_released` | `CancelTrans` success on auth `providerTxnId` |
| Cancel (captured) | same | `PAYMENT` + `REFUND` | `adminActor(_admin)` | `payment_canceled` + `refund` (fallback) | `CancelTrans` on capture id; on `920` → full remaining refund |
| Invoice opened | `GET /payment/invoice` | `INVOICE_OPEN` | `adminActor` or `userActor` | `invoice_opened` | after `invoiceLink` generated (optional but recommended) |

### 11.3 Canonical call shape

```js
import { record, userActor, adminActor } from '#server/utils/data/timeline.js' // or via utils.data.timeline

// example — refund success
await record({
  DL,
  order, // must have order.id
  eventType: DL.Timeline.constants.EVENT_TYPES.REFUND,
  actor: adminActor(_admin),
  changes: { oldData: { refundedTotal: prev }, newData: { refundedTotal: prev + total } },
  context: { step: 'refund', provider: 'hyp', providerTxnId: newId, parentProviderTxnId: capture.providerTxnId, amount: total, reason, items },
  outcome: { success: true },
  metadata: { source: 'payment/refund', referenceOrderNumber: order.number }
})
```

All payment routes must import `record` and call it **after** the DB mutation succeeds (or on failure, with `success:false`). Do not use `DL.Log.start()` for order history — that is the request log (`server/dl/schemas/log.js:1`), separate from the Timeline.

### 11.4 UI

Timeline entries appear in the existing order timeline view (admin Orders → order detail, user Account → order). No new collection view is needed; `GET /api/order/timeline` already filters by `orderId`. Ensure new `step` values are handled in the timeline renderer (map `context.step` to human strings, e.g. `payment_captured` → "תשלום נגבה").

---

## 12. Test scenarios (sandbox terminal)

1. Happy path: cart → pay (J5, CCode=700) → order `paid` + timeline `payment_authorized` → admin pick → packed/ready → capture OK + timeline `payment_captured` → done; verify `payment_transactions` chain auth→capture
2. Replay callback (same Sign/Id twice) → no duplicate `PaymentTransaction`, no duplicate timeline entry, second HTML re-served
3. Tampered redirect (drop/change param) → VERIFY fails → no state change + timeline `payment_failed` with `success=false`
4. User abandons at Hyp page → order stays `cart`, can restart checkout (old pending txn superseded)
5. Capture with picked amount < authorized (e.g. −1kg apples) → partial capture, `payment_captured` amount < authorized
6. Capture exceeding authorized → with over-capture enabled: single capture succeeds; disabled: auto-split into J4 (authorized part) + token charge (difference); verify both transactions + two `payment_captured` timeline entries
7. Partial refunds: refund one line fully, another partially, then attempt over-refund (UI cap + server reject) → timeline `refund` + `refund_failed` on over-refund attempt
8. Full refund after transmission (zikoyAPI path) → `REFUND` entry
9. Cancel pre-capture (hold released) and cancel post-capture same-day (CancelTrans); cancel next-day → expect 920 → **automatic full refund then status `canceled`**, timeline `payment_canceled_hold_released` or `refund` fallback
10. Expired-hold simulation: capture long after J5 (if sandbox allows forcing expiry) → `payment_capture_failed`
11. Invoice link: after capture, `GET /payment/invoice` as admin and as owning user → PDF downloads + optional `INVOICE_OPEN` entry; non-owner → 403
12. Apple/Google Pay: attempt full J5→J4 flow in sandbox — if single-use wallet token blocks J4 capture, wallets stay disabled at launch pending Hyp confirmation

