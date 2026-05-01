/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { ChefHat } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg">
        <ChefHat className="animate-bounce text-primary" size={48} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to correct dashboard if role mismatch
    const redirectPath = user.role === 'chef' ? '/chef/dashboard' : '/kids/home';
    return <Navigate to={redirectPath} replace />;
  }

  return <Outlet />;
}
