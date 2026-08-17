import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import ReactDOM from 'react-dom'
import './modal.css'
const ModalContext = createContext(null)

export const ModalProvider = ({ children }) => {
    const [modalData, setModalData] = useState(null)

    const openModal = (content, options = {}) => {
        setModalData({
            content,
            options,
            key: Date.now(),
        })
    }

    const closeModal = () => {
        setModalData(null)
    }

    return (
        <ModalContext.Provider value={{ openModal, closeModal }}>
            {children}

            {modalData && (
                <PortalModal
                    key={modalData.key}
                    options={modalData.options}
                    onClosed={closeModal}
                >
                    {modalData.content}
                </PortalModal>
            )}
        </ModalContext.Provider>
    )
}

export const useModal = () => {
    const context = useContext(ModalContext)

    if (!context) {
        throw new Error('useModal must be used inside ModalProvider')
    }

    return context
}

function PortalModal({
    children,
    options = {},
    onClosed,
}) {
    const modalRoot =
        document.getElementById('modal-root') || document.body

    const [isOpen, setIsOpen] = useState(false)
    const closingRef = useRef(false)

    // Trigger enter animation
    useEffect(() => {
        const id = requestAnimationFrame(() => {
            setIsOpen(true)
        })

        return () => cancelAnimationFrame(id)
    }, [])

    // Escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [])

    const handleClose = () => {
        if (closingRef.current) return

        closingRef.current = true
        setIsOpen(false)
    }

    const handleOverlayTransitionEnd = (e) => {
        // Ignore bubbling transition events from the modal
        if (e.target !== e.currentTarget) return

        if (!isOpen) {
            onClosed()
        }
    }

    return ReactDOM.createPortal(
        <div
            className={`overlay ${isOpen ? 'open' : ''}`}
            onClick={handleClose}
            onTransitionEnd={handleOverlayTransitionEnd}
        >
            <div
                className={`modal ${isOpen ? 'open' : ''} ${options.className || ''
                    }`}
                onClick={(e) => e.stopPropagation()}
            >
                {options.title && (
                    <div className="modal-header">
                        <h3>{options.title}</h3>
                    </div>
                )}

                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>,
        modalRoot
    )
}