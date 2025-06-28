import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { callManagementApi } from './supabase';
import { SupabaseCredentials } from '@/types';

export type JSONValue = 
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

export type CheckResult = {
  status: 'pass' | 'fail' | 'pending' | 'error';
  details: JSONValue;
  message: string;
};

// Deprecated: kept for potential future use when we need more detailed table metadata
// interface PublicTableInfo {
//   table_name: string;
//   rls_enabled?: boolean;
//   schema: string;
// }


// Commented out as it's no longer used with the direct query approach
// Shape returned by Supabase Management API `/database/tables` endpoint
// type ManagementApiTable = {
//   name: string;
//   schema: string;
//   type: string; // e.g. "table", "view"
//   'rls_enabled'?: JSONValue;
//   [key: string]: JSONValue | undefined;
// };

type UserMFAStatus = {
  email: string | null | undefined;
  mfaEnabled: boolean;
};

type SubscriptionResponse = {
  tier: string;
  [key: string]: JSONValue;
};

type BackupInfo = {
  pitr_enabled: boolean;
  [key: string]: JSONValue;
};

export const extractProjectRef = (url: string): string | null => {
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : null;
};

const safeJsonValue = (error: unknown): JSONValue => {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack || '',
    };
  }
  return String(error);
};
//ideal output: list of users, pass or fail, some email info about users.
export async function checkMFA(supabase: SupabaseClient): Promise<CheckResult> {
  
  // admin (if not) -> each user level logic
  
  try {
    console.log('MFA CHECK');
    let users = [];
    let listUsersError = null;
    
    try {
      const response = await supabase.auth.admin.listUsers();
      users = response.data?.users || [];
      listUsersError = response.error;
    } catch (e) {
      console.error('Error using admin auth', e);
      
      try {
        const response = await supabase.from('auth.users').select('*');
        users = response.data || [];
        listUsersError = response.error;
      } catch (fallbackError) {
        console.error('Fallback (list of user auth) failed:', fallbackError);
        throw new Error('MFA Eror - regenerate keys');
      }
    }
    
    if (listUsersError) throw listUsersError;
    console.log(`Found ${users.length} users`);

    const userMFAStatus: UserMFAStatus[] = users.map(user => ({
      email: user.email || 'unknown',
      mfaEnabled: Boolean(user.factors?.length) || false,
    }));

    const allEnabled = userMFAStatus.length > 0 && userMFAStatus.every(user => user.mfaEnabled);
    const enabledCount = userMFAStatus.filter(user => user.mfaEnabled).length;

    return {
      status: allEnabled ? 'pass' : 'fail',
      details: userMFAStatus as JSONValue,
      message: allEnabled
        ? `MFA is enabled for all ${userMFAStatus.length} users`
        : `MFA is enabled for ${enabledCount} out of ${userMFAStatus.length} users`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to check MFA status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: safeJsonValue(error),
    };
  }
}

/* legacy heuristic RLS checker retained for reference but not used
// (removed legacy checkTableRls implementation)
//  • Successful read of many rows ⇒ RLS likely disabled
//  • Permission-denied error ⇒ RLS enabled (current key blocked)
//  • Any other error ⇒ bubble it up as diagnostic and mark as unknown (treat as enabled for safety)
//  try {
//    const { data, error } = await supabase
//      .from(table)
//      .select('*')
//      .limit(30);
//
//    // If PostgREST returned an explicit error object
//    if (error) {
//      const msg = error.message.toLowerCase();
//      const permissionDenied = msg.includes('permission') || msg.includes('authorization') || msg.includes('row level security');
//
//      return {
//        table,
//        rlsDisabled: !permissionDenied, // if we were blocked → RLS enabled (disabled=false)
//        errorMessage: permissionDenied
//          ? "RLS key doesn't have enough permissions"
//          : `Query error: ${error.message}`,
//      };
//    }
//
//    // No error – decide based on row count heuristic
//    if (data && data.length >= 30) {
//      return { table, rlsDisabled: true };
//    }
//
//    return { table, rlsDisabled: false };
//  } catch (err) {
//    console.error(`Error checking RLS for table ${table}:`, err);
//    return {
//      table,
//      rlsDisabled: false,
//      errorMessage: `Exception: ${err instanceof Error ? err.message : String(err)}`,
//    };
//  }
*/

// RlsCheckResult interface removed since we're using the Management API approach

