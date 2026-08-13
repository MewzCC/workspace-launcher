// 渲染层入口：主窗口加载 App；桌宠窗口（#/pet）加载 Pet。
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Pet from './components/Pet.jsx'
import './styles/theme.css'
import './styles/global.css'

const isPetWindow = window.location.hash === '#/pet'
if (isPetWindow) document.body.classList.add('pet-window-body')

ReactDOM.createRoot(document.getElementById('root')).render(
  isPetWindow ? <Pet /> : <App />
)
