import { NextResponse } from 'next/server'
import {
  geminiModel,
  geminiFlashModel,
  geminiFlashThinkingModel,
} from '@/lib/gemini'
import { reportContentRatelimit } from '@/lib/redis'
import { type Article } from '@/types'
import { CONFIG } from '@/lib/config'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import ollama from 'ollama'
import { extractAndParseJSON } from '@/lib/utils'
export const maxDuration = 60

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
})

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

type PlatformModel =
  | 'google__gemini-flash'
  | 'google__gemini-flash-thinking'
  | 'google__gemini-exp'
  | 'gpt-4o'
  | 'o1-mini'
  | 'o1'
  | 'sonnet-3.5'
  | 'haiku-3.5'
  | 'deepseek__chat'
  | 'deepseek__reasoner'
  | 'ollama__llama3.2'
  | 'ollama__deepseek-r1:14b'

type DeepSeekMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

async function generateWithGemini(systemPrompt: string, model: string) {
  if (model === 'gemini-flash-thinking') {
    const result = await geminiFlashThinkingModel.generateContent(systemPrompt)
    return result.response.text()
  } else if (model === 'gemini-exp') {
    const result = await geminiModel.generateContent(systemPrompt)
    return result.response.text()
  } else {
    const result = await geminiFlashModel.generateContent(systemPrompt)
    return result.response.text()
  }
}

async function generateWithOpenAI(systemPrompt: string, model: string) {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: systemPrompt,
      },
    ],
  })
  return response.choices[0].message.content
}

async function generateWithDeepSeek(systemPrompt: string, model: string) {
  try {
    // Initial message to start the conversation
    const messages: DeepSeekMessage[] = [
      {
        role: 'user',
        content: systemPrompt,
      },
    ]

    const response = await deepseek.chat.completions.create({
      model,
      messages: messages as any,
      max_tokens: 4000,
    })

    // Get the initial response
    const content = response.choices[0].message.content || ''

    // For the reasoner model, we can get additional reasoning content
    let reasoning = ''
    const messageWithReasoning = response.choices[0].message as any
    if (
      model === 'deepseek-reasoner' &&
      messageWithReasoning.reasoning_content
    ) {
      reasoning = messageWithReasoning.reasoning_content
      console.log('DeepSeek reasoning:', reasoning)
    }

    return content
  } catch (error) {
    console.error('DeepSeek API error:', error)
    throw error
  }
}

async function generateWithAnthropic(systemPrompt: string, model: string) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 3500,
    temperature: 0.9,
    messages: [
      {
        role: 'user',
        content: systemPrompt,
      },
    ],
  })
  return response.content[0].text || ''
}

async function generateWithOllama(systemPrompt: string, model: string) {
  const response = await ollama.chat({
    model: model.replace('ollama__', ''),
    messages: [{ role: 'user', content: systemPrompt }],
  })
  console.log('ollama response', response)
  return response.message.content
}

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
      platformModel: PlatformModel
    }

    // Only check rate limit if enabled
    if (CONFIG.rateLimits.enabled) {
      const { success } = await reportContentRatelimit.limit('report')
      if (!success) {
        return NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        )
      }
    }

    // Check if selected platform is enabled
    const platform = platformModel.split('__')[0]
    const model = platformModel.split('__')[1]

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
      return `You are a research assistant tasked with creating a comprehensive report based on multiple sources. 
The report should specifically address this request: "${userPrompt}"

Your report should:
1. Have a clear title that reflects the specific analysis requested
2. Begin with a concise executive summary
3. Be organized into relevant sections based on the analysis requested
4. Use markdown formatting for emphasis, lists, and structure
5. Integrate information from sources naturally without explicitly referencing them by number
6. Maintain objectivity while addressing the specific aspects requested in the prompt
7. Compare and contrast the information from each source, noting areas of consensus or points of contention. 
8. Showcase key insights, important data, or innovative ideas.

Here are the source articles to analyze:

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

Format the report as a JSON object with the following structure:
{
  "title": "Report title",
  "summary": "Executive summary (can include markdown)",
  "sections": [
    {
      "title": "Section title",
      "content": "Section content with markdown formatting"
    }
  ]
}

Use markdown formatting in the content to improve readability:
- Use **bold** for emphasis
- Use bullet points and numbered lists where appropriate
- Use headings and subheadings with # syntax
- Include code blocks if relevant
- Use > for quotations
- Use --- for horizontal rules where appropriate

Important: Do not use phrases like "Source 1" or "According to Source 2". Instead, integrate the information naturally into the narrative or reference sources by their titles when necessary.`
    }

    const systemPrompt = generateSystemPrompt(selectedResults, prompt)

    // console.log('Sending prompt to model:', systemPrompt)
    console.log('Model:', model)

    try {
      let response: string | null = null
      switch (platform) {
        case 'google':
          response = await generateWithGemini(systemPrompt, model)
          break
        case 'openai':
          response = await generateWithOpenAI(systemPrompt, model)
          break
        case 'deepseek':
          response = await generateWithDeepSeek(systemPrompt, model)
          break
        case 'anthropic':
          response = await generateWithAnthropic(systemPrompt, model)
          break
        case 'ollama':
          response = await generateWithOllama(systemPrompt, model)
          break
        default:
          throw new Error('Invalid platform specified')
      }

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
