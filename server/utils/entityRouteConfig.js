// Declares which standard CRUD routes (read / count / id / filters) are dynamically
// generated for each api entity (see server/utils/entityApi.js#applyEntityRoutes).
// This is the single place to look at to know the generated route surface:
// entities not listed here get NO generated routes, and a custom handler in
// server/api/<entity>/<op>.js always wins over a generated one.
//
// Entry shape:
//   ops         standard routes to generate: 'read' | 'count' | 'id'
//   model       DL model name (defaults to PascalCase of the entity key)
//   filters     MAIN_FIELDS for the generated 'filters' route (omitted = no filters route)
//   permissions flat array overriding the default ['<entity>:read'] for the
//               read/count/filters routes; id routes always use ['<entity>:id']
//   config      extra route config merged into every generated route (e.g. { log: false })
//   configs     per-op extra route config, wins over `config` for that op
export default {
    admin: {
        ops: ['count'],
        filters: ['phone', 'email', 'name.first', 'name.last']
    },
    area_group: {
        ops: ['read'],
        permissions: ['supply_area:read']
    },
    cash_register: {
        ops: ['read', 'id']
    },
    comax_product: {
        ops: ['read', 'count', 'id']
    },
    comax_sale: {
        ops: ['read', 'count']
    },
    coupon: {
        ops: ['count'],
        filters: ['status', 'department', 'benefit', 'start']
    },
    domain: {
        ops: ['read', 'count', 'id']
    },
    log: {
        ops: ['read', 'count'],
        filters: ['status', 'action', 'actor.type', 'ip'],
        configs: { read: { log: false }, count: { log: false } }
    },
    order: {
        ops: ['read', 'count', 'id'],
        filters: ['status', 'storeId', 'deliveryMethod', 'window.date']
    },
    'order/ops': {
        model: 'Order',
        filters: ['status', 'storeId', 'deliveryMethod', 'window.date'],
        permissions: ['order:read', 'order:pick', 'order:ship']
    },
    order_window_template: {
        ops: ['read']
    },
    product: {
        ops: ['read', 'count'],
        filters: ['status', 'category.title', 'producer', 'label']
    },
    sale: {
        ops: ['read', 'count'],
        filters: ['status', 'kind', 'start']
    },
    setting: {
        ops: ['read', 'id']
    },
    store: {
        ops: ['read', 'count', 'id'],
        filters: ['active', 'address.city', 'deliveryMethods']
    },
    user: {
        ops: ['read', 'count'],
        filters: ['phone', 'email', 'name.first', 'name.last']
    },
}
