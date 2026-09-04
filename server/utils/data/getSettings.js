export default async function getSettings({ DL }) {
    const settings = await DL.Setting.read(
        { active: true, public: true },
        { _id: 0 },
        { limit: 0 }
    )
    const settingsTree = settings.reduce((acc, s) => {
        if (!acc[s.category]) acc[s.category] = {}
        acc[s.category][s.key] = s.value
        return acc
    }, {})
    return settingsTree
}