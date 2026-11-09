import classNames from 'common/functions/classNames'
import Icon from 'common/components/Icon'
import { categoryIconUrl, isCategoryIconFile } from 'common/functions/categoryIconUrl'
import styles from './categoryIcon.module.css'

/**
 * Category icon: an uploaded image file (`<img>`) or a legacy Icon-component
 * name. Sizing comes from `className`, exactly like the Icon component, so a
 * stored WebP and a vector glyph take the same box.
 */
export default function CategoryIcon({ icon, className, fallback = true }) {
    if (isCategoryIconFile(icon))
        return <img
            src={categoryIconUrl(icon)}
            alt=''
            className={classNames(styles.image, className)}
            loading='lazy'
            decoding='async'
        />

    return <Icon name={icon} fallback={fallback} className={className} />
}
