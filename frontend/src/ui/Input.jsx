import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

function Input({
  type = "text",
  placeholder,
  value,
  onChange,
  label,
  name,
  error,
  variant = "default",
  className = "",
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  const baseStyles =
    "font-poppins w-full px-4 py-3 rounded-lg border outline-none transition-all";

  const variants = {
    default: "border-[#D0D0D0] focus:border-teal focus:ring-1 focus:ring-teal",
    filled:
      "bg-light-bg border-transparent focus:border-teal focus:ring-1 focus:ring-teal",
    outline: "border-dark-blue focus:border-teal focus:ring-1 focus:ring-teal",
  };

  const errorId = error ? `${name}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={name}
          className="font-family-poppins text-sm font-medium text-gray"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={name}
          name={name}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={`${baseStyles} ${
            error
              ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500"
              : variants[variant]
          } ${isPassword ? "pr-10" : ""} ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="w-5 h-5" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="font-family-poppins text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default Input;
