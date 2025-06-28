import jwtDecode from 'jwt-decode';

export interface JwtPayload {
  ref?: string;
  exp: number;
  sub?: string;
  iss?: string;
  [key: string]: any;
}

/**
 * Decode JWT token and extract project reference
 * @param apiKey Supabase API Key
 * @returns Project reference and decoded payload
 */
export function decodeJwtAndGetProjectRef(apiKey: string): { projectRef: string; payload: JwtPayload } {
  try {
    const payload = jwtDecode<JwtPayload>(apiKey);
    const projectRef = payload.ref ||
      (payload.sub ? payload.sub.split(':')?.[0] : undefined) ||
      (payload.iss ? payload.iss.split('/')?.[3] : undefined);

    if (!projectRef) {
      throw new Error('Could not identify project reference');
    }

    return { projectRef, payload };
  } catch (e) {
    throw new Error('Invalid Supabase API Key');
  }
}

/**
 * Remove Bearer prefix from API key
 * @param apiKey Original API key
 * @returns Clean API key
 */
export function cleanApiKey(apiKey: string): string {
  return apiKey.startsWith('Bearer ') ? apiKey.substring(7) : apiKey;
}

/**
 * Check if JWT token is expired
 * @param payload JWT payload
 * @returns true if token is expired
 */
export function isTokenExpired(payload: JwtPayload): boolean {
  return payload.exp < Date.now() / 1000;
}

export const buttonStyles = {
  primary: {
    padding: '4px 8px',
    backgroundColor: '#3ECF8E',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  secondary: {
    padding: '4px 8px',
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  small: {
    marginLeft: '4px',
    padding: '0px 4px',
    backgroundColor: '#f0f0f0',
    color: '#555',
    border: '1px solid #ddd',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '9px',
    verticalAlign: 'middle'
  }
};

/**
 * Log errors to console in a consistent way
 * @param error Error object or string
 * @param context Optional context information
 */
export function logError(error: unknown, context?: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const contextPrefix = context ? `[${context}] ` : '';
  console.error(`${contextPrefix}Error: ${errorMessage}`);
}
