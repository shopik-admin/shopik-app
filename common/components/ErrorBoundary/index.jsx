import { Component, useState } from 'react'
import styles from './errorBoundary.module.css'

const isDev = (() => {
    try {
        return !!import.meta.env?.DEV
    } catch {
        return false
    }
})()

export default class ErrorBoundary extends Component {
    state = { error: null }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, info) {
        console.error(error, info?.componentStack)
        this.props.onError?.(error, info)
    }

    refresh = () => window.location.reload()

    render() {
        const { error } = this.state
        if (!error) return this.props.children

        if (this.props.fallback) return this.props.fallback(error, this.refresh)

        return <div className={styles.boundary} role='alert'>
            <div className={styles.box}>
                <div className={styles.title}>משהו השתבש</div>
                <div className={styles.message}>{error.message || String(error)}</div>
                {isDev && error.stack && <code className={styles.details}>
                    <summary className={styles.stackHead}>
                        <span>stack</span>
                        <CopyButton text={error.stack} />
                    </summary>
                    <pre className={styles.stack} dir='ltr'>{error.stack}</pre>
                </code>}
                <button type='button' className={styles.refresh} onClick={this.refresh}>טעינה מחדש</button>
            </div>
        </div>
    }
}

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false)

    // Clicking inside <summary> would toggle the <details> — prevent that
    async function onCopy(e) {
        e.preventDefault()
        e.stopPropagation()
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text)
            } else {
                const ta = document.createElement('textarea')
                ta.value = text
                document.body.appendChild(ta)
                ta.select()
                document.execCommand('copy')
                ta.remove()
            }
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            setCopied(false)
        }
    }

    return <button type='button' className={styles.copy} onClick={onCopy}>{copied ? 'הועתק' : 'העתק'}</button>
}
