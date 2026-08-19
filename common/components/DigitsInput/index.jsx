import { useEffect, useRef, useState } from 'react'
import Input from 'common/components/Input'
import Flex from 'common/components/Flex'
import styles from './style.module.css'

let sent = ''
export default function DigitsInput({
    digitsNum = 6,
    name,
    onCodeComplete,
}) {
    const inputsRef = useRef([])
    const [value, setValue] = useState(Array(digitsNum).fill(''))

    useEffect(() => {
        const code = value.join('')
        if (code.length === digitsNum && typeof onCodeComplete === 'function' && sent != code) {
            sent = code
            onCodeComplete(code)
        }
    }, [value, digitsNum, onCodeComplete])

    function onChange(inputValue, i) {
        const lastChar = inputValue.replace(/\D/g, '').slice(-1)
        const newValue = [...value]

        newValue[i] = lastChar
        setValue(newValue)

        if (lastChar && i < digitsNum - 1)
            goToInput(i + 1)
    }

    function onKeyDown(e, i) {
        if (e.key === 'Backspace') {
            e.preventDefault()

            const newValue = [...value]

            if (newValue[i]) {
                // Clear current digit
                newValue[i] = ''
                setValue(newValue)
            } else if (i > 0) {
                // Move back and clear previous digit
                newValue[i - 1] = ''
                setValue(newValue)
                goToInput(i - 1)
            }
        }

        if (e.key === 'ArrowLeft')
            goToInput(i - 1)

        if (e.key === 'ArrowRight')
            goToInput(i + 1)
    }

    function goToInput(i) {
        if (i >= 0 && i < digitsNum)
            inputsRef.current[i]?.focus()
    }

    function processCode(text) {
        const digits = (text || '')
            .replace(/\D/g, '')
            .slice(0, digitsNum)

        if (!digits)
            return

        const newValue = Array(digitsNum).fill('')

        digits.split('').forEach((digit, index) => {
            newValue[index] = digit
        })

        setValue(newValue)

        const nextIndex = Math.min(digits.length, digitsNum - 1)
        goToInput(nextIndex)
    }

    function onPaste(e) {
        e.preventDefault()
        const pasted = e.clipboardData?.getData('text')
        processCode(pasted)
    }

    function onDrop(e) {
        e.preventDefault()
        const text = e.dataTransfer?.getData('text') || e.dataTransfer?.getData('text/plain')
        processCode(text)
    }

    function onDragOver(e) {
        e.preventDefault()
    }

    return (
        <Flex
            className={styles.digitsInput}
            gap={12}
            onDrop={onDrop}
            onDragOver={onDragOver}
        >
            {repeat(digitsNum, i => (
                <Input
                    key={`di${i}`}
                    autoFocus={!i}
                    placeholder='-'//'⬤' 
                    inputMode='numeric'
                    autoComplete='one-time-code'
                    value={value[i]}
                    ref={el => (inputsRef.current[i] = el)}
                    onPaste={onPaste}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onKeyDown={e => onKeyDown(e, i)}
                    onChange={e => onChange(e.target.value, i)}
                />
            ))}
            <input type='hidden' name={name} value={value.join('')} />
        </Flex>
    )
}

function repeat(num, fn) {
    const res = []
    for (let i = 0; i < num; i++)
        res.push(fn(i))
    return res
}