import classNames from 'common/functions/classNames'
import styles from './icon.module.css'
import { coreIcons } from './coreIcons.js'

let extraIcons = {}

export function registerIcons(icons) {
    extraIcons = { ...extraIcons, ...icons }
}

const allIcons = () => ({ ...coreIcons, ...extraIcons })

export default function Icon({ className, name, fallback = false, ...props }) {
    const iconsList = allIcons()
    let I = iconsList[name]
    if (!I && fallback) I = iconsList.fallback

    return I ? <I
        aria-label={`icon ${name}`}
        className={classNames(styles.icon, className)}
        {...props}
    /> : null
}
