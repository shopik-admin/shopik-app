/**
 * The ops queue roles: what each permission may see — statuses, window dates,
 * stores, and whether it sees the whole queue or only what it claimed.
 *
 * Shared by the server filter builder (server/utils/data/opsFilter.js) and the
 * admin page that renders the tabs, so the queue a role gets and the tabs it
 * shows cannot disagree. Pure module: no server or client imports.
 */

// `statuses: null` means every status except an unopened cart.
export const CART = 'cart'

// Statuses that are no longer in process. The past date bound applies only to
// these: an order that still has work to do must stay visible however late it is
// (a picker behind on yesterday's picking, a shipper who did not deliver), while a
// closed order is history and only a look back is reasonable for it.
export const CLOSED_STATUSES = ['done', 'canceled', 'failed']

// Statuses in the order an order actually moves through the queue: the union for
// an admin holding several permissions reads the same in the filter and in the UI.
export const STATUS_ORDER = ['cart', 'paid-edit', 'paid', 'picking', 'picked', 'packed', 'shipped', 'done', 'canceled', 'failed']

// A permission's ceiling. `pastDays` bounds only the statuses in CLOSED_STATUSES;
// `futureDays` bounds everything. `null` on either = unbounded.
// `stores: 'scope'` = every store the admin owns, instead of the current store.
const PERMISSION_SCOPE = {
    // The manage views: every status, no forward limit — a manager has to be able to
    // reach an order that is still open whatever day it was made.
    'order:pick:manage': { role: 'manager', statuses: null, pastDays: 7, futureDays: null },
    'order:ship:manage': { role: 'contractor', statuses: null, pastDays: 7, futureDays: null, stores: 'scope' },
    // order:read is the read-only manager view: same scope, no queue actions.
    'order:read': { role: 'manager', statuses: null, pastDays: 7, futureDays: null },
    'order:ship': { role: 'shipper', statuses: ['packed', 'shipped', 'done', 'canceled'], pastDays: 1, futureDays: 1 },
    // paid-edit is not part of the picking queue: claim requires a status of exactly
    // paid, so a picker's set starts at paid. No past bound — he is graded on what he
    // still has to pick, not on what the date happened to be.
    'order:pick': { role: 'picker', statuses: ['paid', 'picking', 'picked', 'packed'], pastDays: null, futureDays: 1 },
}

// Checked most capable first. The role only decides which tabs the page renders:
// an admin holding several permissions keeps the union of their scopes, so a
// picker who also ships sees both queues, and a manager viewing as shipper keeps
// the whole store.
export const PERMISSION_ORDER = ['order:pick:manage', 'order:ship:manage', 'order:read', 'order:ship', 'order:pick']
export const ROLE_SCOPES = PERMISSION_SCOPE

// What one permission grants: its statuses and the window each of them gets.
export function viewScope(permission) {
    const scope = PERMISSION_SCOPE[permission]
    const statuses = [...(scope.statuses || STATUS_ORDER.filter(s => s !== CART))]
        .sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
    return {
        statuses,
        bounds: Object.fromEntries(statuses.map(status => [status, {
            past: CLOSED_STATUSES.includes(status) ? scope.pastDays : null,
            future: scope.futureDays
        }]))
    }
}

/**
 * Resolve what an admin may see. `hasPermission` is the admin's own check, so the
 * server (`_admin.hasPermission`) and the client (`user.role.permissions`) build
 * the same scope from the same table.
 *
 * `bounds[status]` is the window that permission grants for that status, so the
 * date rule stays per status instead of one window for the whole queue.
 */
