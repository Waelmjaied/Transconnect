import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/AuthContext'
import { Shell } from './components/Shell'
import { Loading } from './components/State'
import { AccountPage } from './pages/AccountPage'
import { LoginPage, RegisterPage } from './pages/AuthPages'
import { BookingPage } from './pages/BookingPage'
import { ChatsPage } from './pages/ChatsPage'
import { ChatThreadPage } from './pages/ChatThreadPage'
import { HomePage } from './pages/HomePage'
import { MyTripsPage } from './pages/MyTripsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PublishPage } from './pages/PublishPage'
import { SearchPage } from './pages/SearchPage'
import { SupportPage } from './pages/SupportPage'
import { TicketPage } from './pages/TicketPage'
import { TripPage } from './pages/TripPage'

// Pages lourdes (carte Leaflet, tableau de bord) chargées à la demande.
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const TrackingPage = lazy(() => import('./pages/TrackingPage').then((m) => ({ default: m.TrackingPage })))

// Les gardes ne servent qu'à l'ergonomie : l'autorité reste le serveur (RBAC vérifié à chaque requête).
const guarded = (page: JSX.Element) => <RequireAuth><Suspense fallback={<Loading />}>{page}</Suspense></RequireAuth>

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/results" element={<SearchPage />} />
        <Route path="/trip/:id" element={<TripPage />} />
        <Route path="/booking/:id" element={guarded(<BookingPage />)} />
        <Route path="/publish" element={<PublishPage />} />
        <Route path="/tracking" element={guarded(<TrackingPage />)} />
        <Route path="/my-trips" element={guarded(<MyTripsPage />)} />
        <Route path="/chats" element={guarded(<ChatsPage />)} />
        <Route path="/chats/:bookingId" element={guarded(<ChatThreadPage />)} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/admin" element={guarded(<AdminPage />)} />
        <Route path="/support" element={guarded(<SupportPage />)} />
        <Route path="/support/:id" element={guarded(<TicketPage />)} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
