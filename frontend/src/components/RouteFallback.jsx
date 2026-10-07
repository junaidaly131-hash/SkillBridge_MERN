// The loader shown while a lazily-loaded route's chunk is on the wire.
//
// Deliberately identical to the one ProtectedRoute shows while it validates a
// token: both are "the page you asked for is a moment away", and a visitor who
// sees two different loaders in one navigation reads it as something going
// wrong. Changing one means changing the other.
function RouteFallback() {
  return (
    <div className="min-h-screen bg-light-bg flex flex-col items-center justify-center gap-4">
      <img src="/assets/logo.png" alt="SkillBridge" className="h-12 animate-pulse" />
      <div className="w-8 h-8 border-4 border-light-teal border-t-teal rounded-full animate-spin" />
    </div>
  );
}

export default RouteFallback;
