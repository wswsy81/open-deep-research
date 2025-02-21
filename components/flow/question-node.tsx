import { memo } from 'react'
import type { Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HelpCircle, Loader2, AlertCircle } from 'lucide-react'

type QuestionNodeData = {
  question?: string
  loading: boolean
  error?: string
  onApprove?: () => void
}

type QuestionNodeType = Node<QuestionNodeData>

export const QuestionNode = memo(function QuestionNode({
  data,
}: {
  data: QuestionNodeData
}) {
  return (
    <Card className="min-w-[400px]">
      <Handle type="target" position={Position.Top} />
      <CardContent className="p-4">
        {data.loading ? (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <p>Generating follow-up question...</p>
          </div>
        ) : data.error ? (
          <div className="flex items-center gap-3 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <p>{data.error}</p>
          </div>
        ) : data.question ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-500" />
              <h3 className="font-medium">Follow-up Question</h3>
            </div>
            <p className="text-gray-600">{data.question}</p>
            <Button
              size="sm"
              className="w-full"
              onClick={data.onApprove}
            >
              Research This Question
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}) 