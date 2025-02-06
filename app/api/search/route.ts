import { NextResponse } from 'next/server'
import { searchRatelimit } from '@/lib/redis'
import { CONFIG } from '@/lib/config'

const BING_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search'
const GOOGLE_ENDPOINT = 'https://customsearch.googleapis.com/customsearch/v1'

type TimeFilter = '24h' | 'week' | 'month' | 'year' | 'all'

function getBingFreshness(timeFilter: TimeFilter): string {
  switch (timeFilter) {
    case '24h':
      return 'Day'
    case 'week':
      return 'Week'
    case 'month':
      return 'Month'
    case 'year':
      return 'Year'
    default:
      return ''
  }
}

function getGoogleDateRestrict(timeFilter: TimeFilter): string | null {
  // Map our timeFilter to Google's dateRestrict values:
  // d1 for 24h, w1 for week, m1 for month, y1 for year
  switch (timeFilter) {
    case '24h':
      return 'd1'
    case 'week':
      return 'w1'
    case 'month':
      return 'm1'
    case 'year':
      return 'y1'
    default:
      return null
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      query,
      timeFilter = 'all',
      provider = CONFIG.search.provider,
    } = body

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    // Only check rate limit if enabled
    if (CONFIG.rateLimits.enabled) {
      const { success } = await searchRatelimit.limit(query)
      if (!success) {
        return NextResponse.json(
          {
            error:
              'Too many requests. Please wait a moment before trying again.',
          },
          { status: 429 }
        )
      }
    }

    if (provider === 'google') {
      // Ensure required Google API variables are available.
      const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY
      const googleCx = process.env.GOOGLE_SEARCH_CX
      if (!googleApiKey || !googleCx) {
        return NextResponse.json(
          {
            error:
              'Google search API is not properly configured. Please check your environment variables.',
          },
          { status: 500 }
        )
      }

      const params = new URLSearchParams({
        q: query,
        key: googleApiKey,
        cx: googleCx,
        num: CONFIG.search.resultsPerPage.toString(),
      })

      // Add Google's dateRestrict parameter if a time filter is applied
      const dateRestrict = getGoogleDateRestrict(timeFilter as TimeFilter)
      if (dateRestrict) {
        params.append('dateRestrict', dateRestrict)
      }

      // Set safe search parameter based on config
      params.append('safe', CONFIG.search.safeSearch.google)

      const googleResponse = await fetch(
        `${GOOGLE_ENDPOINT}?${params.toString()}`
      )

      if (!googleResponse.ok) {
        const errorData = await googleResponse.json().catch(() => null)
        return NextResponse.json(
          {
            error:
              errorData?.error?.message ||
              `Google Search API returned error ${googleResponse.status}`,
          },
          { status: googleResponse.status }
        )
      }

      const data = await googleResponse.json()

      // Transform Google search results to match our format
      const transformedResults = {
        webPages: {
          value:
            data.items?.map((item: any) => ({
              id: item.cacheId || item.link,
              url: item.link,
              name: item.title,
              snippet: item.snippet,
            })) || [],
        },
      }

      return NextResponse.json(transformedResults)
    } else {
      // Default to Bing search
      const subscriptionKey = process.env.AZURE_SUB_KEY
      if (!subscriptionKey) {
        return NextResponse.json(
          {
            error:
              'Search API is not properly configured. Please check your environment variables.',
          },
          { status: 500 }
        )
      }

      const params = new URLSearchParams({
        q: query,
        count: CONFIG.search.resultsPerPage.toString(),
        mkt: CONFIG.search.market,
        safeSearch: CONFIG.search.safeSearch.bing,
        textFormat: 'HTML',
        textDecorations: 'true',
      })

      // Add freshness parameter for Bing if a time filter is applied
      const freshness = getBingFreshness(timeFilter as TimeFilter)
      if (freshness) {
        params.append('freshness', freshness)
      }

      const bingResponse = await fetch(
        `${BING_ENDPOINT}?${params.toString()}`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': subscriptionKey,
            'Accept-Language': 'en-US',
          },
        }
      )

      if (!bingResponse.ok) {
        if (bingResponse.status === 403) {
          return NextResponse.json(
            {
              error:
                'Monthly search quota exceeded. Please try again next month or contact support for increased limits.',
            },
            { status: 403 }
          )
        }
        const errorData = await bingResponse.json().catch(() => null)
        return NextResponse.json(
          {
            error:
              errorData?.message ||
              `Search API returned error ${bingResponse.status}`,
          },
          { status: bingResponse.status }
        )
      }

      const data = await bingResponse.json()
      return NextResponse.json(data)
    }
  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while fetching search results',
      },
      { status: 500 }
    )
  }
}
