import styles from './progressGauge.module.css'

export default function ProgressGauge({ value = 0 }) {
    const normalized = Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0
    const radius = 55
    const circumference = Math.PI * radius // half-circle
    const progress = (normalized / 100) * circumference

    return (
        <div className={styles.progressGauge}>
            <svg
                viewBox="0 0 140 80"
                width="100%"
                height="100%"
                className={styles.gaugeSvg}
                aria-valuenow={normalized}
                role="progressbar"
            >
                {/* Background */}
                <path
                    d="M 15 65 A 55 55 0 0 1 125 65"
                    className={styles.track}
                />

                {/* Progress */}
                <path
                    d="M 15 65 A 55 55 0 0 1 125 65"
                    className={styles.progress}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - progress}
                />
            </svg>

            <div className={styles.value}>
                {normalized}%
            </div>
        </div>
    )
}
