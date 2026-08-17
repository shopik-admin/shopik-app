import React, { useState } from 'react'
import styles from './log.module.css'
import render from '#common/functions/render.js'

export default function Log({ log }) {
    const [copiedType, setCopiedType] = useState(null) // 'request' | 'response' | 'curl' | 'raw'

    if (!log) return null

    const requestData = log.data?.request
    const responseData = log.data?.response

    const triggerCopyNotice = (type) => {
        setCopiedType(type)
        setTimeout(() => setCopiedType(null), 2000)
    }

    const copyToClipboard = (text, type) => {
        const content = typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text)
        navigator.clipboard.writeText(content)
        triggerCopyNotice(type)
    }

    // Generate a ready-to-use cURL command for Postman or Terminal
    const generateCurl = () => {
        // Extract standard REST method from action (default to POST if body exists, else GET)
        const hasBody = requestData?.body && Object.keys(requestData.body).length > 0
        const method = hasBody ? 'POST' : 'GET'
        const origin = window.location.origin
        const url = `${origin}${log.action || ''}`

        let curl = `curl -X ${method} "${url}" \\\n  -H "Content-Type: application/json"`

        if (log.userAgent) {
            curl += ` \\\n  -H "User-Agent: ${log.userAgent}"`
        }

        if (hasBody) {
            curl += ` \\\n  -d '${JSON.stringify(requestData.body, null, 2)}'`
        }

        copyToClipboard(curl, 'curl')
    }

    const getStatusClass = (status) => {
        switch (status) {
            case 'success':
                return styles.statusSuccess
            case 'error':
                return styles.statusError
            case 'pending':
                return styles.statusPending
            default:
                return ''
        }
    }

    return (
        <div className={styles.container}>

            {/* Status & Global Action Bar */}
            <div className={styles.statusBar}>
                <div className={styles.statusGroup}>
                    <span className={styles.label}>Status</span>
                    <span className={`${styles.statusBadge} ${getStatusClass(log.status)}`}>
                        {log.status}
                    </span>
                </div>

                <div className={styles.topActions}>
                    <button
                        className={styles.secondaryBtn}
                        onClick={generateCurl}
                        title="Copy as cURL command for Postman/Terminal"
                    >
                        {copiedType === 'curl' ? '✓ cURL Copied' : '📋 Copy cURL'}
                    </button>

                    <button
                        className={styles.secondaryBtn}
                        onClick={() => copyToClipboard(log, 'raw')}
                    >
                        {copiedType === 'raw' ? '✓ Copied' : 'Copy Full Log'}
                    </button>
                </div>
            </div>

            {/* Metadata Grid */}
            <div className={styles.grid}>
                <div className={styles.card}>
                    <span className={styles.cardLabel}>Action Endpoint</span>
                    <span className={`${styles.cardValue} ${styles.mono}`}>{log.action}</span>
                </div>

                <div className={styles.card}>
                    <span className={styles.cardLabel}>Actor</span>
                    <span className={styles.cardValue}>
                        {log.actor?.name || 'N/A'}{' '}
                        {log.actor?.type && <small className={styles.subText}>({log.actor.type})</small>}
                    </span>
                </div>

                <div className={styles.card}>
                    <span className={styles.cardLabel}>Execution Duration</span>
                    <span className={styles.cardValue}>
                        {log.duration > 0 ? render({ value: log.duration, type: 'ms' }) : 'N/A'}
                    </span>
                </div>

                <div className={styles.card}>
                    <span className={styles.cardLabel}>Request ID</span>
                    <span className={`${styles.cardValue} ${styles.mono}`}>{log.requestId}</span>
                </div>

                <div className={styles.card}>
                    <span className={styles.cardLabel}>IP</span>
                    <span className={styles.cardValue}>
                        {log.ip || 'N/A'}
                    </span>
                </div>
                <div className={styles.card}>
                    <span className={styles.cardLabel}>App Version</span>
                    <span className={styles.cardValue}>
                        v{log.appVersion}
                    </span>
                </div>

                <div className={styles.card}>
                    <span className={styles.cardLabel}>Request Time</span>
                    <span className={styles.cardValue}>
                        {log.requestTime ? new Date(log.requestTime).toLocaleString() : 'N/A'}
                    </span>
                </div>
                {log.userAgent && (
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>User Agent</span>
                        <span className={`${styles.cardValue} ${styles.mono}`}>{log.userAgent}</span>
                    </div>
                )}
            </div>

            {/* User Agent */}


            {/* Data Section: Request & Response */}
            <div className={styles.dataGrid}>

                {/* Request Block */}
                <div className={styles.payloadSection}>
                    <div className={styles.payloadHeader}>
                        <span className={styles.cardLabel}>Request Payload</span>
                        {requestData !== undefined && (
                            <button
                                className={styles.copyTextBtn}
                                onClick={() => copyToClipboard(requestData, 'request')}
                            >
                                {copiedType === 'request' ? '✓ Copied' : 'Copy'}
                            </button>
                        )}
                    </div>
                    <pre className={styles.jsonViewer}>
                        <code>
                            {requestData !== undefined
                                ? JSON.stringify(requestData, null, 2)
                                : 'No request data'}
                        </code>
                    </pre>
                </div>

                {/* Response Block */}
                <div className={styles.payloadSection}>
                    <div className={styles.payloadHeader}>
                        <span className={styles.cardLabel}>Response Payload</span>
                        {responseData !== undefined && (
                            <button
                                className={styles.copyTextBtn}
                                onClick={() => copyToClipboard(responseData, 'response')}
                            >
                                {copiedType === 'response' ? '✓ Copied' : 'Copy'}
                            </button>
                        )}
                    </div>
                    <pre className={styles.jsonViewer}>
                        <code>
                            {responseData !== undefined
                                ? JSON.stringify(responseData, null, 2)
                                : 'No response data'}
                        </code>
                    </pre>
                </div>

            </div>

        </div>
    )
}