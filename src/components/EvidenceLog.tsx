import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download } from 'lucide-react';

type EvidenceEntry = {
  timestamp: string
  check: string
  status: string
  details: string
}

interface EvidenceLogProps {
  evidence: EvidenceEntry[]
  onClearEvidence: () => void
}

const EvidenceLog = ({ evidence, onClearEvidence }: EvidenceLogProps) => {
  const downloadLogs = (evidence: EvidenceEntry[]) => {
    const dataStr = JSON.stringify(evidence, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `compliance-evidence-${new Date().toISOString()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }



  if (evidence.length === 0) return null;

  return (
    <div>
      <div className="flex justify-between mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadLogs(evidence)}
          className="border-black text-black hover:bg-gray-100 flex items-center space-x-1"
        >
          <Download className="h-4 w-4 mr-1" />
          <span>Download All Logs</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onClearEvidence}
          className="border-black text-black hover:bg-gray-100"
        >
          Clear Log
        </Button>
      </div>
      <div className="border border-black rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-black font-bold w-1/6">Timestamp</TableHead>
              <TableHead className="text-black font-bold w-1/6">Check</TableHead>
              <TableHead className="text-black font-bold w-1/12">Status</TableHead>
              <TableHead className="text-black font-bold w-1/3">Details</TableHead>
              <TableHead className="text-black font-bold w-1/12">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evidence.map((entry, index) => (
              <TableRow key={index}>
                <TableCell className="text-black">
                  {new Date(entry.timestamp).toLocaleString()}
                </TableCell>
                <TableCell className="text-black font-medium">
                  {entry.check}
                </TableCell>
                <TableCell className="text-black">
                  {entry.status}
                </TableCell>
                <TableCell className="text-black">
                  {entry.details}
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadLogs([entry])}
                      className="p-1 h-7 w-7"
                      title="Download log"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {/* Analysis now handled by the main Analyze Issues button */}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default EvidenceLog;