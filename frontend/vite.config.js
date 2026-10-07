import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost', // Ensures the server binds to localhost for Facebook OAuth
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries that change only when we upgrade them are split away from
        // our own code, which changes on every deploy. A returning visitor then
        // re-downloads the app chunk and keeps React and friends from cache.
        //
        // Only these three groups are named. Anything else is left to Rollup,
        // which already places a dependency into whichever route chunk needs it
        // - a hand-written list would just drag rarely-used libraries back into
        // everyone's first load.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // react-router pulls in its own copy of history/remix internals; it
          // is matched before react so those don't land in the react chunk.
          // motion is only used by the landing page today, but it is a
          // dependency like any other: split out so upgrading our code
          // does not invalidate it in anyone's cache.
          if (/node_modules[\/](motion|framer-motion|motion-dom|motion-utils)[\/]/.test(id)) {
            return 'vendor-motion';
          }
          if (id.includes('react-router')) return 'vendor-router';
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/node_modules[\\/](@reduxjs[\\/]toolkit|react-redux|redux|immer|reselect)[\\/]/.test(id)) {
            return 'vendor-redux';
          }

          return undefined;
        },
      },
    },
  },
})
