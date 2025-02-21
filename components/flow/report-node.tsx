import { memo } from 'react'
import type { Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Loader2, ChevronDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Report } from '@/types'
import { Button } from '@/components/ui/button'

type ReportNodeData = {
  report?: Report
  loading: boolean
  error?: string
  hasChildren: boolean
  onConsolidate: () => void
}

type ReportNodeType = Node<ReportNodeData>

export const ReportNode = memo(function ReportNode({
  data,
}: {
  data: ReportNodeData
}) {
  return (
    <Card className="min-w-[500px]">
      <Handle type="target" position={Position.Top} />
      <CardContent className="p-4">
        {data.loading ? (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <p>Generating report...</p>
          </div>
        ) : data.error ? (
          <div className="flex items-center gap-3 text-red-500">
            <FileText className="h-5 w-5" />
            <p>{data.error}</p>
          </div>
        ) : data.report ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Report
              </h3>
              {data.hasChildren && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={data.onConsolidate}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Consolidate Chain
                </Button>
              )}
            </div>
            <div className="prose prose-sm max-w-none">
              <h2 className="text-xl font-bold">{data.report.title}</h2>
              <p className="text-gray-600">{data.report.summary}</p>
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  View Full Report <ChevronDown className="h-4 w-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  {data.report.sections?.map((section, index) => (
                    <div key={index} className="mt-4">
                      <h3 className="font-semibold">{section.title}</h3>
                      <div className="mt-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {section.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        ) : null}
      </CardContent>
      <Handle type="source" position={Position.Bottom} />
    </Card>
  )
}) 