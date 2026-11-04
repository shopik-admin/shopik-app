import events from 'common/features/events'

// Mobile has no user popover — the drawer owns the login panel. Desktop opens
// the header login popover (Popover listens to '<id>-popover', id='login').
export default function openLoginPrompt() {
    if (typeof window === 'undefined') return
    const mobile = window.matchMedia?.('(max-width: 768px)')?.matches
    events.emit(mobile ? 'mobile-login' : 'login-popover')
}
