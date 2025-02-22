import { Handle, Position } from '@xyflow/react'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ReportActions } from '@/components/report-actions'
import type { Report } from '@/types'

interface ReportNodeProps {
  data: {
    report?: Report
    loading?: boolean
    error?: string
    isSelected?: boolean
    isConsolidated?: boolean
  }
}

export function ReportNode({ data }: ReportNodeProps) {
  const { report, loading, error, isSelected, isConsolidated } = data

  return (
    <div className='w-[600px]'>
      <Handle type='target' position={Position.Top} />
      <Card
        className={`${
          isSelected ? 'ring-2 ring-blue-500' : ''
        } ${
          isConsolidated ? 'bg-blue-50' : ''
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
            <>
              <div className='flex justify-between items-start gap-4'>
                <h2 className='text-xl font-bold text-gray-800'>{report.title}</h2>
                <ReportActions report={report} size='sm' />
              </div>
              <p className='text-gray-700'>{report.summary}</p>
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
            </>
          ) : null}
        </CardContent>
      </Card>
      <Handle type='source' position={Position.Bottom} />
    </div>
  )
} 