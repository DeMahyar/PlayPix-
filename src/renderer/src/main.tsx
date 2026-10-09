// PlayPix renderer entry
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MiniPlayerWindow } from './components/MiniPlayerWindow'
import './styles/tokens.css'
import './styles/animations.css'
import './styles/components.css'
import './styles/pages.css'

const isMini = window.location.hash.includes('mini') || window.location.search.includes('mode=mini')

if (isMini) {
  document.documentElement.classList.add('mini-window-mode')
  document.body.classList.add('mini-window-mode')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isMini ? <MiniPlayerWindow /> : <App />}
  </React.StrictMode>
)
