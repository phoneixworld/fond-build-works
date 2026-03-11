import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import Spinner from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

const AuthContext = createContext();

const API_BASE_URL = window.__SUPABASE_URL__;
const API_KEY = window.__SUPABASE_KEY__;
const PROJECT_ID = window.__PROJECT_ID__;

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      if (!API_BASE_URL || !API_KEY || !PROJECT_ID) {
        throw new Error("API configuration missing. Cannot log in.");
      }

      const response = await fetch(`${API_BASE_URL}/functions/v1/project-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          project_id: PROJECT_ID,
          action: "login",
          email,
          password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Login failed");
      }

      const data = await response.json();
      localStorage.setItem("authToken", data.access_token);
      setUser({ id: data.user.id, email: data.user.email, role: data.user.role || "user" });
      addToast("Login successful!", "success");
      return true;
    } catch (error) {
      console.error("Login error:", error);
      addToast(error.message, "error");
      setUser(null);
      localStorage.removeItem("authToken");
      return false;
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const signup = useCallback(async (email, password) => {
    setLoading(true);
    try {
      if (!API_BASE_URL || !API_KEY || !PROJECT_ID) {
        throw new Error("API configuration missing. Cannot sign up.");
      }

      const response = await fetch(`${API_BASE_URL}/functions/v1/project-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          project_id: PROJECT_ID,
          action: "signup",
          email,
          password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Signup failed");
      }

      const data = await response.json();
      localStorage.setItem("authToken", data.access_token);
      setUser({ id: data.user.id, email: data.user.email, role: data.user.role || "user" });
      addToast("Signup successful! You are now logged in.", "success");
      return true;
    } catch (error) {
      console.error("Signup error:", error);
      addToast(error.message, "error");
      setUser(null);
      localStorage.removeItem("authToken");
      return false;
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const logout = useCallback(() => {
    localStorage.removeItem("authToken");
    setUser(null);
    addToast("Logged out successfully.", "info");
  }, [addToast]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    if (!API_BASE_URL || !API_KEY || !PROJECT_ID) {
      console.warn("Auth check skipped: Missing API configuration.");
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/functions/v1/project-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          project_id: PROJECT_ID,
          action: "me",
          access_token: token,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Auth check failed:", errorData.message || "Unknown error");
        logout();
        return;
      }

      const data = await response.json();
      setUser({ id: data.user.id, email: data.user.email, role: data.user.role || "user" });
    } catch (error) {
      console.error("Auth check error:", error);
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[var(--color-bg)]">
        <Spinner />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export { AuthProvider, useAuth };