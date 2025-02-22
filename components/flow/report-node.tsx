import { Handle, Position } from '@xyflow/react'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ReportActions } from '@/components/report-actions'
import type { Report } from '@/types'
import { useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { memo } from 'react'

type ReportNodeData = {
  report?: Report
  loading: boolean
  error?: string
  isSelected?: boolean
  onSelect?: (id: string) => void
  isConsolidated?: boolean
  isConsolidating?: boolean
}

export const ReportNode = memo(function ReportNode({
  id,
  data,
}: {
  id: string
  data: ReportNodeData
}) {
  const {
    report,
    loading,
    error,
    isSelected,
    isConsolidated,
    onSelect,
    isConsolidating,
  } = data
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className='w-[600px]'>
      <Handle type='target' position={Position.Top} />
      <Card
        className={`${isSelected ? 'ring-2 ring-blue-500' : ''} ${
          isConsolidated ? 'border border-yellow-500' : ''
        }`}
      >
        <CardContent className='p-6 space-y-4'>
          {loading ? (
            <div className='flex items-center justify-center p-4'>
              <Loader2 className='h-6 w-6 animate-spin' />
            </div>
          ) : error ? (
            <div className='text-red-500 text-center p-4'>{error}</div>
          ) : report ? (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <div className='space-y-2'>
                <div className='flex items-baseline gap-3'>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onSelect?.(id)}
                    disabled={isConsolidating}
                  />
                  <h2 className='text-xl font-bold text-gray-800'>
                    {report.title}
                  </h2>
                </div>
                <div className='flex justify-start'>
                  <ReportActions report={report} size='sm' />
                </div>
                <p className='text-gray-700'>{report.summary}</p>
              </div>
              <CollapsibleContent>
                <div className='space-y-4 mt-4'>
                  {report.sections?.map((section, index) => (
                    <div key={index} className='space-y-2 border-t pt-4'>
                      <h3 className='text-lg font-semibold text-gray-700'>
                        {section.title}
                      </h3>
                      <div className='prose max-w-none text-gray-600'>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {section.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
              <div className='flex justify-center mt-4 border-t pt-4'>
                <CollapsibleTrigger asChild>
                  <Button
                    variant='link'
                    size='sm'
                    className='gap-2 text-blue-600'
                  >
                    {isExpanded ? 'Show less' : 'View full report'}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        isExpanded ? '-rotate-180' : ''
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </Collapsible>
          ) : null}
        </CardContent>
      </Card>
      <Handle type='source' position={Position.Bottom} />
    </div>
  )
})
