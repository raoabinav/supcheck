import { createClient } from '@supabase/supabase-js';
import { SupabaseCredentials, ClientCredentials } from '@/types';

/**
 * Creates a Supabase client instance using the provided credentials
 * @param credentials The client credentials (URL and service role key)
 * @returns A Supabase client instance
 */
export const createSupabaseClient = ({ url, serviceRoleKey }: ClientCredentials) => {
  if (!url || !serviceRoleKey) {
    throw new Error('Missing required client credentials: `url` or `serviceRoleKey`');
  }
  // Fix: Use the options object format required by newer Supabase client versions
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

/**
 * Calls the Supabase Management API with the provided endpoint and credentials
 * @param endpoint The API endpoint to call
 * @param credentials The credentials containing the management API key
 * @param options Additional fetch options
 * @returns The API response as JSON
 */
export const callManagementApi = async (
  endpoint: string,
  { managementApiKey }: Pick<SupabaseCredentials, 'managementApiKey'>,
  options: RequestInit = {}
) => {
  if (!managementApiKey) {
    throw new Error('Missing required management API key');
  }

  const response = await fetch(`https://api.supabase.com/v1/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${managementApiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call failed: ${response.status} ${response.statusText}. ${errorText}`);
  }

  return response.json();
};
