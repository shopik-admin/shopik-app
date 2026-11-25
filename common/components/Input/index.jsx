import classNames from 'common/functions/classNames'
import isValidIsraeliId from 'common/functions/isValidIsraeliId'
import { useText } from 'common/texts/TextProvider'
import translate from 'common/texts/TR.js'
import styles from './input.module.css'
import Checkbox from '../Checkbox'
import { useState, useRef, useImperativeHandle } from 'react'
import Text from '../Text'
import Icon from '../Icon'
import Select from '../Select'

/**
 * Input component for rendering text input fields with validation and internationalization support.
 * 
 * @component
 * @example
 * // Example usage
 * <Input 
 *   name="email" 
 *   label="Email" 
 *   required={true} 
 *   info="Please enter a valid email" 
 *   type="email" 
 * />
 * 
 * @param {Object} props - The properties passed to the Input component.
 * @param {string} props.name - The name of the input field (used for form submissions).
 * @param {string} [props.label] - The label to display for the input field. Defaults to the `name` if not provided.
 * @param {string} [props.placeholder] - The placeholder text to display in the input field. Defaults to the `label`.
 * @param {string} [props.type='text'] - The type of the input field (e.g., "text", "email", "password", "textarea").
 * @param {boolean} [props.required=false] - If true, the input field will be marked as required.
 * @param {string} [props.info] - Optional additional info text displayed below the input.
 * @param {string} [props.defaultValue] - The default value of the input field (used for uncontrolled components). 
 * 
 * @returns {JSX.Element} The rendered input component.
 */

function Input(props) {
    const
        { ref, name = '', label = name, title = label, placeholder = title,
            className, type = '', info = '', icon = '',
            required = false, defaultValue, defaults, onChange, onBlur: externalOnBlur, autoFocus, hideErrorMessage, ...ps
        } = props,
        functionType = typeof type == 'function',
        [visited, setVisited] = useState(),
        initialValue = type == 'date' ? toDateInputValue(defaultValue) : defaultValue,
        [value, setValue] = useState(initialValue),
        { TR } = useText(),
        InputTag = getInputTag(props),
        invalidError = functionType ? '' : getInputInvalidError(value, props),
        requiredSign = required && !hideErrorMessage ? ' *' : '',
        innerRef = useRef(null)

    useImperativeHandle(ref, () => innerRef.current)

    function onInputChange(e) {
        const next = e?.target?.type === 'checkbox' ? !!e.target.checked : (e?.target ? e.target.value : e)
        setValue(next); onChange?.(e)
    }
    function onBlur(e) { setTimeout(() => setVisited(true), 100); externalOnBlur?.(e) }

    return <label className={classNames(styles.input, className, [styles.invalid, invalidError], [styles.visited, visited], [styles.withIcon, icon])}>
        {(label && type != 'hidden') && <Text className={styles.label}>{TR(title) || TR(label) || label}{label.trim() && requiredSign}</Text>}
        {functionType ? type(defaults) :
            <>
                <div className={styles.control}>
                    {icon && <Icon name={icon} className={styles.icon} />}
                    <InputTag
                        ref={innerRef}
                        {...ps}
                        {...{ name, type, onBlur, defaultValue: initialValue, autoFocus }}
                        onChange={onInputChange}
                        aria-invalid={!!invalidError}
                        placeholder={(TR(placeholder) || placeholder) + requiredSign}
                    />
                </div>
                {info && !(invalidError && visited) && <Text size='s' mode='sub' className={styles.info}>{info}</Text>}
                {invalidError && !hideErrorMessage && <Text size='s' mode='error' className={styles.error}>{invalidError}</Text>}
            </>}
    </label>
}

export default Input

export { default as isValidIsraeliId } from 'common/functions/isValidIsraeliId'

function CheckboxInput(props) {
    return <Checkbox {...props} label='' />
}

