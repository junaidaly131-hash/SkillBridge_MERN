import { RouterProvider } from "react-router-dom";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import router from "./routes";
import { ToastProvider } from "./ui/Toast";

function App() {
  return (
    // reducedMotion="user" honours the OS setting: anyone who has asked for
    // less motion gets the opacity changes and none of the movement, without
    // every component having to check for it.
    //
    // LazyMotion + domAnimation loads only the DOM animation features and lets
    // us use the lightweight `m` component instead of `motion`, which would
    // pull in the full feature set (layout projection, drag, SVG path) that
    // nothing here uses.
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </LazyMotion>
    </MotionConfig>
  );
}

export default App;
