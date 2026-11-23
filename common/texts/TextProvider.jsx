import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import TR, { applyTextDirection, configureTexts, getTextConfig } from './TR.js'

const TextContext = createContext({})
export const useText = () => useContext(TextContext)

/**
 * Provides the active translation dictionary and, in the admin, the language
 * switcher state.
 *
 * `translations` is the SSR payload: { code, direction, texts, fallback }.
 * `onLanguageChange(code, translations)` persists the choice (user record or
 * a pre-login cookie) after the UI has already switched direction and text.
 */
export default function TextProvider({
    children,
    translations,
    languages: initialLanguages = [],
    allowSwitch = false,
    onLanguageChange
}) {
    const [state, setState] = useState(() => translations || getTextConfig())
    const [languages, setLanguages] = useState(initialLanguages || [])
    const [switching, setSwitching] = useState(false)
    const [languageError, setLanguageError] = useState(null)

    useEffect(() => {
        if (!translations) return
        configureTexts(translations)
        applyTextDirection(translations)
        setState(translations)
    }, [translations])

    useEffect(() => {
        configureTexts(state)
        applyTextDirection(state)
    }, [state])

    async function refreshLanguages() {
        try {
            const list = await apiReq('translation/languages')
            if (Array.isArray(list)) setLanguages(list)
            return list
        } catch (error) {
            setLanguageError(error?.message || 'Failed to load languages')
            return null
        }
    }

    async function loadLanguage(code, { persist = true } = {}) {
        if (!code) return null
        setSwitching(true)
        setLanguageError(null)
        try {
            const next = await apiReq('translation/dictionary', { code })
            configureTexts(next)
            applyTextDirection(next)
            setState(next)
            if (persist && onLanguageChange) await onLanguageChange(next.code, next)
            return next
        } catch (error) {
            setLanguageError(error?.message || 'Failed to switch language')
            return null
        } finally {
            setSwitching(false)
        }
    }

    async function setLanguage(code) {
        if (!allowSwitch || !code || code === state.code) return state
        return loadLanguage(code)
    }

    // Re-fetch the active dictionary after editing its metadata (direction,
    // native name) without persisting the same preference again.
    async function reloadLanguage() {
        return loadLanguage(state.code, { persist: false })
    }

    const value = useMemo(() => ({
        TR,
        language: state.code,
        direction: state.direction,
        languages,
        setLanguage,
        reloadLanguage,
        refreshLanguages,
        switching,
        languageError
    }), [state, languages, switching, languageError, allowSwitch, onLanguageChange])

    return <TextContext value={value}>
        {children}
    </TextContext>
}
