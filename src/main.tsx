import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom'
import App from './App'
import { AdminLayout } from './admin/AdminLayout'
import { AnalyseScreen } from './admin/AnalyseScreen'
import { CoutsScreen } from './admin/CoutsScreen'
import { EntretienScreen } from './admin/EntretienScreen'
import { LogicielsScreen } from './admin/LogicielsScreen'
import { ProjetNouveauScreen } from './admin/ProjetNouveauScreen'
import { ProjetScreen } from './admin/ProjetScreen'
import { ProjetsScreen } from './admin/ProjetsScreen'
import { QuestionnaireScreen } from './admin/QuestionnaireScreen'
import { EntretienScreen as EntretienRepondantScreen } from './repondant/EntretienScreen'
import { LienGeneriqueScreen } from './repondant/LienGeneriqueScreen'
import { RepondantLayout } from './repondant/RepondantLayout'
import { RequireAdmin } from './routes/RequireAdmin'
import { ErreurRoute } from './screens/ErreurRoute'
import { NotFound } from './screens/NotFound'
import './index.css'

// Routeur « de données » : nécessaire à `useBlocker`, qui protège les saisies non enregistrées de l'admin.
const routeur = createBrowserRouter(
  createRoutesFromElements(
    // Route sans chemin : une exception au rendu de n'importe quel écran affiche `ErreurRoute`.
    <Route errorElement={<ErreurRoute />}>
      <Route path="/" element={<RequireAdmin><App /></RequireAdmin>} />
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<ProjetsScreen />} />
        <Route path="couts" element={<CoutsScreen />} />
        <Route path="logiciels" element={<LogicielsScreen />} />
        <Route path="projets/nouveau" element={<ProjetNouveauScreen />} />
        <Route path="projets/:id" element={<ProjetScreen />} />
        <Route path="questionnaires/:id" element={<QuestionnaireScreen />} />
        <Route path="repondants/:id" element={<EntretienScreen />} />
        <Route path="analyses/:id" element={<AnalyseScreen />} />
      </Route>
      {/* Parcours répondant : public, sans session ; l'accès se fait par le code ou le jeton. */}
      <Route element={<RepondantLayout />}>
        <Route path="/q/:code" element={<LienGeneriqueScreen />} />
        <Route path="/r/:jeton" element={<EntretienRepondantScreen />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Route>,
  ),
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={routeur} />
  </React.StrictMode>,
)
