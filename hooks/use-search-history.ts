import { useState, useEffect } from 'react'
import type { SearchResult } from '@/types'

interface SearchHistory {
  query: string
  results: SearchResult[]
  timestamp: number
}

const SEARCH_HISTORY_KEY = 'search_history'
const MAX_HISTORY_ITEMS = 50

export function useSearchHistory() {
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([])

  // 加载搜索历史
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(SEARCH_HISTORY_KEY)
      if (savedHistory) {
        setSearchHistory(JSON.parse(savedHistory))
      }
    } catch (error) {
      console.error('Failed to load search history:', error)
    }
  }, [])

  // 保存搜索历史
  const saveSearch = (query: string, results: SearchResult[]) => {
    const newHistory = [
      { query, results, timestamp: Date.now() },
      ...searchHistory,
    ].slice(0, MAX_HISTORY_ITEMS)

    setSearchHistory(newHistory)
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory))
    } catch (error) {
      console.error('Failed to save search history:', error)
    }
  }

  // 清除搜索历史
  const clearHistory = () => {
    setSearchHistory([])
    localStorage.removeItem(SEARCH_HISTORY_KEY)
  }

  // 获取特定查询的搜索结果
  const getSearchResults = (query: string) => {
    return searchHistory.find((item) => item.query === query)?.results || []
  }

  return {
    searchHistory,
    saveSearch,
    clearHistory,
    getSearchResults,
  }
}