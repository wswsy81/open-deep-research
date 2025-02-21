import { memo } from 'react'
import type { Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Loader2, ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
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
  isSelected?: boolean
  onSelect?: (id: string) => void
  onConsolidate?: () => void
  isConsolidated?: boolean
  isConsolidating?: boolean
}

type ReportNodeType = Node<ReportNodeData>

export const ReportNode = memo(function ReportNode({
  id,
  data,
}: {
  id: string
  data: ReportNodeData
}) {
  return (
    <div className="w-[500px]">
      <Card className={`overflow-hidden ${data.isConsolidated ? 'bg-blue-50 border-blue-200' : ''}`}>
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
                <div className="flex items-center gap-3">
                  <Checkbox 
                    checked={data.isSelected}
                    onCheckedChange={() => data.onSelect?.(id)}
                    disabled={data.isConsolidating}
                  />
                  <h3 className={`font-medium flex items-center gap-2 ${data.isConsolidated ? 'text-blue-700' : ''}`}>
                    <FileText className={`h-5 w-5 ${data.isConsolidated ? 'text-blue-500' : ''}`} />
                    {data.isConsolidated ? 'Consolidated Report' : 'Report'}
                  </h3>
                </div>
                {data.hasChildren && !data.isConsolidated && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={data.onConsolidate}
                    disabled={data.isConsolidating}
                    className="gap-2"
                  >
                    {data.isConsolidating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Consolidating...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        Consolidate Chain
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="prose prose-sm max-w-none break-words">
                <h2 className={`text-xl font-bold ${data.isConsolidated ? 'text-blue-900' : ''}`}>
                  {data.report.title}
                </h2>
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
                          <ReactMarkdown remarkPlugins={[remarkGfm]} className="break-words">
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
    </div>
  )
}) 