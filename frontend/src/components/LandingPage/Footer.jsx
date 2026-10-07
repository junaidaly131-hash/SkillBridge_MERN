import { Link, useLocation, useNavigate } from "react-router-dom";

function Footer() {
  const location = useLocation();
  const navigate = useNavigate();

  // These point at sections of the landing page. From anywhere else the
  // element simply isn't in the document, so the old version silently did
  // nothing - navigate home first, then scroll once it has rendered.
  const scrollToSection = (sectionId) => {
    if (location.pathname !== "/") {
      navigate("/", { state: { scrollTo: sectionId } });
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <footer className="text-black font-family-poppins">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* A grid, not a flex row. The children already carry col-span
            classes, which do nothing on a flex container - so at 360px the
            three columns simply did not fit and the last one pushed the page
            into horizontal scroll. They stack on a phone now. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="col-span-1 md:col-span-2">
            <img
              src="/assets/logo.png"
              alt="SkillBridge Logo"
              className="h-10 mb-4 "
            />
            <p className="text-black max-w-sm  font-light text-sm">
              AI-powered skill exchange platform connecting learners and
              teachers across Pakistan.
            </p>
            <a
              href="mailto:support@skill-bridge.me"
              className="inline-block mt-3 text-black text-sm hover:text-teal transition-colors"
            >
              support@skill-bridge.me
            </a>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-josefin font-semibold text-lg mb-4">Company</h3>
            <ul className="space-y-2 font-poppins text-sm">
              <li>
                <a
                  onClick={() => scrollToSection("hero")}
                  className="text-black cursor-pointer hover:text-teal transition-colors"
                >
                  About Us
                </a>
              </li>

              <li>
                <a
                  onClick={() => scrollToSection("how-it-works")}
                  className="text-black cursor-pointer hover:text-teal transition-colors"
                >
                  How SkillBridge Works
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-josefin font-semibold text-lg mb-4">Legal</h3>
            <ul className="space-y-2 font-poppins text-sm">
              {/* Sits on every public page, which is what gives the teacher
                  directory a crawlable route in from anywhere on the site. */}
              <li>
                <Link
                  to="/teachers"
                  className="text-black cursor-pointer hover:text-teal transition-colors"
                >
                  Find a Teacher
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-black cursor-pointer hover:text-teal transition-colors"
                >
                  Contact Us
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-black cursor-pointer hover:text-teal transition-colors"
                >
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="text-black cursor-pointer hover:text-teal transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to="/refund-policy"
                  className="text-black cursor-pointer hover:text-teal transition-colors"
                >
                  Refund & Cancellation Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
