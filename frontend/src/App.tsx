import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import PropertyPage from './pages/PropertyPage';
import PortfolioPage from './pages/PortfolioPage';
import OnboardingPage from './pages/OnboardingPage';

const BASE = import.meta.env.BASE_URL;

export default function App() {
  return (
    <BrowserRouter basename={BASE}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="onboard/:id" element={<OnboardingPage />} />
          <Route path="property/:id" element={<PropertyPage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
