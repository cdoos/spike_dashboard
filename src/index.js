import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import App from './App';
import Login from './pages/Login';
import Register from './pages/Register';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } 
          />
          <Route 
            path="/register" 
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            } 
          />
          
          {/* Protected routes */}
          <Route 
            path="/*" 
            element={
              <ProtectedRoute>
                <App />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

