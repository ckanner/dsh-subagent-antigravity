import { createHash } from 'node:crypto'

export class AcpInputError extends Error {
  constructor(message) { super(message); this.name = 'AcpInputError'; this.code = 'INVALID_REQUEST' }
}
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function fields(value, allowed, label = 'request') {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new AcpInputError(`Unsupported ${label} fields`)
}
export function string(value, label, limit = 8192) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.length > limit) throw new AcpInputError(`Invalid ${label}`)
  return value
}
export function uuid(value, label = 'session ID') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new AcpInputError(`Invalid ${label}`)
  return value
}

// Only human-authored typed content crosses this boundary. In particular there
// is no systemPrompt, MCP server, host-tool, metadata or Preset input surface.
export function promptContent(value, capabilities = {}) {
  if (!Array.isArray(value) || !value.length || value.length > 16) throw new AcpInputError('A prompt requires 1–16 content blocks')
  let bytes = 0
  const result = value.map(block => {
    if (!object(block)) throw new AcpInputError('Invalid prompt content')
    switch (block.type) {
      case 'text':
        fields(block, ['type', 'text'], 'text content')
        string(block.text, 'prompt text', 1024 * 1024)
        break
      case 'image': {
        fields(block, ['type', 'data', 'mimeType'], 'image content')
        if (capabilities.image !== true) throw new AcpInputError('This runtime did not advertise image input')
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(block.mimeType)) throw new AcpInputError('Unsupported image MIME type')
        if (typeof block.data !== 'string' || !block.data || block.data.length > 12 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(block.data)) throw new AcpInputError('Image must contain bounded base64 bytes')
        const data = Buffer.from(block.data, 'base64')
        if (data.length > 8 * 1024 * 1024 || data.toString('base64') !== block.data) throw new AcpInputError('Invalid image bytes')
        break
      }
      case 'resource_link':
        fields(block, ['type', 'uri', 'name', 'mimeType', 'description'], 'resource link')
        string(block.uri, 'resource URI'); string(block.name, 'resource name', 1024)
        if (!/^(?:file|https?):/.test(block.uri)) throw new AcpInputError('Unsupported resource URI')
        if (block.mimeType != null) string(block.mimeType, 'MIME type', 256)
        if (block.description != null) string(block.description, 'description', 4096)
        break
      case 'resource':
        fields(block, ['type', 'resource'], 'embedded resource')
        if (capabilities.embeddedContext !== true) throw new AcpInputError('This runtime did not advertise embedded context')
        fields(block.resource, ['uri', 'mimeType', 'text'], 'embedded resource')
        string(block.resource.uri, 'resource URI'); string(block.resource.text, 'resource text', 1024 * 1024)
        if (block.resource.mimeType != null) string(block.resource.mimeType, 'MIME type', 256)
        break
      default: throw new AcpInputError('Unsupported prompt content type')
    }
    bytes += Buffer.byteLength(JSON.stringify(block))
    return structuredClone(block)
  })
  if (bytes > 16 * 1024 * 1024) throw new AcpInputError('Prompt exceeds the 16 MiB limit')
  return result
}

export function selectOptions(option) {
  return (option?.options ?? []).flatMap(item => Array.isArray(item.options) ? item.options : [item])
}
export function modelOption(options) { return options?.find(option => option.category === 'model' || option.id === 'model') }
export function geminiModel(value) { return typeof value === 'string' && /^gemini(?:[-./]|$)/i.test(value) }
export function modelProblem(options) {
  const option = modelOption(options)
  if (!option) return 'The runtime has not exposed its current model; personal ACP prompts require a confirmed Gemini model.'
  if (!geminiModel(option.currentValue)) return 'Select a Gemini model from the official runtime before using personal ACP.'
  return null
}

export function safeError(error) {
  // Auth helper output is never passed here. Bound native protocol errors and
  // remove common credential forms before storing a diagnostic.
  const message = String(error?.message ?? error).replace(/https:\/\/accounts\.google\.com\/\S+/gi, '[official login URL]')
    .replace(/(Bearer\s+)[A-Za-z0-9_.~+/=-]+/gi, '$1[redacted]')
    .replace(/((?:api[_-]?key|token|password|secret|authorization[_-]?code)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
    .slice(0, 2048)
  return { code: String(error?.code ?? 'ACP_ERROR'), message }
}
