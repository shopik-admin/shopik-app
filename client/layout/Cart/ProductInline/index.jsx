import CommonProductInline from 'common/components/ProductInline'
import { useProductCart } from 'common/components/Product/useProductCart.js'

export default function ProductInline({ remove = true, note = true, product, sales, ...props }) {
    const { amount, updateAmount, remove: handleRemove, saleTotalAmount, effectiveSalesForChild } = useProductCart(product, sales)

    return <CommonProductInline
        product={product}
        sales={effectiveSalesForChild}
        remove={remove}
        note={note}
        amount={amount}
        saleTotalAmount={saleTotalAmount}
        onRemove={remove ? handleRemove : undefined}
        onUpdateAmount={updateAmount}
        {...props}
    />
}
