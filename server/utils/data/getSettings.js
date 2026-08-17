export default async function getSettings({ DL }) {
    const settings = await DL.Setting.read({})
    const settingsTree = settings.reduce((acc, s) => {
        if (!acc[s.category]) acc[s.category] = {}
        acc[s.category][s.key] = s.value
        return acc
    }, {})
    return settingsTree
}