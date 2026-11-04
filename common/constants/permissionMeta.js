/**
 * Hebrew display metadata for every permission used by the system.
 *
 * Keys must stay in sync with:
 *  - server/utils/auth/permissions.js  (role permissions)
 *  - common/constants/apiKeyPermissions.js  (API key permissions)
 *
 * tests/permissions/permissionMeta.test.js guards that sync.
 */
export const permissionGroups = {
    admin: 'מנהלים',
    role: 'תפקידים והרשאות',
    product: 'מוצרים',
    domain: 'מתחמים',
    setting: 'הגדרות',
    log: 'לוגים',
    user: 'משתמשים',
    store: 'חנויות',
    order: 'הזמנות',
    sale: 'מבצעים',
    coupon: 'קופונים',
    comax_product: 'מוצרי קומקס',
    comax_sale: 'מבצעי קומקס',
    order_window_template: 'חלונות הזמנה',
    order_window: 'סנכרון חלונות הזמנה',
    supply_area: 'אזורי אספקה',
    display_block: 'באנרים וקרוסלות',
    payment: 'תשלומים',
    transaction: 'עסקאות',
    payment_transaction: 'עסקאות תשלום',
    invoice: 'חשבוניות',
    cash_register: 'קופה רושמת',
    report: 'דוחות',
    api_key: 'מפתחות API',
    bot: 'בוט'
}

