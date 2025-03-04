'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSearchHistory } from '@/hooks/use-search-history'
import { History } from 'lucide-react'

export function SearchHistoryDialog() {
  const { searchHistory, clearHistory } = useSearchHistory()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="搜索历史">
          <History className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>搜索历史</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end mb-4">
          <Button variant="ghost" size="sm" onClick={clearHistory}>
            清除历史记录
          </Button>
        </div>
        <ScrollArea className="h-[300px] rounded-md border p-4">
          {searchHistory.length === 0 ? (
            <div className="text-center text-muted-foreground">
              暂无搜索历史
            </div>
          ) : (
            <div className="space-y-4">
              {searchHistory.map((item, index) => (
                <div
                  key={index}
                  className="flex flex-col space-y-1 border-b pb-3 last:border-none"
                >
                  <div className="font-medium">{item.query}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}