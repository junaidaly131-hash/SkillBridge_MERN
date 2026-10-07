function Button({ children, variant = "primary", onClick, className = "" }) {
  const baseStyles = "font-family-poppins font-medium px-2 sm:px-6 py-2 rounded-lg transition-all";

  // The two bordered variants used to hover to solid dark-blue, which is the
  // herobtn's resting colour - so "Find a Teacher" became indistinguishable
  // from "Start Learning Free" sitting right beside it. They now pick up the
  // teal border and tint instead: clearly the brand colour, clearly still a
  // secondary action, and nothing like the filled primary button.
  //
  // The text stays dark on hover rather than turning teal. Teal on light-teal
  // measures 3.04:1, which fails WCAG AA for normal text; dark text on that
  // same tint is 13.35:1.
  const variants = {
    primary: "bg-[#227E73] text-white hover:bg-[#1C6A61] hover:text-white",
    // Had both hover:text-teal and hover:text-white - whichever came last in
    // the string silently won.
    secondary: "text-black sm:text-[700] border-2 border-[#D0D0D0] hover:bg-light-teal hover:border-teal",
    herobtn: "bg-dark-blue text-white hover:opacity-90",
    outline: "border border-gray text-black hover:bg-light-teal hover:border-teal",
  };

  return (
    <button
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export default Button;