export const permissionMeta = {
    // מנהלים
    'admin:super': {
        name: 'סופר אדמין',
        description: 'גישה מלאה לכל המערכת, כולל כלי פיתוח ופעולות תחזוקה.'
    },
    'admin:create': {
        name: 'הוספת מנהל',
        description: 'יצירת משתמש ניהולי חדש.'
    },
    'admin:update': {
        name: 'עריכת מנהל',
        description: 'עדכון פרטי מנהל, התפקיד והחנויות שלו.'
    },
    'admin:id': {
        name: 'צפייה בפרטי מנהל',
        description: 'פתיחת הכרטיס של מנהל בודד.'
    },
    'admin:read': {
        name: 'צפייה במנהלים',
        description: 'צפייה ברשימת המנהלים.'
    },

    // תפקידים והרשאות
    'role:create': {
        name: 'יצירת תפקיד',
        description: 'הוספת תפקיד חדש עם סט הרשאות משלו.'
    },
    'role:update': {
        name: 'עריכת תפקיד',
        description: 'שינוי שם התפקיד וההרשאות שלו.'
    },
    'role:delete': {
        name: 'מחיקת תפקיד',
        description: 'הסרת תפקיד מהמערכת.'
    },
    'role:read': {
        name: 'צפייה בתפקידים',
        description: 'צפייה בעץ התפקידים.'
    },
    'role:id': {
        name: 'צפייה בפרטי תפקיד',
        description: 'פתיחת הכרטיס של תפקיד בודד.'
    },

    // מוצרים
    'product:create': {
        name: 'הוספת מוצר',
        description: 'יצירת מוצר חדש בקטלוג.'
    },
    'product:update': {
        name: 'עריכת מוצר',
        description: 'עדכון מוצרים, קטגוריות וסנכרון מקומקס.'
    },
    'product:read': {
        name: 'צפייה במוצרים',
        description: 'צפייה בקטלוג המוצרים.'
    },
    'product:id': {
        name: 'צפייה בפרטי מוצר',
        description: 'פתיחת הכרטיס של מוצר בודד.'
    },

    // מתחמים
    'domain:create': {
        name: 'הוספת מתחם',
        description: 'יצירת אתר (דומיין) חדש.'
    },
    'domain:update': {
        name: 'עריכת מתחם',
        description: 'עדכון הגדרות של מתחם.'
    },
    'domain:read': {
        name: 'צפייה במתחמים',
        description: 'צפייה ברשימת המתחמים.'
    },
    'domain:id': {
        name: 'צפייה בפרטי מתחם',
        description: 'פתיחת הכרטיס של מתחם בודד.'
    },

    // הגדרות
    'setting:create': {
        name: 'הוספת הגדרה',
        description: 'יצירת הגדרה חדשה.'
    },
    'setting:update': {
        name: 'עריכת הגדרות',
        description: 'עדכון הגדרות החנות ותבניות SMS.'
    },
    'setting:read': {
        name: 'צפייה בהגדרות',
        description: 'צפייה בהגדרות החנות.'
    },
    'setting:id': {
        name: 'צפייה בפרטי הגדרה',
        description: 'פתיחת הגדרה בודדת.'
    },
    'setting:delete': {
        name: 'מחיקת הגדרה',
        description: 'הסרת הגדרה מהמערכת.'
    },

    // לוגים
    'log:read': {
        name: 'צפייה בלוגים',
        description: 'צפייה בלוג הפעולות והבקשות במערכת.'
    },

    // משתמשים
    'user:create': {
        name: 'הוספת משתמש',
        description: 'יצירת לקוח חדש.'
    },
    'user:update': {
        name: 'עריכת משתמש',
        description: 'עדכון פרטי לקוח וכתובותיו.'
    },
    'user:id': {
        name: 'צפייה בפרטי משתמש',
        description: 'פתיחת הכרטיס של לקוח בודד.'
    },
    'user:read': {
        name: 'צפייה במשתמשים',
        description: 'צפייה ברשימת הלקוחות.'
    },
    'user:block': {
        name: 'חסימת משתמש',
        description: 'חסימה או שחרור של לקוח.'
    },

    // חנויות
    'store:create': {
        name: 'הוספת חנות',
        description: 'יצירת חנות או סניף חדש.'
    },
    'store:update': {
        name: 'עריכת חנות',
        description: 'עדכון פרטי חנות.'
    },
    'store:read': {
        name: 'צפייה בחנויות',
        description: 'צפייה ברשימת החנויות.'
    },
    'store:id': {
        name: 'צפייה בפרטי חנות',
        description: 'פתיחת הכרטיס של חנות בודדת.'
    },
    'store:all': {
        name: 'גישה לכל החנויות',
        description: 'גישה לכל החנויות, גם כאלה שלא משויכות למשתמש.'
    },

    // הזמנות
    'order:create': {
        name: 'יצירת הזמנה',
        description: 'יצירת הזמנה חדשה.'
    },
    'order:update': {
        name: 'עריכת הזמנה',
        description: 'עדכון פרטי הזמנה, סטטוס וכתובת.'
    },
    'order:read': {
        name: 'צפייה בהזמנות',
        description: 'צפייה ברשימת ההזמנות.'
    },
    'order:id': {
        name: 'צפייה בפרטי הזמנה',
        description: 'פתיחת הכרטיס של הזמנה בודדת.'
    },
    'order:pick': {
        name: 'ליקוט הזמנות',
        description: 'קבלת הזמנות לליקוט וסימון פריטים שנאספו.'
    },
    'order:ship': {
        name: 'משלוח הזמנות',
        description: 'תפיסת משלוחים, ניווט וסימון מסירה.'
    },
    'order:pick:manage': {
        name: 'ניהול הליקוט',
        description: 'צפייה בכל תור הליקוט ושחרור הזמנות שנתפסו.'
    },
    'order:ship:manage': {
        name: 'ניהול המשלוחים',
        description: 'צפייה בכל המשלוחים, ביטול משלוח ואישור מסירה חריגה.'
    },
    'order:payment': {
        name: 'ניהול תשלומי הזמנה',
        description: 'ביצוע חיוב, ביטול, זיכוי והפקת חשבונית להזמנה.'
    },

    // מבצעים
    'sale:create': {
        name: 'יצירת מבצע',
        description: 'הוספת מבצע חדש.'
    },
    'sale:update': {
        name: 'עריכת מבצע',
        description: 'עדכון מבצעים וסנכרון מקומקס.'
    },
    'sale:read': {
        name: 'צפייה במבצעים',
        description: 'צפייה ברשימת המבצעים.'
    },
    'sale:id': {
        name: 'צפייה בפרטי מבצע',
        description: 'פתיחת הכרטיס של מבצע בודד.'
    },

    // קופונים
    'coupon:create': {
        name: 'יצירת קופון',
        description: 'הוספת קופון הנחה חדש.'
    },
    'coupon:update': {
        name: 'עריכת קופון',
        description: 'עדכון קופון קיים.'
    },
    'coupon:read': {
        name: 'צפייה בקופונים',
        description: 'צפייה ברשימת הקופונים.'
    },
    'coupon:id': {
        name: 'צפייה בפרטי קופון',
        description: 'פתיחת הכרטיס של קופון בודד.'
    },

    // מוצרי קומקס
    'comax_product:read': {
        name: 'צפייה במוצרי קומקס',
        description: 'צפייה בקטלוג המוצרים שמגיע מקומקס.'
    },
    'comax_product:id': {
        name: 'צפייה בפרטי מוצר קומקס',
        description: 'פתיחת הכרטיס של מוצר בודד מקומקס.'
    },
    'comax_product:update': {
        name: 'עריכת מוצרי קומקס',
        description: 'ייבוא, סנכרון ועדכון מוצרים מקומקס.'
    },
    'comax_product:export': {
        name: 'ייצוא מוצרי קומקס',
        description: 'הורדת נתוני המוצרים לקובץ.'
    },

    // מבצעי קומקס
    'comax_sale:read': {
        name: 'צפייה במבצעי קומקס',
        description: 'צפייה במבצעים שמגיעים מקומקס.'
    },
    'comax_sale:id': {
        name: 'צפייה בפרטי מבצע קומקס',
        description: 'פתיחת הכרטיס של מבצע בודד מקומקס.'
    },
    'comax_sale:update': {
        name: 'עריכת מבצעי קומקס',
        description: 'ייבוא ועדכון מבצעים מקומקס.'
    },
    'comax_sale:export': {
        name: 'ייצוא מבצעי קומקס',
        description: 'הורדת נתוני המבצעים לקובץ.'
    },

    // חלונות הזמנה
    'order_window_template:create': {
        name: 'יצירת חלון הזמנה',
        description: 'הוספת חלון הזמנה חדש.'
    },
    'order_window_template:update': {
        name: 'עריכת חלון הזמנה',
        description: 'עדכון חלונות הזמנה וימים מיוחדים.'
    },
    'order_window_template:read': {
        name: 'צפייה בחלונות הזמנה',
        description: 'צפייה בלוח חלונות ההזמנה.'
    },
    'order_window_template:id': {
        name: 'צפייה בפרטי חלון הזמנה',
        description: 'פתיחת הכרטיס של חלון בודד.'
    },
    'order_window:sync': {
        name: 'סנכרון חלונות מקומקס',
        description: 'משיכת חלונות ההזמנה מקומקס.'
    },

    // אזורי אספקה
    'supply_area:create': {
        name: 'הוספת אזור אספקה',
        description: 'יצירת אזור אספקה חדש.'
    },
    'supply_area:update': {
        name: 'עריכת אזור אספקה',
        description: 'עדכון גבולות, איחוד אזורים ושיוך חנויות.'
    },
    'supply_area:read': {
        name: 'צפייה באזורי אספקה',
        description: 'צפייה במפת אזורי האספקה.'
    },
    'supply_area:id': {
        name: 'צפייה בפרטי אזור אספקה',
        description: 'פתיחת הכרטיס של אזור בודד.'
    },
    'supply_area:delete': {
        name: 'מחיקת אזור אספקה',
        description: 'הסרת אזור אספקה מהמפה.'
    },

    // באנרים וקרוסלות
    'display_block:create': {
        name: 'הוספת באנר',
        description: 'יצירת באנר או קרוסלה חדשה.'
    },
    'display_block:update': {
        name: 'עריכת באנר',
        description: 'עדכון תוכן, תמונות וסדר של באנרים.'
    },
    'display_block:read': {
        name: 'צפייה בבאנרים',
        description: 'צפייה בבאנרים ובקרוסלות באתר.'
    },
    'display_block:id': {
        name: 'צפייה בפרטי באנר',
        description: 'פתיחת הכרטיס של באנר בודד.'
    },
    'display_block:delete': {
        name: 'מחיקת באנר',
        description: 'הסרת באנר מהאתר.'
    },

    // תשלומים ועסקאות
    'payment:create': {
        name: 'יצירת תשלום',
        description: 'חיוב כרטיס אשראי בעמוד התשלום של האתר.'
    },
    'transaction:read': {
        name: 'צפייה בעסקאות',
        description: 'צפייה בהיסטוריית עסקאות התשלום.'
    },
    'payment_transaction:read': {
        name: 'צפייה בעסקאות תשלום',
        description: 'צפייה בפרטי עסקאות התשלום.'
    },

    // חשבוניות
    'invoice:read': {
        name: 'צפייה בחשבוניות',
        description: 'צפייה בחשבוניות שהופקו.'
    },
    'invoice:issue': {
        name: 'הפקת חשבונית',
        description: 'הפקת חשבונית מס להזמנה.'
    },
    'invoice:credit': {
        name: 'הפקת חשבונית זיכוי',
        description: 'הפקת זיכוי על חשבונית קיימת.'
    },

    // קופה רושמת
    'cash_register:create': {
        name: 'הוספת קופה',
        description: 'פתיחת קופה רושמת חדשה.'
    },
    'cash_register:read': {
        name: 'צפייה בקופות',
        description: 'צפייה ברשימת הקופות.'
    },
    'cash_register:update': {
        name: 'עריכת קופה',
        description: 'עדכון פרטי קופה רושמת.'
    },
    'cash_register:id': {
        name: 'צפייה בפרטי קופה',
        description: 'פתיחת הכרטיס של קופה בודדת.'
    },

    // דוחות
    'report:read': {
        name: 'צפייה בדוחות',
        description: 'צפייה בדוחות שהופקו.'
    },
    'report:run': {
        name: 'הפקת דוח',
        description: 'יצירת דוח חדש מנתוני קומקס.'
    },

    // מפתחות API
    'api_key:create': {
        name: 'יצירת מפתח API',
        description: 'יצירת מפתח גישה למערכות חיצוניות.'
    },
    'api_key:read': {
        name: 'צפייה במפתחות API',
        description: 'צפייה ברשימת מפתחות הגישה.'
    },
    'api_key:update': {
        name: 'עריכת מפתח API',
        description: 'עדכון ההרשאות של מפתח גישה.'
    },
    'api_key:delete': {
        name: 'מחיקת מפתח API',
        description: 'ביטול והסרת מפתח גישה.'
    },
    'api_key:id': {
        name: 'צפייה בפרטי מפתח API',
        description: 'פתיחת הכרטיס של מפתח בודד.'
    },

    // בוט (מפתחות API בלבד)
    'bot:read': {
        name: 'קריאת נתונים מהבוט',
        description: 'גישה כללית לקריאת נתונים דרך הבוט.'
    },
    'bot:delivery': {
        name: 'בדיקת אזורי משלוח',
        description: 'בדיקה האם כתובת נמצאת באזור משלוח.'
    },
    'bot:otp': {
        name: 'אימות משתמשים',
        description: 'שליחת ובדיקת קוד אימות חד־פעמי.'
    },
    'bot:order': {
        name: 'הזמנות דרך הבוט',
        description: 'יצירת הזמנות ובדיקת סטטוס דרך הבוט.'
    },
    'bot:coupon': {
        name: 'בדיקת קופונים',
        description: 'בדיקת תוקף והנחה של קופון.'
    },
    'bot:invoice': {
        name: 'קישור לחשבונית',
        description: 'שליפת קישור להורדת חשבונית.'
    }
}

/** Permission metadata with a safe fallback for permissions added later. */
export function getPermissionMeta(permission) {
    return permissionMeta[permission] || { name: permission, description: '' }
}

/** Hebrew section title for a permission prefix, falling back to the prefix. */
export function getPermissionGroupName(group) {
    return permissionGroups[group] || group
}
