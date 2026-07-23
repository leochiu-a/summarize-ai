// Summarize AI Buddy — content script 進入點
// 建立 shadow DOM host（隔離樣式），把 React app 掛進去

import { createRoot } from 'react-dom/client'
import { Buddy } from './Buddy'
import { styles } from './styles'

const host = document.createElement('div')
host.id = 'summarize-ai-buddy-host'
const shadow = host.attachShadow({ mode: 'open' })

const styleEl = document.createElement('style')
styleEl.textContent = styles
shadow.appendChild(styleEl)

const mount = document.createElement('div')
shadow.appendChild(mount)

document.documentElement.appendChild(host)
createRoot(mount).render(<Buddy />)
