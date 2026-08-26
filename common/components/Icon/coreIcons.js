import {
    LuPlus, LuPencil, LuTrash2, LuChevronLeft, LuChevronRight, LuChevronDown,
    LuLogOut, LuUser, LuLayoutGrid, LuShoppingCart, LuTicket,
    LuBarcode, LuListPlus, LuNotebookPen, LuArrowUpDown
} from 'react-icons/lu'
import { TbHeartPlus } from 'react-icons/tb'

export const coreIcons = {
    add: LuPlus,
    edit: LuPencil,
    trash: LuTrash2,
    left: LuChevronLeft,
    right: LuChevronRight,
    back: LuChevronRight,
    down: LuChevronDown,
    barcode: LuBarcode,
    cart: LuShoppingCart,
    coupon: LuTicket,
    heartPlus: TbHeartPlus,
    listPlus: LuListPlus,
    logout: LuLogOut,
    exit: LuLogOut,
    note: LuNotebookPen,
    sort: LuArrowUpDown,
    user: LuUser,
    fallback: LuLayoutGrid
}
