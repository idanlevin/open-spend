import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { router } from '@/app/router'
import { useWorkspaceStore } from '@/stores/workspace-store'

function App() {
  const initialize = useWorkspaceStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <>
      <RouterProvider router={router} />
      <Toaster richColors closeButton />
    </>
  )
}

export default App
