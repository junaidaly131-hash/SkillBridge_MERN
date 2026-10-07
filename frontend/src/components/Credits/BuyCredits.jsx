import { useEffect, useState } from "react";
import apiClient from "../../api/client";
import { useToast } from "../../ui/Toast";

// Outside the component so the mutation isn't lexically inside render/hook
// scope - Safepay's checkout is a hosted redirect page, not an in-page
// overlay, so this sends the whole browser there.
function redirectTo(url) {
  window.location.href = url;
}

function BuyCredits() {
  const { error: showError } = useToast();

  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState(null);
  const [buyingPackId, setBuyingPackId] = useState(null);

  const fetchPackages = () => {
    apiClient
      .get("/payments/packages")
      .then((res) => {
        setPackages(res.data.packages || []);
        if (!res.data.packages?.length) {
          setPackagesError("No credit packages are available right now.");
        }
      })
      .catch(() => {
        setPackagesError("Unable to load packages. Please try again.");
      })
      .finally(() => setPackagesLoading(false));
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  const retryLoadPackages = () => {
    setPackagesLoading(true);
    setPackagesError(null);
    fetchPackages();
  };

  const handleBuy = async (packId) => {
    if (buyingPackId) return;
    setBuyingPackId(packId);
    try {
      const res = await apiClient.post("/payments/checkout", { packId });
      redirectTo(res.data.checkoutUrl);
    } catch (err) {
      setBuyingPackId(null);
      showError(err.response?.data?.message || "Unable to start checkout. Please try again.");
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h2 className="font-family-poppins text-lg font-semibold text-black mb-4">
        Buy Credits
      </h2>

      {packagesLoading && (
        <p className="font-family-poppins text-sm text-gray text-center py-6">
          Loading packages...
        </p>
      )}

      {!packagesLoading && packagesError && (
        <div className="text-center py-6">
          <p className="font-family-poppins text-sm text-gray mb-3">{packagesError}</p>
          <button
            onClick={retryLoadPackages}
            className="font-family-poppins text-sm text-teal font-semibold hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {!packagesLoading && !packagesError && (
        <div className="space-y-3">
          {packages.map((pkg) => {
            const isBuying = buyingPackId === pkg.packId;
            return (
              <div
                key={pkg.packId}
                className="relative flex items-center justify-between p-4 rounded-xl border border-[#E5E5E5]"
              >
                <div>
                  <p className="font-family-poppins text-2xl font-bold text-black">
                    {pkg.credits}
                  </p>
                  <p className="font-family-poppins text-xs text-gray">{pkg.label}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-family-poppins text-base font-semibold text-black">
                    {pkg.displayPrice}
                  </p>
                  <button
                    onClick={() => handleBuy(pkg.packId)}
                    disabled={!!buyingPackId}
                    className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-4 py-2 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed min-w-[72px]"
                  >
                    {isBuying ? (
                      <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Buy"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="font-family-poppins text-xs text-gray text-center mt-4">
        Credits never expire. Use them anytime.
      </p>
    </div>
  );
}

export default BuyCredits;
