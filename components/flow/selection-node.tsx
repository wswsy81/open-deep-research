import { memo, useState, useEffect } from 'react'
import type { Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FileText } from 'lucide-react'
import type { SearchResult } from '@/types'

type SelectionNodeData = {
  results: SearchResult[]
  onGenerateReport: (selectedResults: SearchResult[]) => void
}

type SelectionNodeType = Node<SelectionNodeData>

const MAX_SELECTIONS = 3

export const SelectionNode = memo(function SelectionNode({
  data,
}: {
  data: SelectionNodeData
}) {
  const [selectedResults, setSelectedResults] = useState<SearchResult[]>([])

  // Reset selection when results change
  useEffect(() => {
    setSelectedResults([])
  }, [data.results])

  const handleSelect = (result: SearchResult) => {
    console.log('Selecting result:', result)
    setSelectedResults((prev) => {
      if (prev.find((r) => r.id === result.id)) {
        return prev.filter((r) => r.id !== result.id)
      }
      if (prev.length >= MAX_SELECTIONS) return prev
      return [...prev, result]
    })
  }

  const handleGenerateReport = () => {
    console.log('Generating report with selected results:', selectedResults)
    if (selectedResults.length === 0) {
      console.warn('No results selected')
      return
    }
    data.onGenerateReport(selectedResults)
  }

  return (
    <div className="w-auto max-w-[600px] mx-auto">
      <Card>
        <Handle type="target" position={Position.Top} />
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-lg flex items-center gap-3">
                <FileText className="h-6 w-6 text-blue-500" />
                Search Results
              </h3>
              <Button
                size="default"
                disabled={selectedResults.length === 0}
                onClick={handleGenerateReport}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Generate Report ({selectedResults.length})
              </Button>
            </div>
            <p className="text-gray-600">
              Select up to {MAX_SELECTIONS} results to analyze ({selectedResults.length} selected)
            </p>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4">
              {data.results.map((result) => (
                <div key={result.id} className="flex items-start gap-4 bg-gray-50 p-4 rounded-lg">
                  <div className="pt-1">
                    <Checkbox
                      checked={selectedResults.some((r) => r.id === result.id)}
                      onCheckedChange={() => handleSelect(result)}
                      disabled={
                        !selectedResults.some((r) => r.id === result.id) &&
                        selectedResults.length >= MAX_SELECTIONS
                      }
                    />
                  </div>
                  <div className="space-y-2 flex-1">
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium block"
                    >
                      {result.name}
                    </a>
                    <p className="text-sm text-green-700 truncate">{result.url}</p>
                    <p className="text-gray-600 line-clamp-3">
                      {result.snippet}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <Handle type="source" position={Position.Bottom} />
      </Card>
    </div>
  )
}) 