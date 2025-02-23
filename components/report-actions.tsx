import { Button } from '@/components/ui/button'
import { Brain, Download } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { useKnowledgeBase } from '@/hooks/use-knowledge-base'
import type { Report } from '@/types'

interface ReportActionsProps {
  report: Report
  prompt?: string
  size?: 'default' | 'sm'
  variant?: 'default' | 'outline'
  className?: string
  hideKnowledgeBase?: boolean
}

export function ReportActions({
  report,
  prompt,
  size = 'sm',
  variant = 'outline',
  className = '',
  hideKnowledgeBase = false,
}: ReportActionsProps) {
  const { addReport } = useKnowledgeBase()
  const { toast } = useToast()

  const handleDownload = async (format: 'pdf' | 'docx' | 'txt') => {
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report,
          format,
        }),
      })

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Download failed',
        variant: 'destructive',
      })
    }
  }

  const handleSaveToKnowledgeBase = () => {
    const success = addReport(report, prompt || '')
    if (success) {
      toast({
        title: 'Saved to Knowledge Base',
        description: 'The report has been saved for future reference',
      })
    }
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      {!hideKnowledgeBase && (
        <Button
          variant={variant}
          size={size}
          className='gap-2'
          onClick={handleSaveToKnowledgeBase}
        >
          <Brain className='h-4 w-4' />
          Save to Knowledge Base
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} className='gap-2'>
            <Download className='h-4 w-4' />
            Download
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => handleDownload('pdf')}>
            Download as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDownload('docx')}>
            Download as Word
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDownload('txt')}>
            Download as Text
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
