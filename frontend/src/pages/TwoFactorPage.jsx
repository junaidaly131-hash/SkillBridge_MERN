import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import Button from "../ui/AuthButton";
import { verifyCode, resendCode, clearError } from "../store/authSlice";

function TwoFactorPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error, token, user } = useSelector((state) => state.auth);
  
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState("login");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    // Get email and purpose from location state or auth state
    const stateEmail = location.state?.email;
    const statePurpose = location.state?.purpose || "login";
    
    if (stateEmail) {
      setEmail(stateEmail);
      setPurpose(statePurpose);
    } else {
      // If no email in state, redirect back to login
      navigate("/login", { replace: true });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    if (token) {
      navigate(user?.role === "admin" ? "/admin/transactions" : "/dashboard", { replace: true });
    }
  }, [token, user, navigate]);

  const handleChange = (index, value) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) return;
    if (value.length > 1) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace to go to previous input
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
    // Handle Enter to submit if all fields are filled
    if (e.key === "Enter" && code.join("").length === 6) {
      handleSubmit(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fullCode = code.join("");
    
    if (fullCode.length !== 6) {
      return;
    }

    if (!email) {
      navigate("/login", { replace: true });
      return;
    }

    dispatch(clearError());
    await dispatch(verifyCode({ email, code: fullCode }));
  };

  const handleResend = async () => {
    if (!email || !purpose) return;
    
    setResending(true);
    dispatch(clearError());
    await dispatch(resendCode({ email, purpose }));
    setResending(false);
    
    // Clear code inputs
    setCode(["", "", "", "", "", ""]);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - 2FA Form */}
      <div className="w-full lg:w-1/2 bg-light-bg flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-left mb-8">
            <h1 className="font-family-poppins text-3xl font-bold text-black mb-3">
              Authenticate Your Account
            </h1>
            <p className="font-family-poppins text-sm text-gray">
              Protecting your privacy is our top priority. Please confirm your
              account by entering the authorization code sent to your email.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Code Input Boxes */}
            {/* Six boxes at w-14 with gap-3 come to 396px, which does not fit
                the 343px a 375px screen leaves after the container padding -
                the last box was cut off. They shrink below sm instead. */}
            <div className="flex gap-1.5 sm:gap-3">
              {code.map((digit, index) => (
                <input
                  key={index}
                  id={`code-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-10 sm:w-14 h-14 sm:h-16 min-w-0 text-center text-xl sm:text-2xl font-semibold border border-[#D0D0D0] rounded-lg outline-none focus:border-teal focus:ring-1 focus:ring-teal transition-all"
                />
              ))}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="font-family-poppins text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <p className="font-family-poppins text-sm text-gray">
                It may take a minute to receive your code.
                <br />
                Haven't received it?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || loading}
                  className="text-teal font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resending ? "Sending..." : "Resend a new code."}
                </button>
              </p>

              <Button
                type="submit"
                variant="primary"
                className="rounded-full px-10 py-3"
                disabled={loading || code.join("").length !== 6}
              >
                {loading ? "Verifying..." : "Submit"}
              </Button>
            </div>
          </form>
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

export default TwoFactorPage;
