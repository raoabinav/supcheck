import { JSONValue } from '@/lib/checks';

/**
 * Client credentials for Supabase
 */
export interface ClientCredentials {
  url: string;
  serviceRoleKey: string;
}

/**
 * Full Supabase credentials including management API key
 */
export interface SupabaseCredentials extends ClientCredentials {
  managementApiKey: string;
}

/**
 * Detailed check result structure for different entity types
 */
export interface DetailedCheckResult {
  users?: Array<{
    email: string;
    status: string;
  }>;
  tables?: Array<{
    tableName: string;
    status: string;
  }>;
  projects?: Array<{
    projectName: string;
    status: string;
  }>;
}

/**
 * Check result structure for compliance checks
 */
export interface CheckResult {
  status: 'pass' | 'fail' | 'pending' | 'error';
  message: string;
  details: DetailedCheckResult | JSONValue | null;
}

/**
 * Evidence entry structure for the evidence log
 */
/**
 * Result of RLS check for a single table
 */
export interface RlsCheckResult {
  table: string;
  rlsDisabled: boolean;
  errorMessage?: string;
}

export interface EvidenceEntry {
  timestamp: string;
  check: string;
  status: string;
  details: string;
}

/**
 * Suggested fix structure for compliance issues
 */
export interface SuggestedFix {
  id: string;
  check: string;
  issue: string;
  suggestion: string;
  loading: boolean;
}
