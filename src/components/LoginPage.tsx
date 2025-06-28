'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

const { useState } = React;
import { type SupabaseCredentials } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCredentials } from '@/context/CredentialsContext';

type KeyField = 'serviceRoleKey' | 'managementApiKey';

type ValidationErrors = {
  url: string;
  serviceRoleKey: string;
  managementApiKey: string;
};

const INITIAL_CREDENTIALS: SupabaseCredentials = {
  url: '',
  serviceRoleKey: '',
  managementApiKey: ''
};

const INITIAL_VALIDATION_ERRORS: ValidationErrors = {
  url: '',
  serviceRoleKey: '',
  managementApiKey: ''
};

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState<SupabaseCredentials>(INITIAL_CREDENTIALS);
  const [showKeys, setShowKeys] = useState({
    serviceRoleKey: false,
    managementApiKey: false
  });
  // We'll keep the validation errors but only show them after submit
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(INITIAL_VALIDATION_ERRORS);
  const [showErrors, setShowErrors] = useState(false);

  const extractProjectRef = (url: string): string | null => {
    const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
    return match ? match[1] : null;
  };

  const validateField = (field: string, value: string): string => {
    switch (field) {
      case 'url':
        if (value && !value.includes('supabase.co')) {
          return 'Must be a valid Supabase URL (e.g., https://project.supabase.co)';
        }
        break;
      case 'serviceRoleKey':
        if (value && !value.startsWith('eyJ')) {
          return 'Service Role Key must start with "eyJ"';
        }
        break;
      case 'managementApiKey':
        if (value && !value.startsWith('sbp_')) {
          return 'Management API Key must start with "sbp_"';
        }
        break;
    }
    return '';
  };

  const handleInputChange = (field: keyof SupabaseCredentials, value: string) => {
    setCredentials((prev: SupabaseCredentials) => ({ ...prev, [field]: value }));
    setValidationErrors(prev => ({
      ...prev,
      [field]: validateField(field, value)
    }));
  };

  const toggleKeyVisibility = (field: KeyField) => {
    setShowKeys(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const validateCredentials = (): boolean => {
    const projectRef = extractProjectRef(credentials.url);
    if (!credentials.url.includes('supabase.co') || !projectRef) {
      setError('Invalid Project URL. Must be a Supabase URL (e.g., https://project.supabase.co)');
      return false;
    }
    if (!credentials.serviceRoleKey.startsWith('eyJ')) {
      setError('Invalid Service Role Key. Must start with "eyJ"');
      return false;
    }
    // Management API key will be entered later in the dashboard
    setError('');
    return true;
  };

  const { setCredentials: setContextCredentials } = useCredentials();

  const handleLogin = async () => {
    setShowErrors(true); // Show errors on submit
    
    if (!validateCredentials()) return;
    
    try {
      setLoading(true);
      setError('');

      // Set credentials in context
      setContextCredentials(credentials);
      
      // Navigate to dashboard
      router.push('/dashboard');
    } catch (error) {
      setError(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md">
        <Card className="w-full bg-white border border-black">
          <CardHeader>
            {/* Title removed as per requirements */}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Project URL Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-black">Project URL</label>
              </div>
              <div className="relative">
                <Input
                  className="w-full border-black text-black"
                  value={credentials.url}
                  onChange={(e) => handleInputChange('url', e.target.value)}
                  placeholder="https://your-project.supabase.co"
                />
              </div>
            </div>

            {/* Service Role Key Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-black">Service Role Key</label>
                <Button
                  type="button"
                  variant={showKeys.serviceRoleKey ? "outline" : "default"}
                  size="sm"
                  className={`h-6 px-2 py-0 text-xs ${showKeys.serviceRoleKey 
                    ? 'border-black text-black' 
                    : 'bg-black text-white hover:bg-gray-800'}`}
                  onClick={() => toggleKeyVisibility('serviceRoleKey')}
                >
                  {showKeys.serviceRoleKey ? 'Hide' : 'Unhide'}
                </Button>
              </div>
              <div className="relative">
                <Input
                  className="w-full border-black text-black"
                  type={showKeys.serviceRoleKey ? 'text' : 'password'}
                  value={credentials.serviceRoleKey}
                  onChange={(e) => handleInputChange('serviceRoleKey', e.target.value)}
                  placeholder="eyJhbG..."
                />
              </div>
            </div>

            {/* Management API Key input removed - will be added in Dashboard */}

            <Button
              className="w-full mt-4 bg-black text-white hover:bg-gray-800"
              onClick={handleLogin}
              disabled={loading || !credentials.url || !credentials.serviceRoleKey}
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </CardContent>
        </Card>

        {/* Combined Error Display - only shown after submit */}
        {showErrors && (Object.values(validationErrors).some(err => err) || error) && (
          <Alert variant="destructive" className="mt-4 bg-white text-black border border-black">
            <AlertDescription>
              {error || (
                <>
                  ERROR - {validationErrors.url && 'Project URL is incorrect. '}
                  {validationErrors.serviceRoleKey && 'Service Role Key is incorrect. '}
                  {/* Management API Key validation removed */}
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
