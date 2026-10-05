import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Input from "../ui/Input";
import Button from "../ui/AuthButton";
import GoogleLoginButton from "../components/GoogleLoginButton";
import { usePageMeta } from "../hooks/usePageMeta";
import { loginUser, loginWithFacebook, clearError } from "../store/authSlice";
import { useToast } from "../ui/Toast";

function LoginPage() {
  // Not in the sitemap - a login form has nothing to rank for. The title is set
  // only so the browser tab and history entry aren't the generic default.
  usePageMeta({ title: "Log In", path: "/login" });

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { showSuccess, showError, showInfo } = useToast();
  const { loading, error, token, user, verificationEmail } = useSelector((state) => state.auth);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const defaultPath = user?.role === "admin" ? "/admin/transactions" : "/dashboard";
  const redirectPath = location.state?.from?.pathname || defaultPath;

  useEffect(() => {
    if (token) {
      showSuccess("Login successful!");
      navigate(redirectPath, { replace: true });
    } else if (verificationEmail) {
      showInfo("Please verify your email to continue.");
      // Redirect to 2FA page if verification is required
      navigate('/verify', { 
        state: { email: verificationEmail, purpose: 'login' },
        replace: true 
      });
    }
  }, [token, verificationEmail, navigate, redirectPath, showSuccess, showInfo]);

  useEffect(() => {
    if (error) {
      showError(error);
    }
  }, [error, showError]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) dispatch(clearError());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(loginUser(formData));
  };


  const [fbReady, setFbReady] = useState(false);

  useEffect(() => {
    const facebookAppId = import.meta.env.VITE_FACEBOOK_APP_ID?.trim() || '';

    if (!facebookAppId) {
      console.warn('VITE_FACEBOOK_APP_ID is not set. Facebook login will not work.');
      return;
    }

    // Check if we're on HTTPS or localhost (required for Facebook)
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

    if (!isSecure) {
      console.warn('Facebook login requires HTTPS or localhost. Current hostname:', window.location.hostname);
      return;
    }

    const initFacebook = () => {
      if (window.FB) {
        try {
          window.FB.init({
            appId: facebookAppId,
            cookie: true,
            xfbml: true,
            version: 'v18.0',
          });
          console.log('Facebook SDK initialized successfully');
          setFbReady(true);
        } catch (error) {
          console.error('Facebook SDK initialization error:', error);
        }
      }
    };

    // Load Facebook SDK dynamically
    const loadFacebookSDK = () => {
      if (document.getElementById('facebook-jssdk')) {
        // SDK script already exists, just init
        if (window.FB) {
          initFacebook();
        }
        return;
      }

      window.fbAsyncInit = function() {
        initFacebook();
      };

      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    };

    // If SDK is already loaded and initialized
    if (window.FB) {
      initFacebook();
    } else {
      loadFacebookSDK();
    }
  }, []);

  const handleFacebookLogin = () => {
    const facebookAppId = import.meta.env.VITE_FACEBOOK_APP_ID?.trim() || '';
    
    if (!facebookAppId) {
      showError('Facebook OAuth is not configured. Please set VITE_FACEBOOK_APP_ID in your .env file.');
      return;
    }

    // Check if we're on HTTPS or localhost
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (!isSecure) {
      showError('Facebook login requires HTTPS. Please use HTTPS or localhost for development.');
      return;
    }

    if (!window.FB || !fbReady) {
      showError('Facebook SDK is not ready. Please wait a moment and try again.');
      return;
    }

    try {
      window.FB.login(
        (response) => {
          if (response.authResponse) {
            // Hand the server the access token and nothing else - it calls
            // Facebook itself for the identity. Reading name/email here and
            // forwarding them made them unverified client claims, and the
            // old `<userID>@facebook.com` fallback invented an address
            // outright for accounts that share no email.
            dispatch(loginWithFacebook({
              accessToken: response.authResponse.accessToken,
            }));
          } else {
            console.error('Facebook login failed:', response);
            if (response.error) {
              showError(`Facebook login failed: ${response.error.message || 'Unknown error'}`);
            }
          }
        },
        { scope: 'email' }
      );
    } catch (error) {
      console.error('Facebook login error:', error);
      showError('An error occurred during Facebook login. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 bg-light-bg flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md ">
          <div className="text-left mb-8">
            <h1 className="font-family-poppins text-4xl font-semibold text-black mb-2">
              Welcome Back!
            </h1>
            <p className="font-family-poppins text-sm text-gray">
              Sign in to continue your learning journey.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email Address"
              name="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
            />
            <Input
              label="Password"
              name="password"
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
            />

            <div className="flex items-center justify-end text-sm">
              <Link to="/forgot-password" className="font-family-poppins text-teal hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button
              variant="primary"
              type="submit"
              disabled={loading}
              className="w-full rounded-full py-4 mt-2"
            >
              {loading ? "Signing In..." : "Sign In"}
            </Button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-[#D0D0D0]"></div>
            <span className="font-family-poppins text-lg text-gray">or continue with</span>
            <div className="flex-1 h-px bg-[#D0D0D0]"></div>
          </div>

          <div className="flex flex-col gap-3">
            <GoogleLoginButton className="flex items-center justify-center gap-3 w-full py-3 border border-[#D0D0D0] rounded-lg hover:bg-gray-50 transition-all">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="font-family-poppins font-medium text-dark-blue">
                Continue with Google
              </span>
            </GoogleLoginButton>

            {/* <button
              onClick={handleFacebookLogin}
              className="flex items-center justify-center gap-3 w-full py-3 border border-[#D0D0D0] rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span className="font-family-poppins font-medium text-dark-blue">
                Continue with Facebook
              </span>
            </button> */}
          </div>

          <p className="text-center mt-8 font-family-poppins text-sm text-gray">
            Don't have an account?{" "}
            <a href="/signup" className="text-teal font-medium hover:underline">
              Register
            </a>
          </p>
        </div>
      </div>

      {/* Right Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-dark-blue flex-col items-center justify-center px-8 text-center relative overflow-hidden">
        {/* Top Left Image */}
        <img
          src="/auth/1.png"
          alt=""
          className="absolute top-8 left-8 w-24 h-24 object-contain"
        />
        {/* Middle Right Image */}
        <img
          src="/auth/2.png"
          alt=""
          className="absolute top-[30%] right-8 -translate-y-1/2 w-24 h-24 object-contain"
        />
        {/* Bottom Right Image */}
        <img
          src="/auth/3.png"
          alt=""
          className="absolute bottom-8 right-8 w-24 h-24 object-contain"
        />

        <img
          src="/logo.svg"
          alt="SkillBridge Logo"
          className="h-16 mb-8"
        />
        <h2 className="font-family-poppins text-4xl font-bold text-white mb-4">
          Start Learning Today
        </h2>
        <p className="font-family-poppins text-lg text-white/80 max-w-md">
          Join SkillBridge. Your next breakthrough is just a connection away
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
