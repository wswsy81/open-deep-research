import { NextResponse } from 'next/server'
import { geminiFlashLiteModel } from '@/lib/gemini'
import { extractAndParseJSON } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    // Return test results for test queries
    if (prompt.toLowerCase() === 'test') {
      return NextResponse.json({
        query: 'test',
        optimizedPrompt:
          'Analyze and compare different research methodologies, focusing on scientific rigor, peer review processes, and validation techniques',
        explanation: 'Test optimization strategy',
        suggestedStructure: [
          'Test Structure 1',
          'Test Structure 2',
          'Test Structure 3',
        ],
      })
    }

    const systemPrompt = `You are a research assistant tasked with optimizing a research topic into an effective search query.

Given this research topic: "${prompt}"

Your task is to:
1. Generate ONE optimized search query that will help gather comprehensive information
2. Create an optimized research prompt that will guide the final report generation
3. Suggest a logical structure for organizing the research

The query should:
- Cover the core aspects of the topic
- Use relevant technical terms and synonyms
- Be specific enough to return high-quality results
- Be comprehensive yet concise

Format your response as a JSON object with this structure:
{
  "query": "the optimized search query",
  "optimizedPrompt": "The refined research prompt that will guide report generation",
  "explanation": "Brief explanation of the optimization strategy",
  "suggestedStructure": [
    "Key aspect 1 to cover",
    "Key aspect 2 to cover",
    "Key aspect 3 to cover"
  ]
}

Make the query clear and focused, avoiding overly complex or lengthy constructions.`

    const result = await geminiFlashLiteModel.generateContent(systemPrompt)
    const response = result.response.text()

    try {
      const parsedResponse = extractAndParseJSON(response)
      return NextResponse.json(parsedResponse)
    } catch (parseError) {
      console.error('Failed to parse optimization:', parseError)
      return NextResponse.json(
        { error: 'Failed to optimize research' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Research optimization failed:', error)
    return NextResponse.json(
      { error: 'Failed to optimize research' },
      { status: 500 }
    )
  }
}
