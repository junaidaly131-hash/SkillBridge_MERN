import { Link, useLocation, useNavigate } from 'react-router-dom';
import Button from '../../ui/Button';

function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  // These point at sections of the landing page, but this header is on every
  // public page. From /teachers or /contact the element simply isn't in the
  // document, so the old version found nothing and silently did nothing -
  // navigate home first and let LandingPage scroll once it has rendered.
  // Same fix the footer already carries.
  const scrollToSection = (sectionId) => {
    if (location.pathname !== '/') {
      navigate('/', { state: { scrollTo: sectionId } });
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header className="sticky top-0 z-50 bg-transparent px-3 py-3 font-family-josefin sm:px-6 sm:py-4">
      <div className="landing-header-float landing-header-glass mx-auto max-w-7xl rounded-2xl border border-transparent px-3 backdrop-blur-xl sm:px-5 md:rounded-full lg:px-7">
        <div className="flex items-center justify-between gap-3 py-2.5">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <img
              src="/assets/logo.png"
              alt="SkillBridge Logo"
              className="h-9 sm:h-10"
            />
          </Link>

          {/* Navigation */}
          <nav className="hidden items-center gap-6 md:flex lg:gap-8" aria-label="Primary navigation">
            <button
              onClick={() => scrollToSection('features')}
              className="text-black font-poppins hover:text-teal transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-black font-poppins hover:text-teal transition-colors cursor-pointer"
            >
              How It Works
            </button>
            {/* A real link, not a scroll button like its neighbours - this one
                goes to another page, and a crawler has to be able to follow it. */}
            <Link
              to="/teachers"
              className="text-black font-poppins hover:text-teal transition-colors cursor-pointer"
            >
              Find a Teacher
            </Link>
          </nav>

          {/* Buttons */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <Link to="/login">
              <Button variant="secondary">
                Sign In
              </Button>
            </Link>
            <Link to="/signup">
              <Button variant="primary">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
