export function toPascalCase(str) {
    return str.replace(/(?:^|-|_)(\w)/g, (_, c) => c.toUpperCase())
}

export function toSnakeCase(str) {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

export function singularToPlural(word) {
    // Words ending in consonant + y → ies
    if (/[^aeiou]y$/.test(word))
        return word.slice(0, -1) + 'ies'

    // Words ending in s, sh, ch, x, z → es
    if (/[sxz]$|sh$|ch$/.test(word))
        return word + 'es'

    // Default: add "s"
    return word + 's'
}
