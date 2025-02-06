import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function extractAndParseJSON(response: string) {
  // First attempt: Try to parse the entire response as JSON
  try {
    return JSON.parse(response)
  } catch (e) {
    console.log('Full response parsing failed, trying extraction methods...')
  }

  // Second attempt: Look for JSON within code blocks and clean up YAML/Markdown artifacts
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/
  const codeBlockMatch = response.match(codeBlockRegex)

  if (codeBlockMatch) {
    try {
      const cleanedJson = codeBlockMatch[1]
        // Remove YAML pipe characters
        .replace(/\|\n/g, '\n')
        // Clean up any remaining YAML/Markdown artifacts
        .replace(/^\s*>/gm, '')
        // Remove any trailing commas before closing braces/brackets
        .replace(/,(\s*[}\]])/g, '$1')

      return JSON.parse(cleanedJson)
    } catch (e) {
      console.log('Code block parsing failed, trying direct JSON extraction...')
    }
  }

  // Third attempt: Find the outermost matching braces while handling strings properly
  let bracketCount = 0
  let startIndex = -1
  let endIndex = -1
  let inString = false
  let escapeNext = false

  for (let i = 0; i < response.length; i++) {
    // Handle string boundaries and escaped characters
    if (response[i] === '"' && !escapeNext) {
      inString = !inString
    } else if (response[i] === '\\' && !escapeNext) {
      escapeNext = true
      continue
    }

    escapeNext = false

    // Only count braces when not in a string
    if (!inString) {
      if (response[i] === '{') {
        if (bracketCount === 0) {
          startIndex = i
        }
        bracketCount++
      } else if (response[i] === '}') {
        bracketCount--
        if (bracketCount === 0) {
          endIndex = i + 1
          // Try parsing this JSON substring with cleanup
          try {
            const jsonCandidate = response
              .substring(startIndex, endIndex)
              .replace(/\|\n/g, '\n')
              .replace(/^\s*>/gm, '')
              .replace(/,(\s*[}\]])/g, '$1')

            return JSON.parse(jsonCandidate)
          } catch (e) {
            // Continue searching if this wasn't valid JSON
            continue
          }
        }
      }
    }
  }

  // If we haven't returned by now, throw an error
  throw new Error('No valid JSON found in response')
}
