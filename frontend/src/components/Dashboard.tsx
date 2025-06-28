'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

const { useState, useEffect } = React;
import { CheckResult, DetailedCheckResult, EvidenceEntry, SuggestedFix } from '@/types';
import { createSupabaseClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { extractProjectRef } from '@/lib/checks';
import { useCredentials } from '@/context/CredentialsContext';
import { 
  checkMFA, 
  checkRLS, 
  checkPITR, 
  type JSONValue 
} from '@/lib/checks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { HelpCircle } from 'lucide-react';
import EntityList from './EntityList';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EvidenceLog from '@/components/EvidenceLog';


type Results = {
  mfa: CheckResult;
  rls: CheckResult;
  pitr: CheckResult;
};

// Using EvidenceEntry and SuggestedFix types from @/types

const INITIAL_RESULTS: Results = {
  mfa: { status: 'pending', message: 'MFA check pending...', details: null },
  rls: { status: 'pending', message: 'RLS check pending...', details: null },
  pitr: { status: 'pending', message: 'PITR check pending...', details: null }
};

export default function Dashboard() {
  const router = useRouter();
  const { credentials, clearCredentials, setCredentials } = useCredentials();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Results>(INITIAL_RESULTS);
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  // Help text for each check
  const helpTexts = {
    mfa: "Multi-Factor Authentication adds an extra layer of security to user accounts by requiring a second verification method beyond just a password.",
    rls: "Row Level Security restricts which rows in a database table a user can access, ensuring users only see data they're authorized to view.",
    pitr: "Point in Time Recovery allows you to restore your database to any point in time within the retention period, protecting against accidental data loss."
  };
  const [suggestedFixes, setSuggestedFixes] = useState<SuggestedFix[]>([]);
  
  // Custom tables for RLS check
  const [useCustomTables, setUseCustomTables] = useState(false);
  const [customTables, setCustomTables] = useState('');
  
  // Section visibility states
  const [visibleSections, setVisibleSections] = useState({
    projectInfo: true,
    mfa: true,
    rls: true,
    pitr: true,
    evidenceLog: true,
    checks: true
  });
  
  // State for showing/hiding sensitive credentials
  const [showServiceRoleKey, setShowServiceRoleKey] = useState(false);
  
  // State for management API key input
  const [managementApiKey, setManagementApiKey] = useState('');
  const [managementApiKeyError, setManagementApiKeyError] = useState('');
  const [showManagementApiKey, setShowManagementApiKey] = useState(false);
  
  // State for OpenAI API key input
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [openAIApiKeyError, setOpenAIApiKeyError] = useState('');
  const [showOpenAIApiKey, setShowOpenAIApiKey] = useState(false);
  const [openAIApiKeySaved, setOpenAIApiKeySaved] = useState(false);

  const validateManagementApiKey = (key: string): boolean => {
    if (!key) {
      setManagementApiKeyError('Management API Key is required');
      return false;
    }
    if (!key.startsWith('sbp_')) {
      setManagementApiKeyError('Management API Key must start with "sbp_"');
      return false;
    }
    setManagementApiKeyError('');
    return true;
  };

  const saveManagementApiKey = () => {
    if (!validateManagementApiKey(managementApiKey)) return;
    
    // Update credentials in context
    if (credentials) {
      const updatedCredentials = {
        ...credentials,
        managementApiKey
      };
      // Update credentials in context
      setCredentials(updatedCredentials); // Set updated credentials with management API key
    }
  };

  const handleRunChecks = async () => {
    if (!credentials) {
      setError('No valid credentials found. Please log in again.');
      return;
    }
    
    // Validate management API key before running checks
    if (!validateManagementApiKey(managementApiKey)) {
      setError('Please enter a valid Management API Key before running checks');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      setEvidence([]);
      setSuggestedFixes([]);
      
      // Create Supabase client with updated credentials including management API key
      const supabaseCredentials = {
        ...credentials,
        managementApiKey
      };
      const supabase = createSupabaseClient(supabaseCredentials);
      
      const createErrorResult = (e: Error): CheckResult => ({
        status: 'error',
        message: e.message,
        details: {
          message: e.message,
          stack: e.stack || '',
          name: e.name
        } as JSONValue
      });

      // Process custom tables - this is now the primary method for RLS checks
      let customTablesList: string[] | undefined;
      if (customTables.trim()) {
        customTablesList = customTables
          .split(',')
          .map(table => table.trim())
          .filter(table => table.length > 0);
        
        if (customTablesList && customTablesList.length > 0) {
          // Add to evidence log
          const timestamp = new Date().toISOString();
          setEvidence(prev => [
            ...prev,
            { 
              timestamp, 
              check: 'RLS', 
              status: 'info', 
              details: `Using custom tables for RLS check: ${customTablesList?.join(', ') || ''}` 
            },
          ]);
        } else {
          // No valid tables in the input
          const timestamp = new Date().toISOString();
          setEvidence(prev => [
            ...prev,
            { 
              timestamp, 
              check: 'RLS', 
              status: 'warning', 
              details: `No valid table names found in custom tables input. Please enter comma-separated table names.` 
            },
          ]);
          customTablesList = undefined;
        }
      } else {
        // No custom tables provided
        const timestamp = new Date().toISOString();
        setEvidence(prev => [
          ...prev,
          { 
            timestamp, 
            check: 'RLS', 
            status: 'warning', 
            details: `No custom tables provided. Please specify tables to check for RLS.` 
          },
        ]);
      }
      
      const [mfaResult, rlsResult, pitrResult] = await Promise.all([
        checkMFA(supabase).catch((e: Error) => createErrorResult(e)),
        checkRLS(supabase, managementApiKey, customTablesList).catch((e: Error) => createErrorResult(e)),
        checkPITR(supabaseCredentials).catch((e: Error) => createErrorResult(e))
      ]);

      const timestamp = new Date().toISOString();
      setEvidence(prev => [
        ...prev,
        { timestamp, check: 'MFA', status: mfaResult.status, details: mfaResult.message },
        { timestamp, check: 'RLS', status: rlsResult.status, details: rlsResult.message },
        { timestamp, check: 'PITR', status: pitrResult.status, details: pitrResult.message },
      ]);
      setResults({ mfa: mfaResult, rls: rlsResult, pitr: pitrResult });
    } catch (error) {
      console.error('Error running checks:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to run checks: ${errorMessage}`);
      
      // Add the error to evidence log for visibility
      const timestamp = new Date().toISOString();
      setEvidence(prev => [
        ...prev,
        { timestamp, check: 'System', status: 'error', details: `Error: ${errorMessage}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Redirect to login if no credentials found
  useEffect(() => {
    if (!credentials) {
      router.push('/');
    } else if (credentials.managementApiKey) {
      // If we already have a management API key (from previous session), use it
      setManagementApiKey(credentials.managementApiKey);
    }
    
    // Load OpenAI API key from localStorage on component mount
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
      setOpenAIApiKey(savedKey);
    }
  }, [credentials, router]);

  const handleLogout = () => {
    // Clear credentials from context
    clearCredentials();
    // Redirect to login page
    router.push('/');
  };

  const clearEvidence = () => {
    if (window.confirm('Are you sure you want to clear all evidence logs?')) {
      setEvidence([]);
      setSuggestedFixes([]);
    }
  };
  
  const validateOpenAIApiKey = (key: string): boolean => {
    if (!key) {
      setOpenAIApiKeyError('OpenAI API Key is required');
      return false;
    }
    if (!key.startsWith('sk-')) {
      setOpenAIApiKeyError('OpenAI API Key must start with "sk-"');
      return false;
    }
    setOpenAIApiKeyError('');
    return true;
  };
  
  const saveOpenAIApiKey = () => {
    if (!validateOpenAIApiKey(openAIApiKey)) return;
    
    // Save to localStorage for persistence
    localStorage.setItem('openai_api_key', openAIApiKey);
    setOpenAIApiKeySaved(true);
    
    // Show success message briefly
    setTimeout(() => {
      setOpenAIApiKeySaved(false);
    }, 3000);
  };
  
  /**
   * Updates the TABLES_WITH_PII constant in constants.ts with tables from the database
   */
  const handleUpdateTablesList = async () => {
    if (!credentials) {
      setError('No valid credentials found. Please log in again.');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      // Add to evidence log
      const timestamp = new Date().toISOString();
      setEvidence(prev => [
        ...prev,
        { 
          timestamp, 
          check: 'RLS', 
          status: 'info', 
          details: 'Updating tables list for RLS check...' 
        },
      ]);
      
      // Extract URL and service role key from credentials
      const url = credentials.url;
      const serviceRoleKey = credentials.serviceRoleKey;
      
      const projectRef = extractProjectRef(url);
      if (!projectRef) {
        throw new Error('Invalid Supabase URL. Unable to extract project reference.');
      }
      
      // Create a new Supabase client with the extracted project reference
      const directClient = createClient(
        `https://${projectRef}.supabase.co`,
        serviceRoleKey
      );
      
      // Try multiple methods to get tables
      let tableNames: string[] = [];
      
      // Method 1: Try using RPC function if available
      try {
        const { data, error } = await directClient.rpc('get_tables', {});
        if (!error && data && Array.isArray(data) && data.length > 0) {
          tableNames = data;
          console.log(`Found ${tableNames.length} tables using RPC:`, tableNames);
        } else if (error) {
          console.warn('RPC get_tables not available:', error);
        }
      } catch (rpcError) {
        console.warn('Error using RPC get_tables:', rpcError);
      }
      
      // Method 2: Try information_schema if RPC failed
      if (tableNames.length === 0) {
        try {
          console.log('Trying information_schema.tables...');
          const { data: tables, error: tablesError } = await directClient
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .eq('table_type', 'BASE TABLE');

          if (!tablesError && tables && tables.length > 0) {
            tableNames = tables.map((row: { table_name: string }) => row.table_name);
            console.log(`Found ${tableNames.length} tables from information_schema:`, tableNames);
          } else if (tablesError) {
            console.warn('Error using information_schema:', tablesError);
          }
        } catch (schemaError) {
          console.warn('Exception querying information_schema:', schemaError);
        }
      }
      
      // Method 3: Fallback to querying specific tables directly
      if (tableNames.length === 0) {
        try {
          console.log('Trying direct table queries...');
          // Import the constant directly to avoid circular dependencies
          const { TABLES_WITH_PII } = await import('../lib/rls_logic/constants');
          
          // Try to query each table to see if it exists
          const existingTables = [];
          for (const tableName of TABLES_WITH_PII) {
            try {
              const { error } = await directClient
                .from(tableName)
                .select('*', { head: true });
              
              if (!error) {
                existingTables.push(tableName);
              }
            } catch {
              // Table doesn't exist or can't be queried
            }
          }
          
          if (existingTables.length > 0) {
            tableNames = existingTables;
            console.log(`Found ${tableNames.length} existing tables by direct query:`, tableNames);
          }
        } catch (fallbackError) {
          console.warn('Error in fallback table detection:', fallbackError);
        }
      }
      
      if (tableNames.length === 0) {
        const timestamp = new Date().toISOString();
        setEvidence(prev => [
          ...prev,
          { 
            timestamp, 
            check: 'RLS', 
            status: 'error', 
            details: 'Failed to find any tables in the database' 
          },
        ]);
        return;
      }
      
      // Log the updated tables list
      const newTimestamp = new Date().toISOString();
      setEvidence(prev => [
        ...prev,
        { 
          timestamp: newTimestamp, 
          check: 'RLS', 
          status: 'info', 
          details: `Updated tables list: ${tableNames.join(', ')}` 
        },
      ]);
      
      // In a real implementation, this would update the constants.ts file
      // For now, we just log the intended changes
      setEvidence(prev => [
        ...prev,
        { 
          timestamp: newTimestamp, 
          check: 'RLS', 
          status: 'info', 
          details: `Would update TABLES_WITH_PII in constants.ts with: ${tableNames.join(', ')}` 
        },
      ]);
      
      // Update the custom tables input field with the found tables
      setCustomTables(tableNames.join(', '));
      setUseCustomTables(true);
      
    } catch (error) {
      console.error('Failed to update tables list:', error);
      const timestamp = new Date().toISOString();
      setEvidence(prev => [
        ...prev,
        { 
          timestamp, 
          check: 'RLS', 
          status: 'error', 
          details: `Failed to update tables list: ${error instanceof Error ? error.message : String(error)}` 
        },
      ]);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAnalyzeIssues = async () => {
    try {
      // Check if OpenAI API key is provided
      if (!openAIApiKey) {
        setError('Please provide an OpenAI API key before analyzing issues');
        return;
      }
      
      // Create a new suggested fix for each failed check
      const newSuggestions: SuggestedFix[] = [];
      
      Object.entries(results).forEach(([checkType, result]) => {
        if (result.status === 'fail') {
          const id = `${checkType}-${Date.now()}`;
          newSuggestions.push({
            id,
            check: checkType === 'mfa' ? 'MFA' : checkType === 'rls' ? 'RLS' : 'PITR',
            issue: result.message,
            suggestion: '',
            loading: true
          });
        }
      });
      
      if (newSuggestions.length === 0) {
        setError('No failed checks to analyze');
        return;
      }
      
      setSuggestedFixes(newSuggestions);
      
      // Get detailed info from evidence logs
      const detailedInfo = evidence
        .filter(e => e.status === 'fail')
        .map(e => `${e.check}: ${e.details}`)
        .join('\n\n');
      
      // For each suggestion, call the API with detailed context
      for (const suggestion of newSuggestions) {
        try {
          const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-OpenAI-Key': openAIApiKey // Pass the API key in a header
            },
            body: JSON.stringify({
              message: {
                role: 'user',
                content: `I have a Supabase compliance issue with ${suggestion.check}: ${suggestion.issue}.
                
Here are the details of the issue: ${detailedInfo || 'No additional details available'}
                
Please provide specific, actionable steps to fix this issue, including any code or SQL examples that would help implement the solution.`
              }
            }),
          });
          
          if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
          }
          
          const data = await response.json();
          
          setSuggestedFixes(prev => 
            prev.map(fix => 
              fix.id === suggestion.id 
                ? { ...fix, suggestion: data.content, loading: false }
                : fix
            )
          );
          
          // Add to evidence log
          const timestamp = new Date().toISOString();
          setEvidence(prev => [
            ...prev,
            { 
              timestamp, 
              check: 'AI Analysis', 
              status: 'info', 
              details: `Generated fix suggestion for ${suggestion.check}` 
            },
          ]);
          
        } catch (error) {
          console.error(`Error analyzing ${suggestion.check}:`, error);
          setSuggestedFixes(prev => 
            prev.map(fix => 
              fix.id === suggestion.id 
                ? { ...fix, suggestion: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, loading: false }
                : fix
            )
          );
          
          // Add error to evidence log
          const timestamp = new Date().toISOString();
          setEvidence(prev => [
            ...prev,
            { 
              timestamp, 
              check: 'AI Analysis', 
              status: 'error', 
              details: `Error generating fix for ${suggestion.check}: ${error instanceof Error ? error.message : 'Unknown error'}` 
            },
          ]);
        }
      }
    } catch (error) {
      console.error('Error analyzing issues:', error);
    }
  };



  // Toggle section visibility
  const toggleSectionVisibility = (section: keyof typeof visibleSections) => {
    setVisibleSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Render functions
  const renderCheckDetails = (result: CheckResult, checkType: string) => {
    if (result.status === 'error') {
      return (
        <Alert variant="destructive" className="mt-2 bg-white text-black border border-black">
          <AlertDescription>
            {result.message}
            <details className="mt-2">
              <summary className="cursor-pointer">Technical Details</summary>
              <pre className="mt-2 whitespace-pre-wrap text-sm">
                {JSON.stringify(result.details, null, 2)}
              </pre>
            </details>
          </AlertDescription>
        </Alert>
      );
    }

    // Render entity list based on check type
    const renderEntityList = () => {
      if (!result.details) return null;
      
      switch (checkType) {
        case 'mfa':
          const users = result.details as Array<{ email: string; mfaEnabled: boolean }>;
          if (!users || users.length === 0) return null;
          
          return (
            <div className="mt-4 border border-gray-200 rounded-md p-2 bg-white">
              <h4 className="font-medium mb-2 text-black">User MFA Status ({users.length} users)</h4>
              <div className="overflow-auto max-h-60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">MFA Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-2">{user.email || 'Unknown'}</td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${user.mfaEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {user.mfaEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
          
        case 'rls':
          // Check if table_results exists in the details
          const details = result.details as JSONValue;
          if (details && typeof details === 'object' && 'table_results' in details) {
            const tableResults = details.table_results as Array<{ table: string; rlsEnabled: boolean; error: string | null }>;
            if (!tableResults || tableResults.length === 0) return null;
            
            return (
              <div className="mt-4 border border-gray-200 rounded-md p-2 bg-white">
                <h4 className="font-medium mb-2 text-black">Table RLS Status ({tableResults.length} tables)</h4>
                <div className="overflow-auto max-h-60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-2">Table Name</th>
                        <th className="text-left p-2">RLS Status</th>
                        <th className="text-left p-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableResults.map((tableResult, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="p-2 font-mono text-xs">{tableResult.table}</td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${tableResult.rlsEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {tableResult.rlsEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td className="p-2 text-xs text-gray-600">
                            {tableResult.error ? `Error: ${tableResult.error}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }
          return null;
          
        case 'pitr':
          const pitrDetails = result.details as DetailedCheckResult;
          return pitrDetails.projects ? (
            <EntityList 
              entities={pitrDetails.projects} 
              entityType="projects" 
              statusField="status" 
              nameField="projectName" 
            />
          ) : null;
          
        default:
          return null;
      }
    };

    return (
      <div className="mt-2">
        <p className="text-sm text-black">{result.message}</p>
        {renderEntityList()}
      </div>
    );
  };

  // No longer needed as we're using tooltips instead

  const renderCheckStatus = (key: string, result: CheckResult) => (
    <div key={key} className="border border-black rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center">
          <h3 className="text-lg font-bold text-black">
            {key === 'mfa' && 'Multi-Factor Authentication (MFA)'}
            {key === 'rls' && (
              <div className="flex items-center">
                <span>Row Level Security (RLS)</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUpdateTablesList}
                  className="ml-2 h-6 px-2 py-0 text-xs border-black text-black hover:bg-gray-100"
                >
                  Update Tables List
                </Button>
              </div>
            )}
            {key === 'pitr' && 'Point in Time Recovery (PITR)'}
          </h3>
          <div className="tooltip ml-2">
            <HelpCircle size={16} />
            <span className="tooltip-text">{helpTexts[key as keyof typeof helpTexts]}</span>
          </div>
        </div>
        <Button
          variant={visibleSections[key as keyof typeof visibleSections] ? "outline" : "default"}
          size="sm"
          onClick={() => toggleSectionVisibility(key as keyof typeof visibleSections)}
          className={`h-6 px-2 py-0 text-xs ${visibleSections[key as keyof typeof visibleSections] 
            ? 'border-black text-black' 
            : 'bg-black text-white hover:bg-gray-800'}`}
        >
          {visibleSections[key as keyof typeof visibleSections] ? 'Hide' : 'Show'}
        </Button>
      </div>
      
      {visibleSections[key as keyof typeof visibleSections] && (
        <>
          {key === 'rls' && (
            <div className="mb-3 border border-gray-200 rounded-md p-3 bg-gray-50">
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="useCustomTables"
                  checked={useCustomTables}
                  onChange={(e) => setUseCustomTables(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="useCustomTables" className="text-sm font-medium text-black">
                  Use custom tables for RLS check
                </label>
              </div>
              {useCustomTables && (
                <div className="flex flex-col space-y-2">
                  <textarea
                    value={customTables}
                    onChange={(e) => setCustomTables(e.target.value)}
                    placeholder="Enter table names separated by commas (e.g., users, profiles, orders)"
                    className="w-full p-2 border border-gray-300 rounded text-sm text-black"
                    rows={3}
                  />
                  <div className="text-xs text-gray-500">
                    These tables will be checked instead of the default list. Enter table names separated by commas.
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-row">
            {/* Status column on the left */}
            <div className="w-1/4 pr-4">
              <div
                className={`flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium w-full ${
                  result.status === 'pass'
                    ? 'status-pass text-green-800 border border-green-300 bg-green-50'
                    : result.status === 'fail'
                    ? 'status-fail text-red-800 border border-red-300 bg-red-50'
                    : result.status === 'error'
                    ? 'status-error text-orange-800 border border-orange-300 bg-orange-50'
                    : 'bg-white text-black border border-black'
                }`}
              >
                {result.status.toUpperCase()}
              </div>
            </div>
            
            {/* Details column on the right */}
            <div className="w-3/4">
              {renderCheckDetails(result, key)}
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (!credentials) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto">
          <Card className="bg-white border border-black">
            <CardContent className="p-6">
              <p className="text-black text-center">Loading credentials...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Top bar with project info and logout */}
      <div className="flex justify-between items-center mb-6 border-b border-black pb-4">
        <h2 className="text-xl font-bold text-black">Supabase Compliance Tool</h2>
        <div className="flex items-center space-x-4">
          <div className="flex flex-col items-end">
            <div className="flex items-center space-x-2">
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black mr-2"><strong>Project URL:</strong></span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSectionVisibility('projectInfo')}
                    className="border-black text-black hover:bg-gray-100 text-xs h-6 px-2 py-0 ml-1"
                  >
                    {visibleSections.projectInfo ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {visibleSections.projectInfo && (
                  <span className="text-sm text-black">{credentials.url}</span>
                )}
              </div>
              
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black mr-2"><strong>Service Role Key:</strong></span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowServiceRoleKey(!showServiceRoleKey)}
                    className="border-black text-black hover:bg-gray-100 text-xs h-6 px-2 py-0 ml-1"
                  >
                    {showServiceRoleKey ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {showServiceRoleKey && (
                  <span className="text-sm text-black font-mono">{credentials.serviceRoleKey}</span>
                )}
                {!showServiceRoleKey && credentials.serviceRoleKey && (
                  <span className="text-sm text-black font-mono">••••••••••••••••</span>
                )}
              </div>
            </div>
          </div>
          <Button 
            onClick={handleLogout}
            variant="outline"
            className="border-black text-black hover:bg-gray-100"
          >
            Logout
          </Button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mb-4 bg-red-50 border border-red-500 text-red-800">
          <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
        </Alert>
      )}
      
      {/* API Keys Input Section */}
      <Card className="bg-white border border-black mb-6">
        <CardHeader className="p-4 border-b border-black">
          <h3 className="text-lg font-bold text-black">API Keys</h3>
        </CardHeader>
        <CardContent className="p-4">
          {/* Management API Key Input */}
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4 mb-6">
            <div className="w-full md:w-2/3">
              <div className="flex flex-col space-y-1">
                <label className="text-sm font-medium text-black">Management API Key</label>
                <div className="flex items-center space-x-2">
                  <Input
                    className="w-full border-black text-black"
                    type={showManagementApiKey ? 'text' : 'password'}
                    value={managementApiKey}
                    onChange={(e) => {
                      setManagementApiKey(e.target.value);
                      if (managementApiKeyError) validateManagementApiKey(e.target.value);
                    }}
                    placeholder="sbp_..."
                  />
                  <Button
                    type="button"
                    variant={showManagementApiKey ? "outline" : "default"}
                    size="sm"
                    className={`h-8 px-2 py-0 ${showManagementApiKey 
                      ? 'border-black text-black' 
                      : 'bg-black text-white hover:bg-gray-800'}`}
                    onClick={() => setShowManagementApiKey(!showManagementApiKey)}
                  >
                    {showManagementApiKey ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {managementApiKeyError && (
                  <p className="text-xs text-red-600 mt-1">{managementApiKeyError}</p>
                )}
              </div>
            </div>
            <Button
              className="bg-black text-white hover:bg-gray-800 h-8 px-4 py-0"
              onClick={saveManagementApiKey}
              disabled={!managementApiKey || !!managementApiKeyError}
            >
              Save Key
            </Button>
          </div>
          
          {/* OpenAI API Key Input */}
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4">
            <div className="w-full md:w-2/3">
              <div className="flex flex-col space-y-1">
                <label className="text-sm font-medium text-black">OpenAI API Key <span className="text-xs text-gray-500">(required for AI analysis)</span></label>
                <div className="flex items-center space-x-2">
                  <Input
                    className="w-full border-black text-black"
                    type={showOpenAIApiKey ? 'text' : 'password'}
                    value={openAIApiKey}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setOpenAIApiKey(newValue);
                      // Only validate if there was a previous error
                      if (openAIApiKeyError) validateOpenAIApiKey(newValue);
                    }}
                    placeholder="sk-..."
                  />
                  <Button
                    type="button"
                    variant={showOpenAIApiKey ? "outline" : "default"}
                    size="sm"
                    className={`h-8 px-2 py-0 ${showOpenAIApiKey 
                      ? 'border-black text-black' 
                      : 'bg-black text-white hover:bg-gray-800'}`}
                    onClick={() => setShowOpenAIApiKey(!showOpenAIApiKey)}
                  >
                    {showOpenAIApiKey ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {openAIApiKeyError && (
                  <p className="text-xs text-red-600 mt-1">{openAIApiKeyError}</p>
                )}
              </div>
            </div>
            <div className="flex items-center">
              <Button
                className="bg-black text-white hover:bg-gray-800 h-8 px-4 py-0"
                onClick={saveOpenAIApiKey}
                disabled={!openAIApiKey || !!openAIApiKeyError}
              >
                Save Key
              </Button>
              {openAIApiKeySaved && (
                <span className="ml-2 text-xs text-green-600">Key saved successfully!</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left column - Compliance Checks */}
        <div className="w-full md:w-1/2">
          <Card className="bg-white border border-black h-full">
            <CardHeader className="flex flex-row items-center justify-between p-4">
              <h3 className="text-lg font-bold text-black">Checks</h3>
              <div className="flex space-x-2">
                <Button
                  className="bg-black text-white hover:bg-gray-800 h-8 px-3 py-0 text-xs"
                  onClick={handleRunChecks}
                  disabled={loading}
                >
                  {loading ? 'Running...' : 'Run Checks'}
                </Button>
                <Button
                  variant={visibleSections.checks ? "outline" : "default"}
                  size="sm"
                  onClick={() => toggleSectionVisibility('checks')}
                  className={`h-6 px-2 py-0 text-xs ${visibleSections.checks 
                    ? 'border-black text-black' 
                    : 'bg-black text-white hover:bg-gray-800'}`}
                >
                  {visibleSections.checks ? 'Hide' : 'Unhide'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {visibleSections.checks && (
                <div className="space-y-4">
                  {Object.entries(results).map(([key, result]) => renderCheckStatus(key, result))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - Evidence Log */}
        <div className="w-full md:w-1/2">
          <Card className="bg-white border border-black h-full">
            <CardHeader className="flex flex-row items-center justify-between p-4">
              <h3 className="text-lg font-bold text-black">Evidence Log</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleSectionVisibility('evidenceLog')}
                className="border-black text-black hover:bg-gray-100"
              >
                {visibleSections.evidenceLog ? 'Hide' : 'Unhide'}
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              {visibleSections.evidenceLog && (
                evidence.length > 0 ? (
                  <div>
                    <div className="flex justify-end mb-2">
                      <Button
                        onClick={handleAnalyzeIssues}
                        className="bg-black text-white hover:bg-gray-800 h-8 px-3 py-0 text-xs"
                      >
                        Analyze Issues
                      </Button>
                    </div>
                    <EvidenceLog 
                      evidence={evidence} 
                      onClearEvidence={clearEvidence} 
                    />
                  </div>
                ) : (
                  <p className="text-black text-center py-4">No evidence logs yet. Run compliance checks to generate logs.</p>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Suggested Fixes Table */}
      {suggestedFixes.length > 0 && (
        <div className="mt-6">
          <Card className="bg-white border border-black">
            <CardHeader className="flex flex-row items-center justify-between p-4">
              <h3 className="text-lg font-bold text-black">Suggested Fixes</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSuggestedFixes([])}
                className="h-6 px-2 py-0 text-xs border-black text-black hover:bg-gray-100"
              >
                Clear Suggestions
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <div className="border border-black rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-black font-bold w-1/6">Check</TableHead>
                      <TableHead className="text-black font-bold w-1/4">Issue</TableHead>
                      <TableHead className="text-black font-bold w-1/2">Suggested Fix</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestedFixes.map((fix) => (
                      <TableRow key={fix.id}>
                        <TableCell className="text-black font-medium">
                          {fix.check}
                        </TableCell>
                        <TableCell className="text-black">
                          {fix.issue}
                        </TableCell>
                        <TableCell className="text-black whitespace-pre-wrap">
                          {fix.loading ? (
                            <div className="flex items-center justify-center">
                              <div className="animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></div>
                              <span className="ml-2">Analyzing...</span>
                            </div>
                          ) : (
                            fix.suggestion
                          )}
                        </TableCell>
                      </TableRow>
                    ))}

                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mt-4 bg-white text-black border border-black">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
