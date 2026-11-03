import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useUser } from 'features/User'
import usePermission from 'common/permissions/usePermision'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import Input from 'common/components/Input'
import Loader from 'common/components/Loader'
import { useModal } from 'common/components/Modal'
import apiReq from 'common/functions/apiReq'
import getPosition from 'common/functions/getPosition'
import styles from './deliverPhoto.module.css'
import opsStyles from './opsOrder.module.css'

function captureFrame(video, maxSide = 1600) {
    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh) return null
    const scale = Math.min(1, maxSide / Math.max(vw, vh))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vw * scale)
    canvas.height = Math.round(vh * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/jpeg', 0.85)
    return url.split(',')[1] || null
}

export default function DeliverPhoto({ order = {}, goPreview }) {
    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const lastPayloadRef = useRef({})
    const coordsRef = useRef(null)
    const reasonRef = useRef('')
    const { isSuperAdmin } = useUser() || {}
    const canOverride = usePermission('order:ship:manage')
    const { openModal, closeModal } = useModal()
    const navigate = useNavigate()
    const [starting, setStarting] = useState(true)
    const [cameraFailed, setCameraFailed] = useState(false)
    const [sending, setSending] = useState(false)
    const [sendError, setSendError] = useState('')
    const [tooFar, setTooFar] = useState(false)

    useEffect(() => {
        let cancelled = false
        async function start() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
                    audio: false
                })
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
                streamRef.current = stream
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    await videoRef.current.play()
                }
                if (!cancelled) setStarting(false)
            } catch {
                if (!cancelled) { setStarting(false); setCameraFailed(true) }
            }
        }
        start()
        return () => {
            cancelled = true
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
        }
    }, [])

    async function sendDelivery({ imageBase64, override, overrideReason } = {}) {
        if (sending) return
        if (imageBase64 !== undefined) lastPayloadRef.current.imageBase64 = imageBase64
        setSending(true)
        setSendError('')
        setTooFar(false)
        try {
            const coordinates = coordsRef.current || await getPosition()
            if (coordinates) coordsRef.current = coordinates
            const payload = { orderId: order.id }
            if (lastPayloadRef.current.imageBase64) payload.imageBase64 = lastPayloadRef.current.imageBase64
            if (coordinates) payload.coordinates = coordinates
            if (override) {
                payload.override = true
                if (overrideReason?.trim()) payload.overrideReason = overrideReason.trim()
            }
            const res = await apiReq('shipment/deliver', payload)
            if (res?.error) throw new Error(res.error)
            navigate('/ops?asShipper=1')
        } catch (e) {
            const msg = e.message || 'shipment/deliver failed'
            setSendError(msg)
            if (/too far/i.test(msg)) setTooFar(true)
        } finally {
            setSending(false)
        }
    }

    async function handleCapture() {
        const imageBase64 = videoRef.current ? captureFrame(videoRef.current) : null
        if (!imageBase64) {
            setSendError('ops_camera_error')
            return
        }
        await sendDelivery({ imageBase64 })
    }

    // Managers may close an order from a distance, but only through this
    // explicit confirmation — the reason is stored on the delivery audit trail.
    function openOverrideDialog() {
        reasonRef.current = ''
        openModal(
            <Flex col gap={18}>
                <Text center>{'ops_override_confirm'}</Text>
                <Input
                    name='overrideReason'
                    label='ops_override_reason'
                    type='textarea'
                    onChange={e => { reasonRef.current = e?.target?.value ?? '' }}
                />
                <Flex center gap={12}>
                    <Button
                        loading={sending}
                        onClick={() => { closeModal(); sendDelivery({ override: true, overrideReason: reasonRef.current }) }}
                    >ops_override_action</Button>
                    <Button mode='outline' disabled={sending} onClick={closeModal}>cancel</Button>
                </Flex>
            </Flex>,
            { title: 'ops_override_title' }
        )
    }

    return <Flex grow col className={styles.deliverPhoto}>
        <Flex alignItems='center' justifyContent='center' style={{ padding: 16 }}>
            <Text size='l' bold>ops_photograph_order</Text>
        </Flex>
        <Flex col className={styles.cameraWrap}>
            <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
            <div className={styles.overlay}>
                <span className={styles.corner + ' ' + styles.tl} />
                <span className={styles.corner + ' ' + styles.tr} />
                <span className={styles.corner + ' ' + styles.bl} />
                <span className={styles.corner + ' ' + styles.br} />
            </div>
            {starting && !cameraFailed && <Flex center className={styles.startingWrap}><Loader /></Flex>}
            {cameraFailed && <Flex center className={styles.errorOverlay}><Text size='s' mode='error'>ops_camera_error</Text></Flex>}
        </Flex>
        {sendError && <Flex center style={{ padding: '0 16px' }}><Text size='s' mode='error' center>{sendError}</Text></Flex>}
        <Flex center gap={10} col className={opsStyles.footer}>
            {(isSuperAdmin || (tooFar && canOverride)) && <Flex center gap={16} style={{ marginBottom: 12 }}>
                {isSuperAdmin && <Button mode='text-brand' disabled={sending} onClick={() => sendDelivery({ imageBase64: null })}>ops_skip_photo</Button>}
                {tooFar && canOverride && <Button mode='text-brand' disabled={sending} onClick={openOverrideDialog}>ops_deliver_override</Button>}
            </Flex>}
            <Button loading={sending} onClick={handleCapture} className={opsStyles.transferBtn}>ops_capture_close</Button>
            <Button mode='text-brand' onClick={goPreview}>back</Button>
        </Flex>
    </Flex>
}
