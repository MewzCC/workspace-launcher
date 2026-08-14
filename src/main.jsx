// 渲染层入口：主窗口加载 App；桌宠窗口（#/pet）加载 Pet。
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Pet from './components/Pet.jsx'
import PetChatInput from './components/PetChatInput.jsx'
import PetBubble from './components/PetBubble.jsx'
import { themeApi } from './lib/ipc'
import './styles/theme.css'
import './styles/global.css'

const isPetWindow = window.location.hash === '#/pet'
const isPetChatWindow = window.location.hash === '#/pet-chat'
const isPetBubbleWindow = window.location.hash === '#/pet-bubble'
if (isPetWindow) document.body.classList.add('pet-window-body')
if (isPetChatWindow) document.body.classList.add('pet-chat-window-body')
if (isPetBubbleWindow) document.body.classList.add('pet-bubble-window-body')

themeApi.onChanged((theme) => {
  if (theme !== 'light' && theme !== 'dark') return
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(theme)
})

const RootComponent = isPetWindow
  ? Pet
  : isPetChatWindow
    ? PetChatInput
    : isPetBubbleWindow
      ? PetBubble
      : App

ReactDOM.createRoot(document.getElementById('root')).render(
  <RootComponent />
)
