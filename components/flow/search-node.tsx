import { memo } from 'react'
import type { Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Loader2 } from 'lucide-react'

type SearchNodeData = {
  query: string
  loading: boolean
}

type SearchNodeType = Node<SearchNodeData>

export const SearchNode = memo(function SearchNode({
  data,
}: {
  data: SearchNodeData
}) {
  return (
    <div className="w-auto mx-auto">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            {data.loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            ) : (
              <Search className="h-6 w-6 text-blue-500" />
            )}
            <div className="space-y-1">
              <h3 className="font-medium text-lg">Search Query</h3>
              <p className="text-gray-600">{data.query}</p>
            </div>
          </div>
        </CardContent>
        <Handle type="source" position={Position.Bottom} />
      </Card>
    </div>
  )
}) 