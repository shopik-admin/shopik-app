import { useLocation } from 'react-router'

// Product links carry the current location as `backgroundLocation` so the
// product page renders as an overlay on top of the page the customer came
// from, while the address bar still shows the canonical product URL.
// Opening that URL directly (new tab, refresh, shared link) has no such state,
// so the router falls back to the regular full product page.
export function productModalLinkProps(location, product, sales) {
    const backgroundLocation = location.state?.backgroundLocation

    return {
        to: `/product/${product.id}`,
        state: {
            product,
            sales,
            // Already inside the overlay: keep the original background so the
            // modal stays above the same page and related products swap the
            // modal content instead of stacking overlays.
            backgroundLocation: backgroundLocation || location
        },
        // Inside the overlay a product is a single "screen": replace the
        // history entry so Back closes the overlay instead of walking through
        // every product that was previewed.
        replace: !!backgroundLocation
    }
}

export function useProductModalLink(product, sales) {
    return productModalLinkProps(useLocation(), product, sales)
}
