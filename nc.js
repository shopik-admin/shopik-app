import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const [, , componentName] = process.argv
if (!componentName) process.exit(1)

const
    componentNameLower = componentName[0].toLowerCase() + componentName.substring(1),
    __dirname = path.dirname(fileURLToPath(import.meta.url)),
    dir = __dirname.split('\\node_')[0],
    dirPath = path.resolve(dir, componentName),

    component = `import styles from './${componentNameLower}.module.css'

export default function ${componentName}({ }){
    return <div className={styles.${componentNameLower}}>
        ${componentName}
    </div>
}
`

if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath)
    fs.writeFileSync(path.resolve(dirPath, 'index.jsx'), component)
    fs.writeFileSync(path.resolve(dirPath, `${componentNameLower}.module.css`), `.${componentNameLower}{\n\n}`)
} else {
    console.log(`'${componentName}' already exists!`)
}