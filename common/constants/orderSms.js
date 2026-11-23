import hebrewTexts from '../texts/hebrew.json' with { type: 'json' }

// Customer-facing copy: the recipient's language, not the admin's UI language.
// At this stage it is always Hebrew.
const texts = hebrewTexts.texts || {}

export const ORDER_SMS_CATEGORY = 'notifications'
export const ORDER_SMS_SUB_CATEGORY = 'order-sms'

export const ORDER_SMS_STAGES = [
    { key: 'paid', label: 'Order received', description: 'Sent after a successful payment.' },
    { key: 'picking', label: 'Picking started', description: 'Sent when an operator starts picking the order.' },
    { key: 'shipped', label: 'On the way / ready', description: 'Sent when the order leaves the store or is ready for pickup.' },
    { key: 'done', label: 'Delivered / picked up', description: 'Sent when the order is completed.' }
]

export const ORDER_SMS_METHODS = [
    { key: 'delivery', label: 'Delivery' },
    { key: 'pickup', label: 'Pickup' }
]

export const ORDER_SMS_TEMPLATE_KEYS = {
    delivery: {
        paid: 'order_sms_paid_delivery',
        picking: 'order_sms_picking_delivery',
        shipped: 'order_sms_shipped_delivery',
        done: 'order_sms_done_delivery'
    },
    pickup: {
        paid: 'order_sms_paid_pickup',
        picking: 'order_sms_picking_pickup',
        shipped: 'order_sms_shipped_pickup',
        done: 'order_sms_done_pickup'
    }
}

export const ORDER_SMS_VARIABLES = [
    { key: 'customer_first_name', label: 'Customer first name' },
    { key: 'order_number', label: 'Order number' },
    { key: 'delivery_date', label: 'Delivery / pickup date' },
    { key: 'delivery_window_start', label: 'Window start' },
    { key: 'delivery_window_end', label: 'Window end' },
    { key: 'order_link', label: 'Order link' },
    { key: 'pickup_store_name', label: 'Pickup store name' }
]

export const DEFAULT_ORDER_SMS_TEMPLATES = {
    delivery: {
        paid: texts.order_sms_default_paid_delivery,
        picking: texts.order_sms_default_picking_delivery,
        shipped: texts.order_sms_default_shipped_delivery,
        done: texts.order_sms_default_done_delivery
    },
    pickup: {
        paid: texts.order_sms_default_paid_pickup,
        picking: texts.order_sms_default_picking_pickup,
        shipped: texts.order_sms_default_shipped_pickup,
        done: texts.order_sms_default_done_pickup
    }
}

export function getOrderSmsMethod(order) {
    return order?.deliveryMethod === 'pickup' ? 'pickup' : 'delivery'
}

export function getOrderSmsTemplateKey(method, stage) {
    return ORDER_SMS_TEMPLATE_KEYS[method]?.[stage] || null
}

export function getDefaultOrderSmsTemplate(method, stage) {
    return DEFAULT_ORDER_SMS_TEMPLATES[method]?.[stage] || ''
}
