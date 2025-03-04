import { NextResponse } from 'next/server'
import { reportContentRatelimit } from '@/lib/redis'
import { CONFIG } from '@/lib/config'
import { extractAndParseJSON } from '@/lib/utils'
import { generateWithModel } from '@/lib/models'
import { type ModelVariant } from '@/types'

export async function POST(request: Request) {
  try {
    const { prompt, platformModel = 'google__gemini-flash' } =
      (await request.json()) as {
        prompt: string
        platformModel: ModelVariant
      }

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

    const systemPrompt = `你是一个研究助手，负责将研究主题优化为有效的搜索查询。

给定的研究主题："${prompt}"

你的任务是：
1. 生成一个优化的搜索查询，以帮助收集全面信息
2. 创建一个优化的研究提示，用于指导最终报告生成
3. 建议一个合理的研究结构

查询应该：
- 涵盖主题的核心方面
- 使用相关的专业术语和同义词
- 足够具体以返回高质量结果
- 全面但简洁

请按以下JSON格式组织你的回应：
{
  "query": "优化后的搜索查询",
  "optimizedPrompt": "用于指导报告生成的优化研究提示",
  "explanation": "优化策略的简要说明",
  "suggestedStructure": [
    "需要涵盖的关键方面1",
    "需要涵盖的关键方面2",
    "需要涵盖的关键方面3"
  ]
}

确保查询清晰且重点突出，避免过于复杂或冗长的结构。`

    try {
      const response = await generateWithModel(systemPrompt, platformModel)

      if (!response) {
        throw new Error('No response from model')
      }

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
      console.error('Model generation error:', error)
      return NextResponse.json(
        { error: 'Failed to generate optimization' },
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
