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

    const prompt = `请创建一个综合性的合并报告，整合以下研究报告：

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

分析并综合这些报告，创建一个全面的合并报告，需要：
1. 识别报告之间的共同主题和模式
2. 突出关键见解和发现
3. 展示不同报告之间如何相互补充或对比
4. 得出总体结论
5. 建议潜在的进一步研究领域

请按以下结构组织报告：
- 一个涵盖整体研究主题的清晰标题
- 合并发现的执行摘要
- 分析不同方面的详细章节
- 将所有内容联系在一起的结论

请按以下JSON格式返回响应：
{
  "title": "整体研究主题标题",
  "summary": "发现的执行摘要",
  "sections": [
    {
      "title": "章节标题",
      "content": "章节内容"
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