/**
 * Interface for RLS check result per table
 */
interface RlsCheckResult {
  table: string;
  rlsDisabled: boolean;
  errorMessage?: string;
}

/**
 * Check RLS status using Management API (primary) or direct table queries (fallback)
 */
export async function checkRLS(
  supabase: SupabaseClient, 
  managementKey: string,
  customTables?: string[]
): Promise<CheckResult> {
  console.log('Starting RLS check...');

  // User must provide tables to check, otherwise return an error
  if (!customTables || customTables.length === 0) {
    console.error('No tables provided by user for RLS check');
    return {
      status: 'error',
      message: 'No tables provided for RLS check. Please specify tables to check.',
      details: { 
        error: 'Missing required parameter: tables to check'
      } as JSONValue,
    };
  }

  try {
    // First try the Management API approach if a management key is provided
    if (managementKey) {
      try {
        console.log('Attempting to check RLS using Management API...');
        return await checkRLSWithManagementAPI(supabase, managementKey, customTables);
      } catch (managementApiError) {
        console.warn('Management API approach failed, falling back to direct queries:', managementApiError);
        // Fall back to direct queries approach
      }
    } else {
      console.log('No management key provided, using direct table queries approach');
    }

    // Extract URL from supabase client for credentials object
    // @ts-expect-error - accessing internal properties
    const url = supabase.supabaseUrl || supabase.restUrl || supabase.authUrl?.replace('/auth/v1', '') || '';
    // @ts-expect-error - accessing internal properties
    const serviceRoleKey = supabase.supabaseKey || supabase.restKey || '';

    if (!url) {
      return {
        status: 'error',
        message: 'Could not extract project URL from Supabase client',
        details: {} as JSONValue,
      };
    }

    const projectRef = extractProjectRef(url);
    if (!projectRef) {
      return {
        status: 'error',
        message: 'Invalid Supabase URL. Unable to extract project reference.',
        details: { url } as JSONValue,
      };
    }

    console.log(`Creating new Supabase client for project: ${projectRef}`);
    
    // Create a new Supabase client with the extracted project reference
    const directClient = createClient(
      `https://${projectRef}.supabase.co`,
      serviceRoleKey
    );
    
    console.log('Using tables provided by user:', customTables);
    return await checkTablesRls(directClient, customTables);
  } catch (error) {
    console.error('Error in checkRLS:', error);
    
    return {
      status: 'error',
      message: `Failed to check RLS: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: error instanceof Error ? error.message : String(error) } as JSONValue
    };
  }
}

/**
 * Check RLS using the Management API approach
 */
async function checkRLSWithManagementAPI(
  supabase: SupabaseClient, 
  managementKey: string,
  customTables?: string[]
): Promise<CheckResult> {
  try {
    console.log('Starting RLS check with Management API...');
    
    // Extract URL from supabase client for credentials object
    // @ts-expect-error - accessing internal properties
    const supabaseUrl = supabase.supabaseUrl || supabase.restUrl || supabase.authUrl?.replace('/auth/v1', '') || '';
    
    const projectRef = extractProjectRef(supabaseUrl);
    if (!projectRef) {
      throw new Error('Unable to extract project reference from Supabase URL');
    }
    
    // Fetch list of tables
    const tablesResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/tables`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${managementKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!tablesResponse.ok) {
      const errorJson = await tablesResponse.json().catch(() => ({}));
      throw new Error(`Failed to retrieve tables: ${errorJson.message || tablesResponse.statusText}`);
    }
    
    interface ManagementApiTable {
      name: string;
      schema: string;
      type: string;
    }
    
    const tables: ManagementApiTable[] = await tablesResponse.json();
    const publicTables = tables.filter(t => t.schema === 'public' && t.type === 'table');
    
    // Filter to only include the tables the user wants to check
    const tablesToCheck = publicTables.filter(t => customTables?.includes(t.name));
    
    if (tablesToCheck.length === 0) {
      return {
        status: 'error',
        message: 'None of the specified tables were found in the database.',
        details: { 
          tables_requested: customTables,
          tables_available: publicTables.map(t => t.name)
        } as JSONValue,
      };
    }
    
    const tableNames = tablesToCheck.map(t => t.name);
    console.log(`Checking RLS for tables: ${tableNames.join(', ')}`);
    
    // Fetch policies
    const policiesResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/policies`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${managementKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!policiesResponse.ok) {
      const errJson = await policiesResponse.json().catch(() => ({}));
      throw new Error(`Failed to retrieve policies: ${errJson.message || policiesResponse.statusText}`);
    }
    
    interface Policy {
      table: string;
      name: string;
      definition: string;
      command: string;
      check: string;
    }
    
    const policies: Policy[] = await policiesResponse.json();
    const tablesWithPolicy = new Set(policies.map(p => p.table));
    
    const rlsResults = tableNames.map(tbl => ({
      table: tbl,
      rlsEnabled: tablesWithPolicy.has(tbl)
    }));
    
    const disabled = rlsResults.filter(r => !r.rlsEnabled);
    
    // Create detailed table results for UI display
    const tableResults = rlsResults.map(result => ({
      table: result.table,
      rlsEnabled: result.rlsEnabled,
      error: null,
    }));
    
    if (disabled.length === 0) {
      return {
        status: 'pass',
        message: `RLS enabled for all ${tableNames.length} tables checked.`,
        details: {
          tables_checked: tableNames.length,
          tables_checked_list: tableNames,
          table_results: tableResults,
        } as JSONValue,
      };
    }
    
    const failingTables = disabled.map(r => r.table).join(', ');
    
    return {
      status: 'fail',
      message: `RLS not enabled for ${disabled.length} of ${tableNames.length} tables: ${failingTables}`,
      details: {
        tables_checked: tableNames.length,
        tables_without_rls: disabled.map(t => t.table),
        failing_tables: failingTables,
        table_results: tableResults,
      } as JSONValue,
    };
  } catch (error) {
    console.error('Error in checkRLSWithManagementAPI:', error);
    throw error; // Let the main checkRLS function handle the error and fall back
  }
}

/**
 * Helper function to check RLS for a list of tables
 */
async function checkTablesRls(client: SupabaseClient, tables: string[]): Promise<CheckResult> {
  console.log(`Checking RLS for ${tables.length} tables...`);
  
  // No limit on number of tables - use what the user provided
  const tablesToCheck = tables;

  try {
    // Check each table for RLS status
    const results = await Promise.all(tablesToCheck.map(table => checkTableRls(client, table)));
    
    // If any table has RLS disabled, the check fails
    const tablesWithRlsDisabled = results.filter(result => result.rlsDisabled);
    const hasFailure = tablesWithRlsDisabled.length > 0;
    
    const failingTables = tablesWithRlsDisabled.map(r => r.table).join(', ');
    
    // Create detailed table results for UI display
    const tableResults = results.map(result => ({
      table: result.table,
      rlsEnabled: !result.rlsDisabled,
      error: result.errorMessage || null,
    }));
    
    return {
      status: hasFailure ? 'fail' : 'pass',
      message: hasFailure 
        ? `RLS is disabled on ${tablesWithRlsDisabled.length} tables: ${failingTables}` 
        : `RLS is enabled on all ${results.length} tables checked`,
      details: {
        tables_checked: results.length,
        tables_with_rls_disabled: tablesWithRlsDisabled.length,
        failing_tables: failingTables || null,
        table_results: tableResults, // Add detailed results for each table
      } as JSONValue,
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Error checking tables RLS: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: error instanceof Error ? error.message : String(error) } as JSONValue,
    };
  }
}

/**
 * Check RLS for a single table by querying it and checking RLS status
 */
async function checkTableRls(supabase: SupabaseClient, table: string): Promise<RlsCheckResult> {
  try {
    console.log(`Checking RLS for table: ${table}`);
    
    try {
      // First, try to directly query the table's RLS status from pg_class
      const { data, error } = await supabase
        .from('pg_tables')
        .select('has_table_privilege(current_user, tablename, \'SELECT\') as can_select')
        .eq('schemaname', 'public')
        .eq('tablename', table)
        .single();
      
      if (!error && data) {
        console.log(`Table ${table} access check:`, data);
        // If we can access the table metadata, we can check RLS more directly
        
        // Now check if RLS is enabled for this table
        const { data: rlsData, error: rlsError } = await supabase
          .from('pg_class')
          .select('relrowsecurity')
          .eq('relname', table)
          .single();
        
        if (!rlsError && rlsData) {
          console.log(`Table ${table} RLS status:`, rlsData);
          return {
            table,
            rlsDisabled: !rlsData.relrowsecurity,
          };
        }
      }
    } catch (metadataError) {
      console.warn(`Could not check table metadata directly:`, metadataError);
      // Continue to try other methods
    }
    
    // Try using raw SQL to check RLS status
    try {
      // Create a SQL query to check RLS status
      const sqlQuery = `
        SELECT 
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = '${table}'
      `;
      
      const { data: sqlData, error: sqlError } = await supabase.rpc('exec_sql', { sql: sqlQuery });
      
      if (!sqlError && Array.isArray(sqlData) && sqlData.length > 0) {
        console.log(`Table ${table} RLS status from SQL:`, sqlData[0]);
        return {
          table,
          rlsDisabled: !sqlData[0].rls_enabled,
        };
      } else {
        console.warn(`SQL query for RLS status failed:`, sqlError || 'No results');
      }
    } catch (sqlError) {
      console.warn(`Could not execute SQL to check RLS:`, sqlError);
      // Continue to try other methods
    }
    
    // Final fallback: Try to query the table with just 1 row
    // This is the least reliable method but can give us some indication
    try {
      const { data } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      console.log(`Table ${table} query returned ${data?.length || 0} rows`);
      
      // Since we've tried all other methods and they failed, we'll make a best guess
      // This is the original logic from before - if we can query the table, RLS might be disabled
      // This is not 100% accurate but is a last resort
      return { 
        table, 
        rlsDisabled: true,  // Assume RLS is disabled if we can query the table
        errorMessage: 'RLS status determined by fallback method. May not be accurate.' 
      };
    } catch (queryError) {
      // If we get a permission error, it might indicate RLS is enabled
      console.error(`Error querying table ${table}:`, queryError);
      return { 
        table, 
        rlsDisabled: false,  // Assume RLS is enabled if we can't query the table
        errorMessage: `Could not query table: ${queryError instanceof Error ? queryError.message : String(queryError)}` 
      };
    }
  } catch (error) {
    console.error(`Error checking table ${table}:`, error);
    return { 
      table, 
      rlsDisabled: false, 
      errorMessage: `Exception: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}


export async function checkPITR(credentials: SupabaseCredentials): Promise<CheckResult> {
  const projectRef = extractProjectRef(credentials.url);
  if (!projectRef) {
    return {
      status: 'error',
      message: 'Invalid Supabase URL. Unable to extract project reference.',
      details: { url: credentials.url } as JSONValue,
    };
  }

  try {
    let subscription: SubscriptionResponse;
    
    try {
      subscription = await callManagementApi(
        `projects/${projectRef}/subscription`,
        credentials
      ) as SubscriptionResponse;
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      error
    ) {
      return {
        status: 'fail',
        message: 'Point in Time Recovery (PITR) is not available on the free tier. Upgrade to Pro plan or higher to enable this feature.',
        details: {
          currentTier: 'free',
          recommendation: 'Upgrade to Pro plan or higher',
          learnMore: 'https://supabase.com/pricing'
        } as JSONValue,
      };
    }

    if (subscription.tier.toLowerCase() === 'free') {
      return {
        status: 'fail',
        message: 'Point in Time Recovery (PITR) is not available on the free tier. Upgrade to Pro plan or higher to enable this feature.',
        details: {
          currentTier: 'free',
          recommendation: 'Upgrade to Pro plan or higher',
          learnMore: 'https://supabase.com/pricing'
        } as JSONValue,
      };
    }

    try {
      const backupInfo = await callManagementApi(
        `projects/${projectRef}/database/backups/info`,
        credentials
      ) as BackupInfo;

      return {
        status: backupInfo.pitr_enabled ? 'pass' : 'fail',
        message: backupInfo.pitr_enabled
          ? 'Point in Time Recovery is enabled'
          : 'Point in Time Recovery is available but not enabled. You can enable it in your project settings.',
        details: {
          ...backupInfo,
          tier: subscription.tier,
          configuration: backupInfo.pitr_enabled ? 'enabled' : 'disabled'
        } as JSONValue,
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Point in Time Recovery is available but not configured. You can enable it in your project settings.',
        details: {
          tier: subscription.tier,
          recommendation: 'Configure PITR in project settings',
          error: error instanceof Error ? error.message : String(error)
        } as JSONValue,
      };
    }
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to check PITR status. Please verify your credentials and try again.',
      details: safeJsonValue(error),
    };
  }
}