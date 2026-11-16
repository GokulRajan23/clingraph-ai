import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Inter (SIL OFL 1.1), self-hosted with its weight and optical-size axes: no requests to Google.
import '@fontsource-variable/inter/opsz.css'
// Caveat (SIL OFL 1.1), self-hosted: only the pencilled hint under the patient search uses it.
import '@fontsource/caveat/latin-500.css'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
