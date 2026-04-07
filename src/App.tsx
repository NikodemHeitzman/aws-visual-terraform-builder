import { Navigate, Route, Routes } from 'react-router-dom'
import { DesignerPage } from './pages/designer-page'

function App() {
  return (
    <Routes>
      <Route path="/" element={<DesignerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
