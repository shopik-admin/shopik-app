import Button from 'common/components/Button'
import { useState, useEffect } from 'react'

const ThemeToggle = () => {
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') || 'light'
        }
        return 'light'
    })

    useEffect(() => {
        const root = document.documentElement
        root.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'))
    }

    return <Button
        onClick={toggleTheme}
        icon={theme == 'light' ? 'darkMode' : 'lightMode'}
        mode='text'
    />
}

export default ThemeToggle