// <input type="date"> only accepts YYYY-MM-DD; API values arrive as ISO strings
// or Date objects. Format in local time so the shown day matches the user's day.
function toDateInputValue(value) {
    if (!value) return ''
    const date = new Date(value)
    if (isNaN(date.getTime())) return ''
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function SwitchInput(props) {
    return <Checkbox {...props} label='' switchMode />
}

function getInputTag({ type }) {
    switch (type) {
        case 'checkbox':
            return CheckboxInput
        case 'switch':
            return SwitchInput
        case 'select':
            return Select
        case 'textarea':
            return 'textarea'
        /* 
               case 'nselect':
                   return Select
               case 'id':
                   return Autocomplete
       
               case 'files':
                   return FilesInput
               case 'file':
               case 'image':
                   return props => <FileInput {...props} accept={type == 'image' ? 'image' : ''} />
       
             
               case 'info':
                   return props => <Text>{props.defaultValue}</Text>
       
               case 'link':
                   return props => <a href={props.defaultValue} target='_blank'><Text mode='link'>{props.defaultValue}</Text></a>
       
               case 'numberstep':
                   return Stepper
               case 'dateRange':
                   return DateRangeSelector
               case 'date':
                   let dv
                   try {
                       if (props.defaultValue)
                           dv = new Date(props.defaultValue).toISOString().slice(0, 10)
                   } catch (error) { debugger } */
        default:
            return 'input'
    }
}

function getInputInvalidError(value, props) {
    // -------------------- Required Field Check --------------------
    if ((typeof value === 'undefined' || value == null) || value.length === 0) {
        if (props.required)
            return translate('field_required')
        else
            return
    }

    // -------------------- Length Constraints --------------------
    if (props.minLength && value.length < props.minLength) {
        return translate('input_min_length', { min: props.minLength })
    }

    if (props.maxLength && value.length > props.maxLength) {
        return translate('input_max_length', { max: props.maxLength })
    }

    // -------------------- Numeric Constraints --------------------
    if (props.min && typeof value === 'number' && value < props.min) {
        return translate('input_min_value', { min: props.min })
    }

    if (props.max && typeof value === 'number' && value > props.max) {
        return translate('input_max_value', { max: props.max })
    }

    // -------------------- Date Validation --------------------
    if (props.type === 'date') {
        const inputDate = new Date(value)

        // Min Date Validation
        if (props.min) {
            const minDate = new Date(props.min)
            if (inputDate < minDate) {
                return translate('input_date_min', { date: props.min })
            }
        }

        // Max Date Validation
        if (props.max) {
            const maxDate = new Date(props.max)
            if (inputDate > maxDate) {
                return translate('input_date_max', { date: props.max })
            }
        }

        // Check if the input is a valid date
        if (isNaN(inputDate.getTime())) {
            return translate('input_invalid_date')
        }
    }

    // -------------------- Type-specific Validations --------------------
    switch (props.type) {
        // -------------------- Phone Validation --------------------
        case 'tel':
            const phoneRegex = /^[0-9]{10}$/  // Basic phone number format (10 digits)
            if (!phoneRegex.test(value)) {
                return translate('input_invalid_phone')
            }
            break

        // -------------------- Email Validation --------------------
        case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/  // Simple email format validation
            if (!emailRegex.test(value)) {
                return translate('input_invalid_email')
            }
            break

        // -------------------- Number Validation --------------------
        case 'number':
            if (isNaN(value)) {
                return translate('input_must_be_number')
            }
            break

        // -------------------- Credit Card Validation --------------------
        case 'credit-card':
            if (!isValidCreditCard(value)) {
                return translate('input_invalid_credit_card')
            }
            break

        // -------------------- Password Validation --------------------
        case 'password':
            if (!isStrongPassword(value)) {
                return translate('input_weak_password')
            }
            break

        // -------------------- Custom Regex Validation --------------------
        case 'custom':
            if (props.pattern && !new RegExp(props.pattern).test(value)) {
                return translate('input_invalid_format')
            }
            break

        // -------------------- Alphanumeric Validation --------------------
        case 'alphanumeric':
            if (!/^[a-z0-9]+$/i.test(value)) {
                return translate('input_must_be_alphanumeric')
            }
            break

        // -------------------- File Validation --------------------
        case 'file':
            if (props.accept) {
                const fileType = value.type  // Assuming `value` is a file object
                if (!props.accept.includes(fileType)) {
                    return translate('input_invalid_file_type', { types: props.accept.join(', ') })
                }
            }
            break

        // -------------------- IP Address Validation --------------------
        case 'ip':
            if (!isValidIP(value)) {
                return translate('input_invalid_ip')
            }
            break

        // -------------------- Date of Birth Validation --------------------
        case 'dob':
            if (props.minAge && calculateAge(value) < props.minAge) {
                return translate('input_min_age', { age: props.minAge })
            }
            break

        // -------------------- Tag Validation --------------------
        case 'tag':
            const tagRegex = /^[A-Za-z]{2}$/  // Basic tag validation format (2 chars)
            if (!tagRegex.test(value)) {
                return translate('input_invalid_tag')
            }
            break

        // -------------------- Israeli ID Number Validation --------------------
        case 'idNum':
            if (!isValidIsraeliId(value)) {
                return 'Invalid Israeli ID number'
            }
            break

        default:
            break
    }
}

// -------------------- Helper Functions --------------------

// Credit Card Validation (Luhn algorithm)
function isValidCreditCard(value) {
    const sanitizedValue = value.replace(/\D/g, '')
    let sum = 0
    let shouldDouble = false

    for (let i = sanitizedValue.length - 1; i >= 0; i--) {
        let digit = parseInt(sanitizedValue.charAt(i), 10)
        if (shouldDouble) {
            digit *= 2
            if (digit > 9) digit -= 9
        }
        sum += digit
        shouldDouble = !shouldDouble
    }

    return sum % 10 === 0
}

// Strong Password Validation (Minimum length, uppercase, lowercase, digit, special character)
function isStrongPassword(value) {
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    return strongPasswordRegex.test(value)
}

// IP Address Validation (IPv4 and IPv6)
function isValidIP(value) {
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
    return ipv4Regex.test(value) || ipv6Regex.test(value)
}

// Calculate Age from Date of Birth
function calculateAge(dob) {
    const today = new Date()
    const birthDate = new Date(dob)
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--
    }
    return age
}
