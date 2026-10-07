import { useEffect, useMemo } from "react";
import { Link, useRouteError } from "react-router-dom";

// Vite fingerprints every chunk, so a deploy replaces them all. Anyone with the
// tab already open is holding an index that points at files which no longer
// exist, and the next lazy route they visit fails to import - through no fault
// of theirs, on a perfectly healthy site.
//
// A reload fixes it, because it fetches the new index. So we do exactly that,
// once.
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i;

// Guards against a reload loop: if the chunk is genuinely missing (a broken
// deploy, not a stale tab) reloading would spin forever, so after one attempt
// we stop and show the error instead.
const RELOAD_KEY = "sb:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 15_000;

function RouteErrorBoundary() {
  const error = useRouteError();
  const message = String(error?.message || error || "");
  const isChunkError = CHUNK_ERROR.test(message);

  const shouldReload = useMemo(() => {
    if (!isChunkError) return false;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    } catch {
      // Private mode - fall through and allow the one reload.
    }

    return Date.now() - last >= RELOAD_COOLDOWN_MS;
  }, [isChunkError]);

  useEffect(() => {
    if (!shouldReload) return;

    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      // Can't record the attempt; still worth trying once.
    }
    window.location.reload();
  }, [shouldReload]);

  if (shouldReload) {
    return (
      <div className="min-h-screen bg-light-bg flex flex-col items-center justify-center gap-4">
        <img src="/assets/logo.png" alt="SkillBridge" className="h-12 animate-pulse" />
        <div className="w-8 h-8 border-4 border-light-teal border-t-teal rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-bg flex flex-col items-center justify-center px-6 text-center">
      <h1 className="font-family-poppins text-2xl font-bold text-black mb-2">
        Something went wrong
      </h1>
      <p className="font-family-poppins text-sm text-gray max-w-md mb-6">
        {isChunkError
          ? "This page couldn't be loaded. Refreshing didn't help, so it may be a temporary problem on our side."
          : "We couldn't load this page. Please try again."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all"
        >
          Try again
        </button>
        <Link
          to="/"
          className="font-family-poppins text-sm font-semibold text-black border border-[#D0D0D0] px-6 py-2.5 rounded-lg hover:border-teal hover:text-teal transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

export default RouteErrorBoundary;
