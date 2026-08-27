import { useEffect, useState } from 'react'
import Autocomplete from '../Autocomplete'
import Input from '../Input'
import apiReq from 'common/functions/apiReq'
import styles from './addressAutocomplete.module.css'

/**
 * Generic cascaded address autocomplete:
 * city -> street (filtered by city) -> building (plain Input)
 * Autocomplete uses Input type="text" internally, so no recursion via getInputTag.
 * Server handles provider chain govmap -> osm -> google via ADDRESS_PROVIDER flag.
 */
export default function AddressAutocomplete({ value = {}, onChange, required }) {
    const [city, setCity] = useState(value.city || '')
    const [street, setStreet] = useState(value.street || '')
    const [building, setBuilding] = useState(value.building || '')

    useEffect(() => {
        setCity(value.city || '')
        setStreet(value.street || '')
        setBuilding(value.building || '')
    }, [value.city, value.street, value.building])

    function emit(next) {
        onChange?.(next)
    }

    function focusField(name) {
        setTimeout(() => {
            const el = document.querySelector(`input[name="${name}"]`)
            if (el) {
                el.focus()
                const len = el.value.length
                try { el.setSelectionRange(len, len) } catch { }
            }
        }, 50)
    }

    async function fetchCities(q) {
        const res = await apiReq('address/autocomplete', { q, type: 'city' })
        return (res || []).map(r => ({ ...r, value: r.city, label: r.label || r.city }))
    }

    async function fetchStreets(q) {
        if (!city) return []
        const res = await apiReq('address/autocomplete', { q, city, type: 'street' })
        return (res || []).map(r => ({ ...r, value: r.street, label: r.label || r.street }))
    }

    return <div className={styles.addressAutocomplete}>
        <div className={styles.row}>
            <Autocomplete
                label="address.city"
                placeholder="address.city"
                name="city_search"
                value={city}
                required={required}
                fetchOptions={fetchCities}
                minChars={1}
                onSelect={(opt) => {
                    const nextCity = opt.city || opt.label
                    setCity(nextCity)
                    setStreet('')
                    setBuilding('')
                    emit({ city: nextCity, street: '', building: '' })
                    focusField('street_search')
                }}
                onChange={(v) => {
                    const val = typeof v === 'string' ? v : v?.target?.value ?? v
                    if (!val) {
                        setCity('')
                        setStreet('')
                        setBuilding('')
                        emit({ city: '', street: '', building: '' })
                    }
                }}
            />
            <Autocomplete
                label="address.street"
                placeholder="address.street"
                name="street_search"
                value={street}
                required={required}
                fetchOptions={fetchStreets}
                minChars={1}
                disabled={!city}
                onSelect={(opt) => {
                    const nextStreet = opt.street || opt.label
                    setStreet(nextStreet)
                    setBuilding('')
                    emit({ city, street: nextStreet, building: '' })
                    focusField('building_search')
                }}
                onChange={(v) => {
                    const val = typeof v === 'string' ? v : v?.target?.value ?? v
                    if (!val) {
                        setStreet('')
                        setBuilding('')
                        emit({ city, street: '', building: '' })
                    }
                }}
            />
        </div>
        <div className={styles.row}>
            <Input
                key={`${city}-${street}`}
                label="address.building"
                placeholder="address.building"
                name="building_search"
                required={required}
                type="number"
                defaultValue={building}
                disabled={!city || !street}
                autoComplete="nope"
                data-lpignore="true"
                spellCheck="false"
                onChange={(e) => {
                    const v = e.target.value
                    setBuilding(v)
                    emit({ city, street, building: v })
                }}
            />
            <Input
                label="address.apartment"
                placeholder="address.apartment"
                name="apartment"
                defaultValue={value.apartment}
                autoComplete="nope"
                data-lpignore="true"
                onChange={(e) => emit({ city, street, building, apartment: e.target.value })}
            />
        </div>
    </div>
}

export const LocationAutocomplete = AddressAutocomplete
