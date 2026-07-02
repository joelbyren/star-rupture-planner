import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/big-shoulders-display/400.css'
import '@fontsource/big-shoulders-display/600.css'
import '@fontsource/big-shoulders-display/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/caveat/500.css'
import '@fontsource/caveat/600.css'
import '@fontsource/michroma/400.css'
import '@fontsource/chakra-petch/300.css'
import '@fontsource/chakra-petch/400.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/vt323/400.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
