import { SupabaseClient } from '@supabase/supabase-js';
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

export type TableInfo = {
  table_name: string;
  rls_enabled: boolean;
  schema: string;
};

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

const extractProjectRef = (url: string): string | null => {
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

export async function checkMFA(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    console.log('Starting MFA check');
    // Handle potential API changes in Supabase client
    let users = [];
    let listUsersError = null;
    
    try {
      // Try the current API format
      const response = await supabase.auth.admin.listUsers();
      users = response.data?.users || [];
      listUsersError = response.error;
    } catch (e) {
      console.error('Error using auth.admin.listUsers():', e);
      // Fallback to another method if available
      try {
        const response = await supabase.from('auth.users').select('*');
        users = response.data || [];
        listUsersError = response.error;
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        throw new Error('Could not access user data through any available method');
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

export async function checkRLS(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    console.log('Starting RLS check...');
    
    // Get a list of all tables in the public schema
    const { data: publicTables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');
    
    if (tablesError) {
      console.error('Error fetching tables:', tablesError);
      throw new Error(`Failed to query tables: ${tablesError.message}`);
    }
    
    if (!publicTables || publicTables.length === 0) {
      return {
        status: 'pass',
        message: 'No tables found.',
        details: [] as JSONValue
      };
    }
    
    console.log(`Found ${publicTables.length} public tables`);
    
    // Check each table for RLS by attempting to access it
    const tablesWithoutRLS = [];
    
    for (const table of publicTables) {
      const tableName = table.table_name;
      console.log(`Checking RLS for table: ${tableName}`);
      
      try {
        // Try to select from the table - if RLS is enabled and blocking access, we'll get a permission denied error
        const { error: selectError } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        // If we don't get a permission denied error, RLS might not be enabled or is allowing access
        if (!selectError || !selectError.message || !selectError.message.toLowerCase().includes('permission denied')) {
          console.log(`Table ${tableName} might not have RLS enabled (no permission error)`);
          tablesWithoutRLS.push(tableName);
        }
      } catch (e) {
        console.warn(`Error checking table ${tableName}:`, e);
      }
    }
    
    // If no tables were found without RLS, all tables have RLS enabled
    if (tablesWithoutRLS.length === 0) {
      return {
        status: 'pass',
        message: 'RLS enabled for all tables.',
        details: { tables_count: publicTables.length } as JSONValue
      };
    } else {
      // Some tables don't have RLS
      return {
        status: 'fail',
        message: `RLS not enabled for all tables. Tables without RLS: ${tablesWithoutRLS.join(', ')}`,
        details: { 
          tables_count: publicTables.length,
          tables_without_rls: tablesWithoutRLS,
          tables_without_rls_count: tablesWithoutRLS.length
        } as JSONValue
      };
    }
  } catch (error) {
    console.error('Error in checkRLS:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      status: 'error',
      message: 'Failed to check RLS: ' + errorMessage,
      details: { error: errorMessage } as JSONValue
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