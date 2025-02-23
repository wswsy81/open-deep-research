import { NextResponse } from 'next/server'
import { CONFIG } from '@/lib/config'
import { generateWithModel } from '@/lib/models'
import type { Report } from '@/types'
import { reportContentRatelimit } from '@/lib/redis'

export async function POST(request: Request) {
  try {
    const { reports, platformModel } = await request.json()
    const [platform, model] = platformModel.split('__')

    if (CONFIG.rateLimits.enabled && platform !== 'ollama') {
      const { success } = await reportContentRatelimit.limit('report')
      if (!success) {
        return NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        )
      }
    }

    console.log('Consolidating reports:', {
      numReports: reports.length,
      reportTitles: reports.map((r: Report) => r.title),
      platform,
      model,
    })

    if (!reports?.length) {
      return NextResponse.json(
        { error: 'Reports are required' },
        { status: 400 }
      )
    }

    const prompt = `Create a comprehensive consolidated report that synthesizes the following research reports:

${reports
  .map(
    (report: Report, index: number) => `
Report ${index + 1} Title: ${report.title}
Report ${index + 1} Summary: ${report.summary}
Key Findings:
${report.sections
  ?.map((section) => `- ${section.title}: ${section.content}`)
  .join('\n')}
`
  )
  .join('\n\n')}

Analyze and synthesize these reports to create a comprehensive consolidated report that:
1. Identifies common themes and patterns across the reports
2. Highlights key insights and findings
3. Shows how different reports complement or contrast each other
4. Draws overarching conclusions
5. Suggests potential areas for further research

Format the response as a structured report with:
- A clear title that encompasses the overall research topic
- An executive summary of the consolidated findings
- Detailed sections that analyze different aspects
- A conclusion that ties everything together

Return the response in the following JSON format:
{
  "title": "Overall Research Topic Title",
  "summary": "Executive summary of findings",
  "sections": [
    {
      "title": "Section Title",
      "content": "Section content"
    }
  ]
}`

    console.log('Generated prompt:', prompt)

    try {
      const response = await generateWithModel(prompt, platformModel)

      if (!response) {
        throw new Error('No response from model')
      }

      console.log('Model response:', response)

      // Try to parse the response as JSON, if it's not already
      let parsedResponse
      try {
        parsedResponse =
          typeof response === 'string' ? JSON.parse(response) : response
        console.log('Parsed response:', parsedResponse)
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError)
        // If it's not JSON, create a basic report structure
        parsedResponse = {
          title: 'Consolidated Research Report',
          summary: response.split('\n\n')[0] || 'Summary not available',
          sections: [
            {
              title: 'Findings',
              content: response,
            },
          ],
        }
      }

      return NextResponse.json(parsedResponse)
    } catch (error) {
      console.error('Model generation error:', error)
      return NextResponse.json(
        { error: 'Failed to generate consolidated report' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Consolidation error:', error)
    return NextResponse.json(
      { error: 'Failed to consolidate reports' },
      { status: 500 }
    )
  }
}
