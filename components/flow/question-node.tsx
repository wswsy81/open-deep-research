import { memo } from 'react'
import type { Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search, Loader2 } from 'lucide-react'

type SearchTermsNodeData = {
  searchTerms?: string[]
  loading: boolean
  error?: string
  onApprove?: (term: string) => void
}

export const QuestionNode = memo(function SearchTermsNode({
  data,
}: {
  data: SearchTermsNodeData
}) {
  return (
    <div className='w-[400px]'>
      <Card className='overflow-hidden'>
        <Handle type='target' position={Position.Top} />
        <CardContent className='p-4'>
          {data.loading ? (
            <div className='flex items-center gap-3'>
              <Loader2 className='h-5 w-5 animate-spin text-blue-500' />
              <p>Generating search terms...</p>
            </div>
          ) : data.error ? (
            <div className='flex items-center gap-3 text-red-500'>
              <Search className='h-5 w-5' />
              <p>{data.error}</p>
            </div>
          ) : data.searchTerms?.length ? (
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <Search className='h-5 w-5 text-blue-500' />
                <h3 className='font-medium'>Follow-up Queries</h3>
              </div>
              <div className='space-y-2'>
                {data.searchTerms.map((term, index) => (
                  <div
                    key={index}
                    className='flex items-center justify-between gap-2 p-2 rounded bg-gray-50'
                  >
                    <p className='text-sm text-gray-600'>{term}</p>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => data.onApprove?.(term)}
                      className='h-8'
                    >
                      <Search className='h-4 w-4' />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
        <Handle type='source' position={Position.Bottom} />
      </Card>
    </div>
  )
})
