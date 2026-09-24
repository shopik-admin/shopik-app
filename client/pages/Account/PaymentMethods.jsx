import Text from 'common/components/Text'

export default function PaymentMethods() {
    return (
        <div>
            <Text tag="h2" size="h3" bold style={{ marginBottom: 16 }}>
                payment_methods_title
            </Text>
            <Text size="p" mode="sub">
                payment_methods_subtitle
            </Text>
        </div>
    )
}
