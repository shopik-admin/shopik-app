export default async function publicKey(payload, { external }) {
    return {
        enabled: Boolean(external?.push?.enabled),
        publicKey: external?.push?.publicKey || ''
    }
}

publicKey.config = {
    auth: 'none'
}
