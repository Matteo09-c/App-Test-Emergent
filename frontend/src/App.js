import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import Login from './pages/Login';
import CoachDashboard from './pages/CoachDashboard';
import AthleteDashboard from './pages/AthleteDashboard';
import AthleteProfile from './pages/AthleteProfile';
import { AuthProvider, useAuth } from './context/AuthContext';
import './App.css';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary text-xl font-mono">LOADING...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            {user?.role === 'athlete' ? (
              <Navigate to="/athlete" replace />
            ) : (
              <Navigate to="/coach" replace />
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/coach"
        element=(
          <ProtectedRoute allowedRoles={['coach', 'super_admin']}>
            <CoachDashboard />
          </ProtectedRoute>
        )
      />
      <Route
        path="/athlete"
        element={
          <ProtectedRoute allowedRoles={['athlete']}>
            <AthleteDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/athlete/:athleteId"
        element={
          <ProtectedRoute>
            <AthleteProfile />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="App">
          <AppRoutes />
          <Toaster position="top-right" />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;