import classNames from 'common/functions/classNames'
import Button from 'common/components/Button'
import events from 'common/features/events'
import styles from './popover.module.css'
import { useEffect, useRef } from 'react'

export default function Popover({ id, className, button, children, btnClassName, disabled, leftOffset = 0, topOffset = 0, icon, ...props }) {
    const ref = useRef()
    const btnRef = useRef()

    useEffect(() => {
        if (id) {
            function handleOpen(data) {
                open()
            }

            events.on(`${id}-popover`, handleOpen)

            return () => events.off(`${id}-popover`, handleOpen)
        }
    }, [id])

    function open(e) {
        if (disabled) return
        e?.stopPropagation()
        e?.preventDefault()
        ref.current.showModal()
        const
            btnRect = btnRef.current.getBoundingClientRect(),
            popoverRect = ref.current.getBoundingClientRect(),
            popoverHight = (popoverRect.height / .5),
            popoverWidth = (popoverRect.width / .5),
            gap = 5

        let
            top = btnRect.top + btnRect.height + gap,
            left = btnRect.left - popoverWidth + btnRect.width

        const
            overflowTop = top + popoverHight > window.innerHeight - gap,
            overflowleft = props.left || left - popoverWidth < 0

        if (overflowTop)
            top = btnRect.top - popoverHight - gap
        if (overflowleft)
            left = btnRect.left

        top += topOffset
        left += leftOffset

        left = Math.min(window.innerWidth - popoverWidth - gap, left)
        top = Math.min(window.innerHeight - popoverHight - gap, top)
        left = Math.max(gap, left)
        top = Math.max(gap, top)

        ref.current.style.transformOrigin =
            `${overflowTop ? 'bottom' : 'top'} ${overflowleft ? 'left' : 'right'}`
        ref.current.style.top = `${top}px`
        ref.current.style.left = `${left}px`
        ref.current.classList.add(styles.visible)
    }

    function close() {
        const dialog = ref.current
        dialog.classList.remove(styles.visible)
        dialog.addEventListener('transitionend', dialog.close, { once: true })
    }

    function closeBD(e) {
        const dialog = ref.current
        if (e.target !== dialog) return
        if (e.detail === 0 || (e.clientX === 0 && e.clientY === 0)) return

        const rect = dialog.getBoundingClientRect()
        const isInDialog = (
            rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        )
        if (!isInDialog && dialog.open) {
            e.stopPropagation()
            e.preventDefault()
            close()
        }
    }

    return <>
        <dialog
            ref={ref}
            onClick={closeBD}
            className={classNames(className, styles.popover)}>
            {typeof children == 'function' ? children({ close }) : children}
        </dialog>
        <div onClick={open} ref={btnRef} className={classNames(btnClassName, styles.btn)}>
            {button || <Button
                mode='text'
                disabled={disabled}
                icon={icon || 'options'}
            />}
        </div>
    </>
}