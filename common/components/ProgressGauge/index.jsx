import styles from './progressGauge.module.css'

export default function ProgressGauge({ value = 40 }) {
    const radius = 55
    const circumference = Math.PI * radius // half-circle
    const progress = (value / 100) * circumference

    return (
        <div style={{ width: 75, position: "relative" }}>
            <svg
                viewBox="0 0 140 80"
                width="100%"
                height="100%"
            >
                {/* Background */}
                <path
                    d="M 15 65 A 55 55 0 0 1 125 65"
                    fill="none"
                    stroke="#dfe4e3"
                    strokeWidth="12"
                    strokeLinecap="round"
                />

                {/* Progress */}
                <path
                    d="M 15 65 A 55 55 0 0 1 125 65"
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - progress}
                />
            </svg>

            <div
                style={{
                    position: 'absolute',
                    inset: ' 24px 0px 5px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: '600',
                }}
            >
                {value}%
            </div>
        </div>
    )
}
