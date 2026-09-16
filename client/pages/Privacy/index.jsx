import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import styles from './privacy.module.css'

export default function Privacy() {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>מדיניות פרטיות ואבטחת מידע</h1>
                <p className={styles.subtitle}>עודכן לאחרונה: ספטמבר 2026</p>
            </header>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>1. מבוא והתחייבות לפרטיות</h2>
                <p className={styles.paragraph}>
                    אנו בשפע.קליק מכבדים את פרטיותך ומחויבים להגן על המידע האישי שאתה משתף עמנו. מסמך זה מפרט כיצד אנו אוספים, שומרים ומשתמשים במידע שנמסר לנו.
                </p>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>2. המידע שאנו אוספים</h2>
                <p className={styles.paragraph}>
                    בעת השימוש באתר וביצוע הזמנות, נאסף מידע הנמסר על ידך באופן ישיר (כגון שם, מספר טלפון, כתובת למשלוח, וכתובת דוא"ל) וכן מידע טכני הנוגע לאופן השימוש באתר (כתובת IP, סוג דפדפן ונתוני שימוש).
                </p>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>3. מטרות השימוש במידע</h2>
                <ul className={styles.list}>
                    <li>עיבוד, ליקוט ואספקת ההזמנות שבוצעו על ידך.</li>
                    <li>מתן שירות לקוחות ועדכונים שוטפים בנוגע לסטטוס המשלוח.</li>
                    <li>שיפור חוויית הגלישה והתאמת המוצרים והמבצעים להעדפותיך.</li>
                    <li>עמידה בדרישות החוק והרגולציה החלות על המפעיל.</li>
                </ul>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>4. אבטחת מידע ותשלומים</h2>
                <p className={styles.paragraph}>
                    האתר נוקט באמצעי אבטחה מחמירים ומקובלים לשמירה על סודיות המידע ואבטחתו. פרטי כרטיסי האשראי אינם נשמרים בשרתינו ומעובדים ישירות באמצעות חברות סליקה מורשות העומדות בתקני אבטחה מחמירים (PCI-DSS).
                </p>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>5. שימוש ב-Cookies (עוגיות)</h2>
                <p className={styles.paragraph}>
                    האתר עושה שימוש בקבצי עוגיות (Cookies) לצורך תפעולו התקין, שמירת פריטים בעגלת הקניות, אימות נתונים והתאמת השירותים לצרכי המשתמש. באפשרותך לשנות את הגדרות הדפדפן שלך כדי לחסום עוגיות, אולם הדבר עשוי להשפיע על תפקוד האתר.
                </p>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>6. זכויות המשתמש ופניות</h2>
                <p className={styles.paragraph}>
                    לפי חוק הגנת הפרטיות, הינך זכאי לעיין במידע שנשמר אודותיך ולבקש את תיקונו או מחיקתו במידה ואינו מדויק. בכל שאלה בנושא פרטיות ואבטחת מידע ניתן לפנות אלינו באמצעות מוקד השירות.
                </p>
            </section>
        </div>
    )
}

