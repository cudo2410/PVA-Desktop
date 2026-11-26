import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { MiniWidgetApp } from './components/MiniWidgetApp'
import { ToastOverlayApp } from './components/ToastOverlayApp'

const currentHash = window.location.hash
const rootElement =
  currentHash === '#toast-overlay' ? (
    <ToastOverlayApp />
  ) : currentHash === '#mini-widget' ? (
    <MiniWidgetApp />
  ) : (
    <App />
  )

createRoot(document.getElementById('root')!).render(<StrictMode>{rootElement}</StrictMode>)
