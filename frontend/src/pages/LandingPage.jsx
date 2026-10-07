import { Suspense, lazy, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import Header from '../components/LandingPage/Header';
import Footer from '../components/LandingPage/Footer';
import Hero from '../components/LandingPage/Hero';
import Features from '../components/LandingPage/Features';
import HowItWorks from '../components/LandingPage/HowItWorks';
import CTA from '../components/LandingPage/CTA';

// Below the fold, so they are fetched after the page is usable rather than
// competing with the hero for the first paint. Each renders nothing until its
// own chunk lands, which is why there is no Suspense fallback worth showing -
// a spinner for a section nobody has scrolled to yet is just noise.
const TwoSides = lazy(() => import('../components/LandingPage/TwoSides'));
const AIMatching = lazy(() => import('../components/LandingPage/AIMatching'));
const TrustSafety = lazy(() => import('../components/LandingPage/TrustSafety'));
const PopularSkills = lazy(() => import('../components/LandingPage/PopularSkills'));
const FeaturedTeachers = lazy(() => import('../components/LandingPage/FeaturedTeachers'));
const CreditsExplained = lazy(() => import('../components/LandingPage/CreditsExplained'));
const FAQ = lazy(() => import('../components/LandingPage/FAQ'));

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
        <div id="how-it-works">
          <HowItWorks />
        </div>
        {/* Nothing below here is needed for the first paint. One boundary for
            the lot: they arrive in order and each is invisible until it does. */}
        <Suspense fallback={null}>
          <TwoSides />
          <AIMatching />
          <div id="features">
            <Features />
          </div>
          <TrustSafety />
          <PopularSkills />
          <FeaturedTeachers />
          <CreditsExplained />
          <FAQ />
        </Suspense>
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
