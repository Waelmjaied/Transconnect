import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { I18nProvider } from './i18n'
import { NotifyProvider } from './notify/NotifyContext'
import { ThemeProvider } from './theme'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <NotifyProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </NotifyProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
)

// PWA : l'application peut être installée et son « coquille » reste disponible hors-ligne (jamais les données de l'API).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined) })
}
