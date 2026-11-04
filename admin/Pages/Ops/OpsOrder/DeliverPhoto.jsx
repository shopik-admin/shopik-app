import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useUser } from 'features/User'
import usePermission from 'common/permissions/usePermision'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import Input from 'common/components/Input'
import Loader from 'common/components/Loader'
import { useModal } from 'common/components/Modal'
import apiReq from 'common/functions/apiReq'
import getPosition from 'common/functions/getPosition'
import TR from 'common/texts/TR.js'
import styles from './deliverPhoto.module.css'
import opsStyles from './opsOrder.module.css'

// The server answers with fixed phrases. The ones this screen can receive are mapped to
// text keys so the message reads in the admin's language; anything unmapped shows as the
// server wrote it.
const SERVER_ERRORS = {
    'not your shipment': 'ops_not_your_shipment',
    'order not in shipped': 'ops_order_not_shipped',
    'proximity override not allowed': 'ops_override_not_allowed',
    'image too large': 'ops_image_too_large',
}

// "too far: 48911m > 300m (manager override required)" is the only message carrying
// numbers, so it is read apart from the fixed phrases — the phrase continues past the
// numbers, so the match is not anchored at the end.
function errorText(message) {
    const key = SERVER_ERRORS[message]
    if (key) return TR(key)
    const far = /^too far: (\d+)m > (\d+)m/.exec(message)
    if (far) return TR('ops_too_far', { distance: far[1], radius: far[2] })
    return TR(message)
}

// The notice is copy, so it lives in hebrew.json and the screen renders its keys.
const PRIVACY = {
    title: 'ops_privacy_notice',
    lines: ['ops_privacy_only_order', 'ops_privacy_no_people', 'ops_privacy_no_interior']
}

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
    // A regular shipper has to photograph the delivery; skipping the proof is the same
    // manager permission that lets him deliver from a distance.
    const canSkipPhoto = canOverride || isSuperAdmin
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
            // Replace the camera screen so back from the queue returns to the
            // order details, not to a screen that is already done. The view is not
            // part of this: the queue page remembers which view was chosen.
            navigate('/ops', { replace: true })
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
        <Flex col gap={6} className={styles.privacy}>
            <Flex gap={8} alignItems='center'>
                <Icon name='shield' />
                <Text bold size='l'>{PRIVACY.title}</Text>
            </Flex>
            {PRIVACY.lines.map(key => <Flex key={key} gap={8} alignItems='center'>
                <Text size='m'>•</Text>
                <Text size='m'>{key}</Text>
            </Flex>)}
        </Flex>
        {sendError && <Flex center className={styles.sendError}><Text size='l' mode='error' center>{errorText(sendError)}</Text></Flex>}
        <Flex center gap={10} col className={opsStyles.footer}>
            {(canSkipPhoto || (tooFar && canOverride)) && <Flex center gap={16} style={{ marginBottom: 12 }}>
                {canSkipPhoto && <Button mode='text-brand' disabled={sending} onClick={() => sendDelivery({ imageBase64: null })}>ops_skip_photo</Button>}
                {tooFar && canOverride && <Button mode='text-brand' disabled={sending} onClick={openOverrideDialog}>ops_deliver_override</Button>}
            </Flex>}
            <Button loading={sending} onClick={handleCapture} className={opsStyles.transferBtn}>ops_capture_close</Button>
            <Button mode='text-brand' onClick={goPreview}>back</Button>
        </Flex>
    </Flex>
}
