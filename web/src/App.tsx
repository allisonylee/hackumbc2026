import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LoadingScreen } from '@/components/LoadingScreen'
import { NavBar } from '@/components/NavBar'
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
          <Route path="/" element={<Navigate to="/current" replace />} />
          <Route path="/current" element={<CurrentTab />} />
          <Route path="/plan" element={<PlanTab />} />
          <Route path="/learn" element={<LearnTab />} />
          <Route path="*" element={<Navigate to="/current" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const data = useStore((s) => s.data)
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
          {data && <MapCanvas />}
          {data && (
            <>
              <NavBar />
              <TabPanels />
              <ChatDrawer />
              <FootprintDialog />
              <EvaluationDialog />
            </>
          )}
          <AnimatePresence>
            {!data && (
              <motion.div key="loading" exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                <LoadingScreen progress={progress} error={error} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </TooltipProvider>
    </BrowserRouter>
  )
}
