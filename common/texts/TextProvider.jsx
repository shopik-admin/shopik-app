import { createContext, useContext } from 'react'
import hebrewTexts from './hebrew.json'

const TextContext = createContext()
export const useText = () => useContext(TextContext)


export default function TextProvider({ children }) {
    const texts = hebrewTexts.texts || {}

    function TR(key) {
        return texts[key] || texts[key?.toLowerCase()] || key
    }

    return <TextContext.Provider value={{ TR, ...hebrewTexts }}>
        {children}
    </TextContext.Provider>
}