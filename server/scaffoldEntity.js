import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { promisify } from 'util'
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})
const rlQuestion = promisify(rl.question).bind(rl)

const SCHEMAS_DIR = './server/dl/schemas'
const API_DIR = './server/api'

function toPascalCase(str) {
    return str.replace(/(?:^|-|_)(\w)/g, (_, c) => c.toUpperCase())
}

function toSnakeCase(str) {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

function singularToPlural(word) {
    if (/[^aeiou]y$/.test(word))
        return word.slice(0, -1) + 'ies'
    if (/[sxz]$|sh$|ch$/.test(word))
        return word + 'es'
    return word + 's'
}

/**
 * Interactive schema field prompt.
 */
async function askField() {
    const name = await rlQuestion('Enter field name (or press Enter to skip): ')
    if (!name?.trim()) return null

    const typeOptions = [
        'String',
        'Number',
        'Boolean',
        'Date',
        'Array',
        'Mixed'
    ]
    const typeOptionsString = typeOptions.map((o, i) => `${i + 1}. ${o}`).join('\n')
    let type = 0
    do {
        type = (await rlQuestion(`Type for "${name}"?\n${typeOptionsString}\n`)).trim()
        type = parseInt(type)
        if (!typeOptions[type - 1] || isNaN(type)) {
            console.log(`Invalid type. Choose from:\n${typeOptionsString}\n`)
        }
    } while (!typeOptions[type - 1])

    const required = (await rlQuestion('Required? (y/n) ')).trim().toLowerCase() === 'y'
    const indexed = (await rlQuestion('Indexed? (y/n) ')).trim().toLowerCase() === 'y'

    let unique = false
    if (indexed) {
        unique = (await rlQuestion('Unique? (y/n) ')).trim().toLowerCase() === 'y'
    }
    const editable = (await rlQuestion('Editable? (y/n) ')).trim().toLowerCase() === 'y'

    return {
        name,
        type: typeOptions[type - 1],
        required,
        indexed,
        unique,
        editable
    }
}

/**
 * Generate a Mongoose schema for the entity interactively.
 */
async function generateSchema(entityName) {
    const fields = []
    console.log(`\n📝 Defining fields for ${entityName}:`)

    while (true) {
        const field = await askField()
        if (!field) break
        fields.push(field)
        console.log(`   ✅ Added: ${field.name} (${field.type})${field.required ? ' [required]' : ''}${field.indexed ? ' [indexed]' : ''}`)
    }

    // Build schema object
    // 
    const typeDic = {
        'String': 'String',
        'Number': 'Number',
        'Boolean': 'Boolean',
        'Date': 'Date',
        'Array': '[String]',
        'Mixed': '{}',
    }

    // Generate file content

    const schemaContent = `import { CACHE_STRATEGIES } from '#common/constants.js'

const ${entityName}Schema = {
${fields.map(f => {
        let line = `    ${f.name}: { 
        type: ${f.type === 'Array' ? '[String]' : typeDic[f.type]},`
        if (f.required) line += `\n        required: true,`
        if (f.unique) {
            line += `\n        unique: true`
        } else if (f.indexed) {
            line += `\n        index: true`
        }
        line += `\n    }`
        return line
    }).join(',\n')}
}

export const meta = { cacheStrategy: CACHE_STRATEGIES.VERSION }

export default ${entityName}Schema`
    return {
        schemaContent,
        fields
    }
}

/**
 * Generate the API create function.
 */
function generateCreate(entityName, fields) {
    const modelName = toPascalCase(entityName)

    return `export default async function create(payload, { DL, _admin }) {
    const { ${fields.map(f => f.name).join(', ')} } = payload

    // TODO: add business logic here

    const ${entityName} = {
        ${fields.map(f => f.name).join(',\n        ')}
    }

    const created = await DL.${modelName}.create(${entityName})
    return created
}

create.config = {
    required: [],
    permissions: ['${entityName}:create']
}`
}

/**
 * Generate the API update function.
 */
function generateUpdate(entityName, fields) {
    const modelName = toPascalCase(entityName)
    const editableFields = fields.filter(field => field.editable)
    return `export default async function update(payload, { DL, _admin }) {
    const { id } = payload

    const ${entityName} = await DL.${modelName}.readById(id)
    if (!${entityName})
        throw { status: 400, message: '${entityName} does not exist' }

    const update = {}
    
${editableFields.map(({ name }) => `    if (payload.${name} != ${entityName}.${name}) update.${name} = payload.${name}\n`).join('')}
    
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate)
        return ${entityName}

    const updated = await DL.${modelName}.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['${entityName}:update']
}`
}

/**
 * Generate the API read-by-id function.
 */
function generateId(entityName) {
    const modelName = toPascalCase(entityName)

    return `export default async function id({ id }, { DL, _admin }) {
    const ${entityName} = await DL.${modelName}.readById(id)
    return ${entityName}
}

id.config = {
    required: ['id'],
    permissions: ['${entityName}:id']
}`
}

/**
 * Generate the API read-all function.
 */
function generateRead(entityName) {
    const modelName = toPascalCase(entityName)

    return `export default async function read(payload, { DL, _admin }) {
    // TODO: _admin.filter
    const { filter = {}, select } = payload
    return DL.${modelName}.read(filter, select, payload)
}

read.config = {
    permissions: ['${entityName}:read']
}`
}

/**
 * Main scaffold function.
 */
export default async function scaffoldEntity(entityName) {
    const modelName = toPascalCase(entityName)
    const collectionName = singularToPlural(toSnakeCase(modelName))

    console.log(`\n📦 Scaffolding entity: ${entityName} `)
    console.log(`   Model: ${modelName} `)
    console.log(`   Collection: ${collectionName} \n`)

    // 1. Create schema file
    const schemaPath = path.resolve(SCHEMAS_DIR, `${toSnakeCase(entityName)}.js`)
    if (fs.existsSync(schemaPath)) {
        console.error(`❌ Schema already exists: ${schemaPath} `)
        process.exit(1)
    }

    const { schemaContent, fields } = await generateSchema(entityName)
    fs.writeFileSync(schemaPath, schemaContent)
    console.log(`✅ Schema: ${schemaPath} `)

    // 2. Create API directory and files
    const apiDir = path.resolve(API_DIR, entityName)
    // if (fs.existsSync(apiDir)) {
    //     console.error(`❌ API directory already exists: ${ apiDir } `)
    //     process.exit(1)
    // }

    fs.mkdirSync(apiDir, { recursive: true })

    // create.js
    const createContent = generateCreate(entityName, fields)
    fs.writeFileSync(path.join(apiDir, 'create.js'), createContent)
    console.log(`✅ Create: ${path.join('api', entityName, 'create.js')} `)

    // update.js
    const updateContent = generateUpdate(entityName, fields)
    fs.writeFileSync(path.join(apiDir, 'update.js'), updateContent)
    console.log(`✅ Update: ${path.join('api', entityName, 'update.js')} `)

    // id.js
    const idContent = generateId(entityName)
    fs.writeFileSync(path.join(apiDir, 'id.js'), idContent)
    console.log(`✅ ID: ${path.join('api', entityName, 'id.js')} `)

    // read.js
    const readContent = generateRead(entityName)
    fs.writeFileSync(path.join(apiDir, 'read.js'), readContent)
    console.log(`✅ Read: ${path.join('api', entityName, 'read.js')} `)

    console.log(`\n🎉 Done! Entity "${entityName}" has been scaffolded.\n`)
}

// CLI entry point
const args = process.argv.slice(2)
if (args.length === 0) {
    console.log('Usage: node scaffoldEntity.js <entity-name>')
    console.log('\nExamples:')
    console.log('  node scaffoldEntity.js product')
    console.log('  node scaffoldEntity.js order')
    process.exit(1)
}

const entityName = args[0]
scaffoldEntity(entityName).catch(err => {
    console.error(`❌ Error: ${err.message} `)
    process.exit(1)
})
