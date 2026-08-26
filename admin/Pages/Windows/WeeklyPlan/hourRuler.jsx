import { WINDOWS_PAGE } from 'common/constants.js'
import styles from './weekly.module.css'

const { HOUR_PX } = WINDOWS_PAGE

export default function HourRuler({ scrollTop, height }) {
    const labels = []
    for (let h = 0; h <= 23; h++) {
        const y = h * HOUR_PX - scrollTop
        if (y >= -10 && y <= height) labels.push(h)
    }

    return <div className={styles.rulerStrip}>
        {labels.map(h => (
            <span key={h} className={styles.rulerLabel} style={{ top: h * HOUR_PX - scrollTop }}>
                {String(h).padStart(2, '0')}:00
            </span>
        ))}
    </div>
}
