import { NextResponse } from 'next/server'
import { CONFIG } from '@/lib/config'
import {
  generateWithGemini,
  generateWithOpenAI,
  generateWithDeepSeek,
  generateWithAnthropic,
  generateWithOllama,
} from '@/lib/models'

export async function POST(request: Request) {
  try {
    const { report, platformModel } = await request.json()
    const [platform, model] = platformModel.split('__')

    if (!report) {
      return NextResponse.json({ error: 'Report is required' }, { status: 400 })
    }

    const prompt = `Based on the following research report, generate a follow-up question that would help deepen or expand the research in a meaningful way. The question should explore an important aspect that wasn't fully covered in the current report.

Report Title: ${report.title}
Summary: ${report.summary}

Key Sections:
${report.sections
  ?.map(
    (section: { title: string; content: string }) =>
      `${section.title}: ${section.content}`
  )
  .join('\n')}

Generate a single, specific follow-up question that would yield valuable additional insights.`

    try {
      let response: string | null = null
      switch (platform) {
        case 'google':
          if (!CONFIG.platforms.google.enabled) break
          response = await generateWithGemini(prompt, model)
          break
        case 'openai':
          if (!CONFIG.platforms.openai.enabled) break
          response = await generateWithOpenAI(prompt, model)
          break
        case 'deepseek':
          if (!CONFIG.platforms.deepseek.enabled) break
          response = await generateWithDeepSeek(prompt, model)
          break
        case 'anthropic':
          if (!CONFIG.platforms.anthropic.enabled) break
          response = await generateWithAnthropic(prompt, model)
          break
        case 'ollama':
          if (!CONFIG.platforms.ollama.enabled) break
          response = await generateWithOllama(prompt, model)
          break
        default:
          return NextResponse.json(
            { error: 'Platform not enabled or invalid' },
            { status: 400 }
          )
      }

      if (!response) {
        throw new Error('No response from model')
      }

      return NextResponse.json({ question: response })
    } catch (error) {
      console.error('Model generation error:', error)
      return NextResponse.json(
        { error: 'Failed to generate question' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Question generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate question' },
      { status: 500 }
    )
  }
}
