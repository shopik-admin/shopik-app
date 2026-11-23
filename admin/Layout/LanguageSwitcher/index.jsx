import Button from 'common/components/Button'
import ContextMenu from 'common/components/ContextMenu'
import { useText } from 'common/texts/TextProvider'
import styles from './languageSwitcher.module.css'

function labelOf(language) {
    return language?.nativeName || language?.name || language?.code || ''
}

export default function LanguageSwitcher({ className = '', placement = 'header' }) {
    const { languages = [], language = 'he', setLanguage, switching } = useText() || {}
    if (!languages?.length) return null

    const active = languages.find(item => item.code === language)
    const button = <Button
        mode='text'
        icon='language'
        className={styles.iconButton}
        tooltip={labelOf(active)}
    />

    // One language has nothing to switch to, but keeping the icon visible
    // makes the feature discoverable and preserves the header layout.
    if (languages.length === 1) {
        return <span className={`${styles.switcher} ${styles[placement] || ''} ${className}`.trim()}>
            <Button
                mode='text'
                icon='language'
                className={styles.iconButton}
                tooltip={labelOf(active)}
                disabled
            />
        </span>
    }

    const options = languages.map(item => ({
        text: labelOf(item),
        icon: item.code === language ? 'check' : undefined,
        mode: item.code === language ? 'brand' : undefined,
        disabled: switching,
        onClick: () => setLanguage?.(item.code)
    }))

    return <span className={`${styles.switcher} ${styles[placement] || ''} ${className}`.trim()}>
        <ContextMenu
            button={button}
            options={options}
            iconOnStart
            disabled={switching}
        />
    </span>
}
