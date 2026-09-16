import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import styles from './terms.module.css'

export default function Terms() {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>תקנון אתר ותנאי שימוש</h1>
                <p className={styles.subtitle}>עודכן לאחרונה: ספטמבר 2026</p>
            </header>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>1. כללי ומבוא</h2>
                <p className={styles.paragraph}>
                    ברוכים הבאים לאתר שפע.קליק (להלן: "האתר"). השימוש באתר, לרבות הרכישה באמצעותו, כפופים לתנאים המפורטים בתקנון זה.
                    גלישה באתר ו/או ביצוע הזמנה מהווים את הסכמתך לתנאים המפורטים להלן ללא כל סייג.
                </p>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>2. תנאי השימוש ורישום</h2>
                <p className={styles.paragraph}>
                    רשאי להשתמש באתר כל אדם כשיר משפטית המחזיק באמצעי תשלום תקף בישראל. בעת ההרשמה וביצוע הזמנה, המשתמש מתחייב למסור פרטים נכונים, מלאים ומדויקים.
                </p>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>3. הזמנות, מחירים ותשלום</h2>
                <p className={styles.paragraph}>
                    מחירי המוצרים המוצגים באתר כוללים מע"מ כדין אלא אם צוין אחרת במפורש. האתר שומר לעצמו את הזכות לעדכן את מחירי המוצרים, תעריפי המשלוח והמבצעים מעת לעת.
                </p>
                <ul className={styles.list}>
                    <li>החיוב יבוצע באמצעות כרטיס אשראי או אמצעי תשלום מאושר אחר בעת השלמת ההזמנה.</li>
                    <li>במוצרים הנמכרים לפי משקל, המחיר הסופי ייקבע בהתאם לשקילה בפועל בעת ליקוט ההזמנה.</li>
                    <li>מבצעים והטבות תקפים עד לגמר המלאי או עד למועד המצוין באתר.</li>
                </ul>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>4. אספקה ומשלוחים</h2>
                <p className={styles.paragraph}>
                    המשלוחים יסופקו במסגרת חלון הזמן שנבחר על ידי הלקוח בעת ביצוע ההזמנה ובכפוף לאזורי החלוקה המוגדרים באתר.
                    באפשרות הלקוח לבחור באפשרות איסוף עצמי מסניפי הרשת בתיאום מראש.
                </p>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>5. ביטול עסקה והחזרות</h2>
                <p className={styles.paragraph}>
                    ביטול עסקה והחזרת מוצרים יתבצעו בהתאם להוראות חוק הגנת הצרכן, התשמ"א-1981 ותקנותיו. מוצרי מזון פסידים ומוצרים הדורשים קירור אינם ניתנים להחזרה לאחר קבלתם, למעט במקרים של פגם או אי-התאמה.
                </p>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>6. שירות לקוחות ויצירת קשר</h2>
                <p className={styles.paragraph}>
                    לכל שאלה, פנייה או בירור, שירות הלקוחות שלנו עומד לרשותכם באמצעות פנייה בוואטסאפ או בדרכי ההתקשרות המפורטות באתר.
                </p>
            </section>
        </div>
    )
}

