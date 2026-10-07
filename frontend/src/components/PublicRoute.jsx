import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

function PublicRoute({ children }) {
  const { token, user } = useSelector((state) => state.auth);
  const [isChecking, setIsChecking] = useState(true);
  const [authenticatedUser, setAuthenticatedUser] = useState(null);

  useEffect(() => {
    const checkAuth = () => {
      // Check both Redux store and localStorage
      let authToken = token;
      let authUser = user;
      
      if (!authToken) {
        try {
          const stored = localStorage.getItem('auth');
          if (stored) {
            const auth = JSON.parse(stored);
            authToken = auth?.token;
            authUser = auth?.user;
          }
        } catch (err) {
          console.error('Error reading auth from localStorage:', err);
        }
      }

      setAuthenticatedUser(authToken ? authUser || {} : null);
      setIsChecking(false);
    };

    checkAuth();
  }, [token, user]);

  // Show nothing while checking to prevent flash
  if (isChecking) {
    return null;
  }

  // Admin accounts manage the platform rather than using the learner/teacher
  // dashboard, so their signed-in landing page is the admin overview.
  if (authenticatedUser) {
    const destination =
      authenticatedUser.role === 'admin' ? '/admin/transactions' : '/dashboard';
    return <Navigate to={destination} replace />;
  }

  return children;
}

export default PublicRoute;
