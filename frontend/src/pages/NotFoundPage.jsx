import { Link } from "react-router-dom";
import Header from "../components/LandingPage/Header";
import Footer from "../components/LandingPage/Footer";
import { usePageMeta } from "../hooks/usePageMeta";

function NotFoundPage() {
  usePageMeta({ title: "Page Not Found", robots: "noindex,follow" });

  return (
    <div className="min-h-screen bg-light-bg flex flex-col">
      <Header />
      <main className="grow flex items-center justify-center px-6 py-20 text-center">
        <div>
          <p className="font-family-poppins text-sm font-semibold text-teal mb-2">404</p>
          <h1 className="font-family-poppins text-3xl font-bold text-black mb-3">Page not found</h1>
          <p className="font-family-poppins text-sm text-gray max-w-md mb-7">
            The page you requested does not exist or may have moved.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/" className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg">Return home</Link>
            <Link to="/teachers" className="font-family-poppins text-sm font-semibold text-black border border-[#D0D0D0] px-6 py-2.5 rounded-lg">Browse teachers</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default NotFoundPage;
