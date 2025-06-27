'use client';

import React from 'react';
import { SupabaseCredentials } from '@/lib/supabase';

const { createContext, useContext, useState, useEffect } = React;

interface CredentialsContextType {
  credentials: SupabaseCredentials | null;
  setCredentials: (credentials: SupabaseCredentials | null) => void;
  clearCredentials: () => void;
  isAuthenticated: boolean;
}

const CredentialsContext = createContext<CredentialsContextType | undefined>(undefined);

export function CredentialsProvider({ children }: { children: React.ReactNode }) {
  const [credentials, setCredentialsState] = useState<SupabaseCredentials | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load credentials from session storage on mount
  useEffect(() => {
    const storedCredentials = sessionStorage.getItem('supabaseCredentials');
    if (storedCredentials) {
      try {
        const parsedCredentials = JSON.parse(storedCredentials);
        setCredentialsState(parsedCredentials);
      } catch (error) {
        console.error('Failed to parse stored credentials:', error);
        sessionStorage.removeItem('supabaseCredentials');
      }
    }
    setIsLoaded(true);
  }, []);

  // Update session storage when credentials change
  useEffect(() => {
    if (isLoaded) {
      if (credentials) {
        sessionStorage.setItem('supabaseCredentials', JSON.stringify(credentials));
      } else {
        sessionStorage.removeItem('supabaseCredentials');
      }
    }
  }, [credentials, isLoaded]);

  const setCredentials = (newCredentials: SupabaseCredentials | null) => {
    setCredentialsState(newCredentials);
  };

  const clearCredentials = () => {
    setCredentialsState(null);
  };

  return (
    <CredentialsContext.Provider
      value={{
        credentials,
        setCredentials,
        clearCredentials,
        isAuthenticated: !!credentials
      }}
    >
      {children}
    </CredentialsContext.Provider>
  );
}

export function useCredentials() {
  const context = useContext(CredentialsContext);
  if (context === undefined) {
    throw new Error('useCredentials must be used within a CredentialsProvider');
  }
  return context;
}
