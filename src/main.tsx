import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom'
import App from './App'
import { AdminLayout } from './admin/AdminLayout'
import { LogicielsScreen } from './admin/LogicielsScreen'
import { ProjetsScreen } from './admin/ProjetsScreen'
import { RequireAdmin } from './routes/RequireAdmin'
import { NotFound } from './screens/NotFound'
import './index.css'

// Routeur « de données » : nécessaire à `useBlocker`, qui protège les saisies non enregistrées de l'admin.
const routeur = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<RequireAdmin><App /></RequireAdmin>} />
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<ProjetsScreen />} />
        <Route path="logiciels" element={<LogicielsScreen />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </>,
  ),
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={routeur} />
  </React.StrictMode>,
)
