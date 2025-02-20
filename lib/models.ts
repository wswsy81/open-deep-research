import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import ollama from 'ollama'
import {
  geminiFlashThinkingModel,
  geminiModel,
  geminiFlashModel,
} from './gemini'

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

type DeepSeekMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function generateWithGemini(systemPrompt: string, model: string) {
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

export async function generateWithOpenAI(systemPrompt: string, model: string) {
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

export async function generateWithDeepSeek(
  systemPrompt: string,
  model: string
) {
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

export async function generateWithAnthropic(
  systemPrompt: string,
  model: string
) {
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

export async function generateWithOllama(systemPrompt: string, model: string) {
  const response = await ollama.chat({
    model: model.replace('ollama__', ''),
    messages: [{ role: 'user', content: systemPrompt }],
  })
  console.log('ollama response', response)
  return response.message.content
}
