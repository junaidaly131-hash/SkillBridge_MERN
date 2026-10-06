import { Link } from 'react-router-dom';
import Button from '../../ui/Button';

function Header() {
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header className="bg-light-bg font-family-josefin ">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <img
              src="/assets/logo.png"
              alt="SkillBridge Logo"
              className="h-10"
            />
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
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
          <div className="flex items-center space-x-1 sm:space-x-4">
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
