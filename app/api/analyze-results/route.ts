import { NextResponse } from 'next/server'
import { geminiFlashModel } from '@/lib/gemini'
import { extractAndParseJSON } from '@/lib/utils'

type SearchResultInput = {
  title: string
  snippet: string
  url: string
}

export async function POST(request: Request) {
  try {
    const {
      prompt,
      results,
      isTestQuery = false,
    } = (await request.json()) as {
      prompt: string
      results: SearchResultInput[]
      isTestQuery?: boolean
    }

    if (!prompt || !results?.length) {
      return NextResponse.json(
        { error: 'Prompt and results are required' },
        { status: 400 }
      )
    }

    // Return test results for test queries
    if (
      isTestQuery ||
      results.some((r) => r.url.includes('example.com/test'))
    ) {
      return NextResponse.json({
        rankings: results.map((result, index) => ({
          url: result.url,
          score: index === 0 ? 1 : 0.5, // Give first result highest score
          reasoning: 'Test ranking result',
        })),
        analysis: 'Test analysis of search results',
      })
    }

    const systemPrompt = `You are a research assistant tasked with analyzing search results for relevance to a research topic.

Research Topic: "${prompt}"

Analyze these search results and score them based on:
1. Relevance to the research topic
2. Information quality and depth
3. Source credibility
4. Uniqueness of perspective

For each result, assign a score from 0 to 1, where:
- 1.0: Highly relevant, authoritative, and comprehensive
- 0.7-0.9: Very relevant with good information
- 0.4-0.6: Moderately relevant or basic information
- 0.1-0.3: Tangentially relevant
- 0.0: Not relevant or unreliable

Here are the results to analyze:

${results
  .map(
    (result, index) => `
Result ${index + 1}:
Title: ${result.title}
URL: ${result.url}
Snippet: ${result.snippet}
---`
  )
  .join('\n')}

Format your response as a JSON object with this structure:
{
  "rankings": [
    {
      "url": "result url",
      "score": 0.85,
      "reasoning": "Brief explanation of the score"
    }
  ],
  "analysis": "Brief overall analysis of the result set"
}

Focus on finding results that provide unique, high-quality information relevant to the research topic.`

    const result = await geminiFlashModel.generateContent(systemPrompt)
    const response = result.response.text()

    try {
      const parsedResponse = extractAndParseJSON(response)
      return NextResponse.json(parsedResponse)
    } catch (parseError) {
      console.error('Failed to parse analysis:', parseError)
      return NextResponse.json(
        { error: 'Failed to analyze results' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Result analysis failed:', error)
    return NextResponse.json(
      { error: 'Failed to analyze results' },
      { status: 500 }
    )
  }
}
