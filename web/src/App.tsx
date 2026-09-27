import { useEffect, useLayoutEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LoadingScreen } from '@/components/LoadingScreen'
import { NavBar } from '@/components/NavBar'
import { HomePage } from '@/components/HomePage'
import { MapCanvas } from '@/map/MapCanvas'
import { loadData } from '@/lib/data'
import { useStore, type Tab } from '@/store'
import CurrentTab from '@/tabs/current/CurrentTab'
import PlanTab from '@/tabs/plan/PlanTab'
import LearnTab from '@/tabs/learn/LearnTab'
import ChatDrawer from '@/features/chat/ChatDrawer'
import FootprintDialog from '@/features/footprint/FootprintDialog'
import EvaluationDialog from '@/features/footprint/EvaluationDialog'

/** Keeps store.tab in sync with the URL. */
function RouteSync() {
  const { pathname } = useLocation()
  const setTab = useStore((s) => s.setTab)
  useEffect(() => {
    const t = pathname.split('/')[1] as Tab
    if (t === 'current' || t === 'plan' || t === 'learn') setTab(t)
  }, [pathname, setTab])
  return null
}

function TabPanels() {
  const location = useLocation()
  const tab = location.pathname.split('/')[1]
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tab}
        className="pointer-events-none absolute inset-0 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Routes location={location}>
          <Route path="/current" element={<CurrentTab />} />
          <Route path="/plan" element={<PlanTab />} />
          <Route path="/learn" element={<LearnTab />} />
          <Route path="*" element={<Navigate to="/current" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * The homepage at `/` sits over the app. The map loads underneath it (data preloads too), so "Continue"
 * just fades the homepage away. The tab UI and layers mount only after the fade finishes: building them
 * (14k hexes) during the fade would stall it, and this way the columns' rise plays in view.
 */
function Shell({ progress, error }: { progress: number; error: string | null }) {
  const data = useStore((s) => s.data)
  const setHome = useStore((s) => s.setHome)
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const [homeGone, setHomeGone] = useState(!isHome)
  if (isHome && homeGone) setHomeGone(false)
  const showApp = !isHome && homeGone
  useLayoutEffect(() => setHome(!showApp), [showApp, setHome])
  return (
    <>
      {data && <MapCanvas />}
      {data && showApp && (
        <>
          <NavBar />
          <TabPanels />
          <ChatDrawer />
          <FootprintDialog />
          <EvaluationDialog />
        </>
      )}
      <AnimatePresence>
        {!data && showApp && (
          <motion.div key="loading" exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <LoadingScreen progress={progress} error={error} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence onExitComplete={() => setHomeGone(true)}>
        {isHome && (
          <motion.div key="home" className="fixed inset-0 z-40" exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: 'easeInOut' }}>
            <HomePage />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default function App() {
  const setData = useStore((s) => s.setData)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData((done, total) => setProgress(done / total))
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [setData])

  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={200}>
        <RouteSync />
        <div className="relative h-full w-full overflow-hidden bg-[#0b0f0e] text-white">
          <Shell progress={progress} error={error} />
        </div>
      </TooltipProvider>
    </BrowserRouter>
  )
}
