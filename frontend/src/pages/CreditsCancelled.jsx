import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";

function CreditsCancelled() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-white rounded-xl p-8 shadow-sm max-w-md w-full text-center">
        <XCircle className="w-12 h-12 text-gray mx-auto mb-4" />
        <h1 className="font-family-poppins text-xl font-bold text-black mb-2">
          Payment cancelled
        </h1>
        <p className="font-family-poppins text-sm text-gray mb-6">
          No charge was made. You can try again anytime from the Credits page.
        </p>
        <Link
          to="/credits"
          className="inline-block font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg"
        >
          Back to Credits
        </Link>
      </div>
    </div>
  );
}

export default CreditsCancelled;
