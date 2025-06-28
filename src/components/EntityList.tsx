import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { UserMFAStatus, TableRLSStatus, ProjectPITRStatus } from '@/types';

// Use Record to allow string indexing with specific types for status and name fields
type EntityType = UserMFAStatus | TableRLSStatus | ProjectPITRStatus | Record<string, string | boolean | number>;

interface EntityListProps {
  entities: EntityType[];
  entityType: 'users' | 'tables' | 'projects';
  statusField: string;
  nameField: string;
}

const EntityList: React.FC<EntityListProps> = ({ 
  entities, 
  entityType, 
  statusField, 
  nameField 
}) => {
  if (!entities || entities.length === 0) {
    return <p className="text-sm text-gray-500">No {entityType} found.</p>;
  }

  return (
    <div className="mt-4 border border-gray-200 rounded-md">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 font-medium">
        {entityType === 'users' && 'Users MFA Status'}
        {entityType === 'tables' && 'Tables RLS Status'}
        {entityType === 'projects' && 'Projects PITR Status'}
      </div>
      <ul className="divide-y divide-gray-200">
        {entities.map((entity, index) => (
          <li key={index} className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm">{String((entity as Record<string, string>)[nameField])}</span>
            <div className="flex items-center">
              {(entity as Record<string, string>)[statusField] === 'pass' ? (
                <div className="flex items-center text-green-600">
                  <CheckCircle size={16} className="mr-1" />
                  <span className="text-xs">Enabled</span>
                </div>
              ) : (
                <div className="flex items-center text-red-600">
                  <XCircle size={16} className="mr-1" />
                  <span className="text-xs">Disabled</span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        {entities.filter(e => (e as Record<string, string>)[statusField] === 'pass').length} of {entities.length} {entityType} passing
      </div>
    </div>
  );
};

export default EntityList;
