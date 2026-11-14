import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Google Sans (SIL OFL 1.1), self-hosted: weight and optical-size axes, no requests to Google.
import '@fontsource-variable/google-sans/opsz.css'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
