import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { AdminHome } from './admin/AdminHome'
import { RequireAdmin } from './routes/RequireAdmin'
import { NotFound } from './screens/NotFound'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RequireAdmin><App /></RequireAdmin>} />
        <Route path="/admin" element={<RequireAdmin><AdminHome /></RequireAdmin>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