export function opsScope({ hasPermission, isSuperAdmin }) {
    const held = isSuperAdmin ? [...PERMISSION_ORDER] : PERMISSION_ORDER.filter(p => hasPermission?.(p))
    if (!held.length) return null

    const bounds = {}
    for (const permission of held) {
        const view = viewScope(permission)
        for (const [status, window] of Object.entries(view.bounds))
            bounds[status] = wider(bounds[status], window)
    }

    return {
        role: PERMISSION_SCOPE[held[0]].role,
        held,
        // Only the statuses some held permission actually grants.
        statuses: STATUS_ORDER.filter(s => bounds[s]),
        bounds,
        // The contractor owns several stores; everyone else — super included —
        // works the current store. A manager holding both manage permissions is a
        // manager, not a contractor: his queue is the store he is standing in.
        stores: PERMISSION_SCOPE[held[0]].stores || 'current',
        canPick: isSuperAdmin || held.includes('order:pick'),
        canShip: isSuperAdmin || held.includes('order:ship'),
        // A read-level scope sees the whole queue; the others see only their own
        // claims plus what nobody has claimed yet.
        ownOnly: !(isSuperAdmin || held.some(p => PERMISSION_SCOPE[p].statuses === null)),
    }
}

// The union of two permissions is the widest window either one allows — null
// (unbounded) beats any number.
function wider(a, b) {
    if (!a) return b
    const pick = (x, y) => x == null || y == null ? null : Math.max(x, y)
    return { past: pick(a.past, b.past), future: pick(a.future, b.future) }
}

/**
 * The status + window clause for a queue request: the role's ceiling narrowed by what
 * was asked for, per status. A status outside the role, or dates entirely outside its
 * window, answers nothing rather than widening the queue.
 *
 * When the statuses asked for need different date bounds — the usual case, since a
 * closed order is bounded backwards and an open one is not — this becomes an `$or` of
 * branches, which is why the queue reads through the raw Model.
 *
 * `defaults` is the queue rule: off for a single order lookup (the ops detail page),
 * where the window would hide orders the role can otherwise read.
 */
export function opsStatusWindow({ scope, status, dates, today, defaults = true }) {
    const requested = normalizeList(status)
    const statuses = requested ? requested.filter(s => scope.bounds[s]) : scope.statuses
    if (!statuses.length) return { status: { $in: [] } }

    // Statuses sharing the same bounds share one branch.
    const groups = {}
    for (const status of statuses) {
        const bounds = scope.bounds[status]
        const key = `${bounds.past}|${bounds.future}`
        groups[key] ||= { bounds, statuses: [] }
        groups[key].statuses.push(status)
    }

    const branches = Object.values(groups).map(({ bounds, statuses: group }) => {
        const clause = {}
        // One status asked for reads as itself, not as a one-item $in.
        clause.status = group.length === 1 ? group[0] : { $in: group }
        const window = dateClause({ ...bounds, request: dates, today, defaults })
        if (window) clause['window.date'] = window
        return clause
    })

    return branches.length === 1 ? branches[0] : { $or: branches }
}

// One branch's window: the role's bounds when nothing was requested, the request
// clamped inside them otherwise — a request can only narrow, never widen.
function dateClause({ past, future, request, today, defaults }) {
    let gte = defaults && past != null ? addDays(today, -past) : null
    let lte = defaults && future != null ? addDays(today, future) : null

    if (request?.$gte) gte = gte == null ? request.$gte : maxStr(gte, request.$gte)
    if (request?.$lte) lte = lte == null ? request.$lte : minStr(lte, request.$lte)

    if (Array.isArray(request?.$in)) {
        const allowed = request.$in.filter(d => (gte == null || d >= gte) && (lte == null || d <= lte))
        return allowed.length ? { $in: allowed } : { $in: [] }
    }

    if (gte != null && lte != null && gte > lte) return { $in: [] }

    const clause = {}
    if (gte != null) clause.$gte = gte
    if (lte != null) clause.$lte = lte
    return Object.keys(clause).length ? clause : null
}

function normalizeList(value) {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value?.$in)) return value.$in
    return null
}

const maxStr = (a, b) => a > b ? a : b
const minStr = (a, b) => a < b ? a : b

// window.date is a YYYY-MM-DD business day: compared as strings, moved as days.
export function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d, 12)
    date.setDate(date.getDate() + days)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
