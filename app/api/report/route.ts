import { NextResponse } from 'next/server'
import { reportContentRatelimit } from '@/lib/redis'
import { type Article, type ModelVariant } from '@/types'
import { CONFIG } from '@/lib/config'
import { extractAndParseJSON } from '@/lib/utils'
import { generateWithModel } from '@/lib/models'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      selectedResults,
      sources,
      prompt,
      platformModel = 'google-gemini-flash',
    } = body as {
      selectedResults: Article[]
      sources: any[]
      prompt: string
      platformModel: ModelVariant
    }

    // Only check rate limit if enabled and not using Ollama (local model)
    const platform = platformModel.split('__')[0]
    const model = platformModel.split('__')[1]
    if (CONFIG.rateLimits.enabled && platform !== 'ollama') {
      const { success } = await reportContentRatelimit.limit('report')
      if (!success) {
        return NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        )
      }
    }

    // Check if selected platform is enabled
    const platformConfig =
      CONFIG.platforms[platform as keyof typeof CONFIG.platforms]
    if (!platformConfig?.enabled) {
      return NextResponse.json(
        { error: `${platform} platform is not enabled` },
        { status: 400 }
      )
    }

    // Check if selected model exists and is enabled
    const modelConfig = (platformConfig as any).models[model]
    if (!modelConfig) {
      return NextResponse.json(
        { error: `${model} model does not exist` },
        { status: 400 }
      )
    }
    if (!modelConfig.enabled) {
      return NextResponse.json(
        { error: `${model} model is disabled` },
        { status: 400 }
      )
    }

    const generateSystemPrompt = (articles: Article[], userPrompt: string) => {
      return `你是一个负责创建综合研究报告的助手，需要基于多个来源生成报告。
报告需要专门回应这个要求："${userPrompt}"

你的报告应该：
1. 有一个清晰的标题，反映所请求的具体分析内容
2. 以简明的执行摘要开始
3. 根据所请求的分析内容组织相关章节
4. 使用markdown格式来强调、列表和结构
5. 自然地整合来源信息，不要明确引用来源编号
6. 在处理所请求的具体方面时保持客观性
7. 比较和对比各个来源的信息，注意共识领域和分歧点
8. 展示关键见解、重要数据或创新想法
9. 所有内容必须使用中文撰写，包括标题、摘要和正文

以下是需要分析的文章：

${articles
  .map(
    (article) => `
Title: ${article.title}
URL: ${article.url}
Content: ${article.content}
---
`
  )
  .join('\n')}

请按以下JSON格式组织报告内容，所有内容必须使用中文：
{
  "title": "报告标题（使用中文）",
  "summary": "执行摘要（使用中文，可以包含markdown格式）",
  "sections": [
    {
      "title": "章节标题（使用中文）",
      "content": "章节内容（使用中文，使用markdown格式）"
    }
  ]
}

在内容中使用markdown格式以提高可读性：
- 使用 **粗体** 强调重要内容
- 适当使用项目符号和编号列表
- 使用 # 语法来添加标题和子标题
- 在相关时使用代码块
- 使用 > 添加引用
- 适当使用 --- 作为分隔线

重要提示：
1. 所有内容必须使用中文撰写
2. 不要使用"来源1"或"根据来源2"等表述。相反，要自然地将信息整合到叙述中，必要时可以通过标题引用来源。`
    }

    const systemPrompt = generateSystemPrompt(selectedResults, prompt)

    // console.log('Sending prompt to model:', systemPrompt)
    console.log('Model:', model)

    try {
      const response = await generateWithModel(systemPrompt, platformModel)

      if (!response) {
        throw new Error('No response from model')
      }

      try {
        const reportData = extractAndParseJSON(response)
        // Add sources to the report data
        reportData.sources = sources
        console.log('Parsed report data:', reportData)
        return NextResponse.json(reportData)
      } catch (parseError) {
        console.error('JSON parsing error:', parseError)
        return NextResponse.json(
          { error: 'Failed to parse report format' },
          { status: 500 }
        )
      }
    } catch (error) {
      console.error('Model generation error:', error)
      return NextResponse.json(
        { error: 'Failed to generate report content' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Report generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    )
  }
}
