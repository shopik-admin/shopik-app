const
    listeners = {},
    events = {
        on(event, callback) {
            if (!listeners[event]) {
                listeners[event] = []
            }
            if (!listeners[event].includes(callback)) {
                listeners[event].push(callback)
            }
        },

        off(event, callback) {
            if (!listeners[event]) return
            listeners[event] = listeners[event].filter(cb => cb !== callback)
        },

        emit(event, data) {
            if (!listeners[event]) return
            listeners[event].forEach(callback => callback(data))
        }
    }

export default events