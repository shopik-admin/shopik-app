import classNames from 'common/functions/classNames'
import styles from './icon.module.css'
import {
    LuAlignLeft, LuBadgePercent, LuBarcode, LuChevronDown, LuChevronLeft, LuChevronRight,
    LuCircleCheck, LuCreditCard, LuImage, LuLayoutGrid, LuListPlus, LuLogOut, LuMap,
    LuNotebookPen, LuPencil, LuPlus, LuShoppingBag, LuShoppingCart, LuTicket, LuTrash2,
    LuTruck, LuUser, LuX,
} from 'react-icons/lu'
import { TbHeartPlus } from 'react-icons/tb'

// Storefront-only icon map. Mirrors the API of ./index.jsx but bundles just
// the icons actually used by client/ + client-reachable common components,
// so the admin icon set (~80 icons) doesn't ship in the storefront bundle.
// The client vite config aliases 'common/components/Icon' to this file.
// CMS-driven menu icons always render via `fallback`, so unknown names are safe.
const iconsList = {
    add: LuPlus,
    back: LuChevronRight,
    bag: LuShoppingBag,
    barcode: LuBarcode,
    card: LuCreditCard,
    cart: props => <LuShoppingCart style={{ transform: 'scaleX(-1)' }} {...props} />,
    check: LuCircleCheck,
    coupon: LuTicket,
    down: LuChevronDown,
    edit: LuPencil,
    fallback: LuLayoutGrid,
    heartPlus: TbHeartPlus,
    image: LuImage,
    left: LuChevronLeft,
    listPlus: LuListPlus,
    logout: LuLogOut,
    map: LuMap,
    menu: LuAlignLeft,
    note: LuNotebookPen,
    orders: LuShoppingBag,
    person: LuUser,
    right: LuChevronRight,
    salePercent: LuBadgePercent,
    trash: LuTrash2,
    truck: props => <LuTruck style={{ transform: 'scaleX(-1)' }} {...props} />,
    user: LuUser,
    x: LuX,
}

/**
 * @typedef {keyof typeof iconsList} IconNames
 */
export default function ClientIcon({ className, name, fallback = false, ...props }) {
    let I = iconsList[name]
    if (!I && fallback) I = iconsList.fallback

    return I ? <I
        aria-label={`icon ${name}`}
        className={classNames(styles.icon, className)}
        {...props}
    /> : null
}
