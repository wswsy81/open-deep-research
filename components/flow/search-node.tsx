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
    <Card className="min-w-[300px]">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {data.loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          ) : (
            <Search className="h-5 w-5 text-blue-500" />
          )}
          <div>
            <h3 className="font-medium">Search Query</h3>
            <p className="text-sm text-gray-600">{data.query}</p>
          </div>
        </div>
      </CardContent>
      <Handle type="source" position={Position.Bottom} />
    </Card>
  )
}) 