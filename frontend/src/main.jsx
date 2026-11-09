import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'
import store from './store'
import { logout } from './store/authSlice'
import { setSessionFailureHandler } from './api/client'
import { disconnectSocket } from './socket'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''

setSessionFailureHandler(() => {
  store.dispatch(logout());
  disconnectSocket();
});

if (!googleClientId) {
  console.warn('VITE_GOOGLE_CLIENT_ID is not set in environment variables. Google OAuth will not work.');
  console.warn('Please create a .env file in the frontend directory with: VITE_GOOGLE_CLIENT_ID=your_client_id_here');
}

const rootElement = document.getElementById('root');

// Production builds place a crawlable static snapshot in #root. This app is
// still a client-rendered SPA, not a hydration build, so remove that snapshot
// immediately before React takes ownership of the container.
rootElement.replaceChildren();

createRoot(rootElement).render(
  <StrictMode>
    {googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>
        <Provider store={store}>
          <App />
        </Provider>
      </GoogleOAuthProvider>
    ) : (
      <Provider store={store}>
        <App />
      </Provider>
    )}
  </StrictMode>,
)
