import { createClient } from '@supabase/supabase-js';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// JWT related types and functions
export interface JwtPayload {
  exp: number;
  [key: string]: unknown;
}

/**
 * Decodes a JWT token and extracts the project reference
 * @param token The JWT token to decode
 * @returns An object containing the decoded payload and project reference
 */
export function decodeJwtAndGetProjectRef(token: string): { payload: JwtPayload; projectRef: string } {
  try {
    // JWT consists of three parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    // Decode the payload (second part)
    const payload = JSON.parse(atob(parts[1]));
    
    // Extract project reference from the payload
    // This assumes the project ref is in a specific claim in the JWT
    // Adjust according to Supabase JWT structure
    const projectRef = payload.iss?.split('/').pop() || '';
    
    if (!projectRef) {
      throw new Error('Could not extract project reference from token');
    }
    
    return { payload, projectRef };
  } catch (error) {
    throw new Error(`Failed to decode JWT: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Checks if a JWT token has expired
 * @param payload The JWT payload
 * @returns True if the token has expired, false otherwise
 */
export function isTokenExpired(payload: JwtPayload): boolean {
  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
}

/**
 * Logs an error with consistent formatting
 * @param error The error to log
 * @param context Additional context about where the error occurred
 */
export function logError(error: unknown, context: string = ''): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`Error${context ? ` in ${context}` : ''}: ${errorMessage}`);
}

/**
 * Utility function to conditionally join class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type SupabaseCredentials = {
  url: string;
  serviceRoleKey: string;
  managementApiKey: string;
};

export type ClientCredentials = Pick<SupabaseCredentials, 'url' | 'serviceRoleKey'>;

export const createSupabaseClient = ({ url, serviceRoleKey }: ClientCredentials) => {
  if (!url || !serviceRoleKey) {
    throw new Error('Missing required Supabase credentials: `url` or `serviceRoleKey`');
  }
  return createClient(url, serviceRoleKey);
};

export const callManagementApi = async (
  endpoint: string,
  { managementApiKey }: Pick<SupabaseCredentials, 'managementApiKey'>,
  options: RequestInit = {}
) => {
  if (!managementApiKey) {
    throw new Error('Missing required Supabase credential: `managementApiKey`');
  }

  try {
    const response = await fetch(`https://api.supabase.com/v1/${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${managementApiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(
        `Management API call failed: ${response.status} ${response.statusText}. Details: ${errorDetails}`
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error during Management API call: ${error.message}`);
    }
    throw new Error('An unknown error occurred during the Management API call.');
  }
};