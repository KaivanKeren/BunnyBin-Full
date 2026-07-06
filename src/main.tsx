import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import './index.css';

// Kiosk mode: cegah context-menu klik-kanan di build produksi (PRD-FE §8)
if (!import.meta.env.DEV) {
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Placeholder — Admin Dashboard dibangun sebagai aplikasi terpisah di Fase B (PRD-FE §2.1). */
function AdminPlaceholder() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-slate-100 text-center">
      <h1 className="text-3xl font-bold text-slate-700">Admin Dashboard</h1>
      <p className="text-lg text-slate-500">Hadir di Fase B — lihat PRD-FE.md §2.1</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminPlaceholder />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
