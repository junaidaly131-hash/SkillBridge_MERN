import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import Header from '../components/LandingPage/Header';
import Footer from '../components/LandingPage/Footer';
import Hero from '../components/LandingPage/Hero';
import Features from '../components/LandingPage/Features';
import HowItWorks from '../components/LandingPage/HowItWorks';
import CTA from '../components/LandingPage/CTA';

function LandingPage() {
  const location = useLocation();

  // The one page that carries the site-wide defaults, so no title override -
  // "SkillBridge | SkillBridge" helps nobody.
  usePageMeta({ path: "/" });

  // A footer link from another page navigates here carrying the section it
  // wanted. ScrollRestoration puts us at the top first, so this runs after
  // and takes over.
  useEffect(() => {
    const target = location.state?.scrollTo;
    if (!target) return;
    const el = document.getElementById(target);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.state]);

  return (
    <div className="min-h-screen bg-light-bg flex flex-col">
      <Header />
      <main className="grow">
        <div id="hero">
        <Hero />
        </div>
        <div id="features">
          <Features />
        </div>
        <div id="how-it-works">
          <HowItWorks />
        </div>
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
