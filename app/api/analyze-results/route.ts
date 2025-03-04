import { NextResponse } from 'next/server'
import { reportContentRatelimit } from '@/lib/redis'
import { CONFIG } from '@/lib/config'
import { extractAndParseJSON } from '@/lib/utils'
import { generateWithModel } from '@/lib/models'
import { type ModelVariant } from '@/types'

type SearchResultInput = {
  title: string
  snippet: string
  url: string
  content?: string
}

export async function POST(request: Request) {
  try {
    const {
      prompt,
      results,
      isTestQuery = false,
      platformModel = 'google__gemini-flash',
    } = (await request.json()) as {
      prompt: string
      results: SearchResultInput[]
      isTestQuery?: boolean
      platformModel: ModelVariant
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

    // Only check rate limit if enabled and not using Ollama (local model)
    const platform = platformModel.split('__')[0]
    const model = platformModel.split('__')[1]
    if (CONFIG.rateLimits.enabled && platform !== 'ollama') {
      const { success } = await reportContentRatelimit.limit(
        'agentOptimizations'
      )
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

    const systemPrompt = `你是一个研究助手，负责分析搜索结果与研究主题的相关性。

研究主题："${prompt}"

请分析以下搜索结果并根据以下标准进行评分：
1. 与研究主题的相关性（40%）
2. 信息质量和深度（30%）
3. 来源的可信度和权威性（20%）
4. 观点的独特性和多样性（10%）

对每个结果分配0到1的分数，其中：
- 1.0：卓越 - 高度相关，权威来源，全面覆盖，独特见解
- 0.8-0.9：优秀 - 非常相关，可靠来源，详细信息
- 0.6-0.7：良好 - 相关且来源可靠的扎实信息
- 0.4-0.5：一般 - 中等相关性或基础信息
- 0.2-0.3：较差 - 相关性不强或质量存疑
- 0.0-0.1：不适用 - 不相关，不可靠，或重复信息

确保所选来源的多样性。对重复或高度相似的内容进行适当降分。

以下是需要分析的结果：

${results
  .map(
    (result, index) => `
结果 ${index + 1}：
标题：${result.title}
网址：${result.url}
摘要：${result.snippet}
${result.content ? `完整内容：${result.content}` : ''}
---`
  )
  .join('\n')}

请按以下JSON格式组织你的回应：
{
  "rankings": [
    {
      "url": "结果网址",
      "score": 0.85,
      "reasoning": "评分理由简述"
    }
  ],
  "analysis": "对结果集的简要整体分析，包括对来源多样性和质量分布的评估"
}

重点关注能提供独特、高质量且与研究主题相关的结果。在分析中标注任何潜在的质量或多样性问题。`

    try {
      const response = await generateWithModel(systemPrompt, platformModel)

      if (!response) {
        throw new Error('No response from model')
      }

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
      console.error('Model generation error:', error)
      return NextResponse.json(
        { error: 'Failed to generate analysis' },
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
