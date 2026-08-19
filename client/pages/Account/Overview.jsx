import Text from 'common/components/Text'
import Flex from 'common/components/Flex'

export default function Overview() {
    return (
        <div>
            <Text tag="h2" size="h3" bold style={{ marginBottom: 16 }}>
                סקירה כללית
            </Text>
            <Text size="p" mode="sub">
                ברוכים הבאים לאזור האישי שלך. כאן תוכלו לנהל את ההזמנות, הכתובות, אמצעי התשלום והפרטים האישיים שלכם.
            </Text>

            <Flex gap={20} style={{ marginTop: 30 }} wrap>
                {/* Example of overview cards */}
                <div style={{ flex: '1 1 200px', padding: 20, border: '1px solid #eee', borderRadius: 8 }}>
                    <Text size="h4" bold>הזמנות אחרונות</Text>
                    <Text size="p" mode="sub" style={{ marginTop: 10, color: '#666' }}>אין הזמנות עדיין.</Text>
                </div>
                <div style={{ flex: '1 1 200px', padding: 20, border: '1px solid #eee', borderRadius: 8 }}>
                    <Text size="h4" bold>כתובת ברירת מחדל</Text>
                    <Text size="p" mode="sub" style={{ marginTop: 10, color: '#666' }}>לא הוגדרה כתובת.</Text>
                </div>
            </Flex>
        </div>
    )
}
