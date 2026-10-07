import { Suspense } from "react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import RouteFallback from "../components/RouteFallback";

// Wraps every route for two reasons.
//
// ScrollRestoration: without it a client-side navigation keeps whatever scroll
// position the previous page had - clicking "Contact Us" from a footer dropped
// you halfway down the new page. It also restores the old position on back and
// forward, which a plain scroll-to-top would throw away.
//
// Suspense: most routes are lazily loaded, so something has to render while a
// chunk is fetched. It sits inside, not around, ScrollRestoration so that stays
// mounted across the swap and doesn't lose the position it was holding.
function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </>
  );
}

export default RootLayout;
