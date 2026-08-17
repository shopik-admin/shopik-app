declare global {
    interface BootData {
        DL: import('./dl.js').DL
        api: any
        utils: any
        helpers: any
    }
}

export { }