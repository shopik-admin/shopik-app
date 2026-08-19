import classNames from 'common/functions/classNames'
import styles from './icon.module.css'
import { AiOutlineProduct } from 'react-icons/ai'
import { BiExpandVertical, BiCollapseVertical, BiCart } from 'react-icons/bi'
import { BsFileEarmarkExcel, BsPersonVcard, BsReceiptCutoff, BsCart3 } from 'react-icons/bs'
import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa'
import { GoPencil, GoDownload } from 'react-icons/go'
import { HiOutlineBuildingOffice, HiOutlineBuildingOffice2 } from 'react-icons/hi2'
import { ImCopy } from 'react-icons/im'
import {
    IoAddSharp, IoSettingsOutline, IoMenu, IoPersonOutline, IoDesktopOutline,
    IoEllipsisHorizontalSharp, IoNotificationsOutline, IoExitOutline, IoGridOutline,
    IoEaselOutline, IoDocumentTextOutline, IoSearchOutline, IoKeyOutline, IoCalendarOutline,
    IoRefreshSharp, IoChevronForwardOutline, IoTrashOutline, IoCloseOutline, IoCheckmarkOutline,
    IoShareOutline, IoChevronDown, IoLogoGithub, IoPlay, IoPause, IoChevronBack,
    IoCheckmarkCircleOutline, IoEllipseOutline, IoStorefrontOutline, IoMapOutline, IoTimeOutline,
    IoCardOutline
} from 'react-icons/io5'
import { LuClipboard, LuClipboardList, LuLoader, LuCalendarPlus } from 'react-icons/lu'
import { MdChecklistRtl, MdOutlineEventRepeat, MdDomain, MdCloudSync } from 'react-icons/md'
import { PiSealQuestion, PiUsers, PiCodeLight } from 'react-icons/pi'
import { RiCustomerService2Fill, RiRefund2Fill, RiDiscountPercentLine, RiCoupon3Line } from 'react-icons/ri'
import { TbReplace, TbDeviceMobileCheck, TbDeviceMobileUp } from 'react-icons/tb'
import { VscReferences } from 'react-icons/vsc'
import { LuPanelRightClose, LuPanelRightOpen } from "react-icons/lu"
import { MdOutlineLightMode, MdLightMode } from "react-icons/md"
import { AiOutlineUser } from "react-icons/ai"
import { HiOutlineShoppingBag } from "react-icons/hi2"
import { BsTruck } from "react-icons/bs"
import { LiaBarcodeSolid } from "react-icons/lia"

const iconsList = {
    add: IoAddSharp,
    edit: GoPencil,
    trash: IoTrashOutline,
    left: IoChevronBack,
    right: IoChevronForwardOutline,
    download: GoDownload,
    settings: IoSettingsOutline,
    menu: IoMenu,
    search: IoSearchOutline,
    options: IoEllipsisHorizontalSharp,
    person: IoPersonOutline,
    persons: BsPersonVcard,
    desktop: IoDesktopOutline,
    notifications: IoNotificationsOutline,
    exit: IoExitOutline,
    logout: IoExitOutline,
    fallback: IoGridOutline,
    dashboard: IoEaselOutline,
    buildings: HiOutlineBuildingOffice2,
    building: HiOutlineBuildingOffice,
    replace: TbReplace,
    placement: MdChecklistRtl,
    tasks: RiCustomerService2Fill,
    question: PiSealQuestion,
    clipboard: LuClipboard,
    clipboardList: LuClipboardList,
    reports: IoDocumentTextOutline,
    users: PiUsers,
    table: VscReferences,
    key: IoKeyOutline,
    calendar: IoCalendarOutline,
    csv: BsFileEarmarkExcel,
    refresh: IoRefreshSharp,
    x: IoCloseOutline,
    v: IoCheckmarkOutline,
    payRepeat: MdOutlineEventRepeat,
    back: IoChevronForwardOutline,
    asign: TbDeviceMobileCheck,
    release: TbDeviceMobileUp,
    refund: RiRefund2Fill,
    receipt: BsReceiptCutoff,
    expand: BiExpandVertical,
    collapse: BiCollapseVertical,
    load: LuLoader,
    copy: ImCopy,
    share: IoShareOutline,
    down: IoChevronDown,
    calendarAdd: LuCalendarPlus,
    check: IoCheckmarkCircleOutline,
    checkEmpty: IoEllipseOutline,
    github: IoLogoGithub,
    play: IoPlay,
    pause: IoPause,
    cart: BiCart,
    sort: FaSort,
    sortUp: FaSortUp,
    sortDown: FaSortDown,
    log: PiCodeLight,
    products: AiOutlineProduct,
    orders: BsCart3,
    stores: IoStorefrontOutline,
    domains: MdDomain,
    sale: RiDiscountPercentLine,
    coupon: RiCoupon3Line,
    toMini: LuPanelRightClose,
    unMini: LuPanelRightOpen,
    darkMode: MdOutlineLightMode,
    lightMode: MdLightMode,
    sync: MdCloudSync,
    user: AiOutlineUser,
    map: IoMapOutline,
    time: IoTimeOutline,
    bag: HiOutlineShoppingBag,
    truck: BsTruck,
    card: IoCardOutline,
    barcode: LiaBarcodeSolid
}

/**
 * All supported icon names extracted directly from the keys of iconsList.
 * 
 * @typedef {keyof typeof iconsList} IconNames
 */

/**
 * Icon component.
 *
 * Renders an SVG icon from `react-icons` based on the provided name.
 * Additional props are forwarded to the underlying SVG element.
 *
 * @param {Object} props
 * @param {IconNames} props.name - Icon identifier
 * @param {string} [props.className] - Additional CSS class names
 * @param {boolean} [props.fallback=false] - Use fallback icon if name is invalid
 * @param {...import('react').SVGProps<SVGSVGElement>} [props] - SVG props
 * @returns {JSX.Element|null}
 */
export default function Icon({ className, name, fallback = false, ...props }) {
    let I = iconsList[name]
    if (!I && fallback) I = iconsList.fallback

    return I ? <I
        aria-label={`icon ${name}`}
        className={classNames(styles.icon, className)}
        {...props}
    /> : null
}