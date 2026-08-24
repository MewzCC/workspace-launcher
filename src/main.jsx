// 渲染层入口：主窗口加载 App；桌宠窗口（#/pet）加载 Pet。
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Pet from './components/Pet.jsx'
import PetChatInput from './components/PetChatInput.jsx'
import PetBubble from './components/PetBubble.jsx'
import PetStudyQuickAdd from './components/PetStudyQuickAdd.jsx'
import { themeApi } from './lib/ipc'
import './styles/theme.css'
import './styles/global.css'

const overlayRoute = window.location.hash.slice(1).split('?')[0]
const isPetWindow = overlayRoute === '/pet'
const isPetChatWindow = overlayRoute === '/pet-chat'
const isPetBubbleWindow = overlayRoute === '/pet-bubble'
const isPetStudyAddWindow = overlayRoute === '/pet-study-add'
const isPetOverlayWindow = isPetWindow || isPetChatWindow || isPetBubbleWindow || isPetStudyAddWindow
if (isPetOverlayWindow) document.documentElement.classList.add('pet-overlay-html')
if (isPetWindow) document.body.classList.add('pet-window-body')
if (isPetChatWindow) document.body.classList.add('pet-chat-window-body')
if (isPetBubbleWindow) document.body.classList.add('pet-bubble-window-body')
if (isPetStudyAddWindow) document.body.classList.add('pet-study-add-window-body')

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
      : isPetStudyAddWindow
        ? PetStudyQuickAdd
      : App

ReactDOM.createRoot(document.getElementById('root')).render(
  <RootComponent />
)
