import { newResult, newError } from '../type/response'
import { INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND } from '../type/error'
import { getMethodParameters } from '../utils/class'
import { isStreamable } from './handler'

/**
 * The transport-level outcome of handling one JSON-RPC message:
 * a bare 202 for notifications, a single JSON body, or a stream of
 * JSON-RPC messages to be delivered over SSE.
 */
export type Outcome =
  | { status: 202 }
  | { status: 200; json: string }
  | { status: 200; stream: AsyncIterable<object> }

type JsonRpcMessage = {
  id?: string | number
  method?: string
  params?: any
}

export type ServerInfo = {
  name: string
  version: string
}

type ToolDefinition = {
  name: string
  description: string
  inputSchema: object
  service: object
  method: Function
  parameters: Array<string>
}

function schemaFor(parameters: Array<string>): object {
  const properties: { [key: string]: object } = {}
  for (const name of parameters) {
    properties[name] = {}
  }
  return parameters.length > 0
    ? { type: 'object', properties, required: [...parameters] }
    : { type: 'object', properties }
}

const MCP_METHODS = new Set(['initialize', 'ping', 'tools/list', 'tools/call'])

function textContent(value: any): object {
  if (typeof value === 'string') return { type: 'text', text: value }
  if (value === undefined) return { type: 'text', text: '' }
  return { type: 'text', text: JSON.stringify(value) }
}

function errorText(e: any): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * The MCP compatibility layer of the streamable-http server.
 *
 * It exposes every registered service method as an MCP tool named
 * "Service_method" and implements the lifecycle an MCP client expects:
 * the initialize handshake, ping, notifications (answered with 202 at the
 * transport), tools/list and tools/call. Streaming service results are
 * surfaced as notifications/progress frames followed by the final
 * tools/call result, as the MCP specification prescribes.
 */
export default class Mcp {
  private tools = new Map<string, ToolDefinition>()

  /**
   * Tool names per service, so re-registering a service rebuilds its tools.
   */
  private serviceTools = new Map<string, Array<string>>()

  private serverInfo: ServerInfo

  private protocolVersions: Array<string>

  constructor(serverInfo: ServerInfo, protocolVersions: Array<string>) {
    this.serverInfo = serverInfo
    this.protocolVersions = protocolVersions
  }

  /**
   * Whether a message should be routed to the MCP layer instead of the
   * legacy "Service/method" dispatch: the MCP lifecycle and tools methods
   * by name, any notification, and any method without a slash (which the
   * legacy dispatch could never resolve either).
   */
  static handles(method: unknown): boolean {
    if (typeof method !== 'string') {
      return false
    }
    return (
      MCP_METHODS.has(method) ||
      method.startsWith('notifications/') ||
      !method.includes('/')
    )
  }

  /**
   * Publish every public method of a registered service as an MCP tool.
   */
  addService(serviceName: string, o: object): void {
    for (const toolName of this.serviceTools.get(serviceName) || []) {
      this.tools.delete(toolName)
    }
    const toolNames: Array<string> = []
    const proto = Object.getPrototypeOf(o) || {}
    const keys = new Set<string>([...Object.getOwnPropertyNames(proto), ...Object.keys(o)])
    for (const key of keys) {
      if (key === 'constructor' || key in Object.prototype) {
        continue
      }
      const fn = (o as any)[key]
      if (typeof fn !== 'function') {
        continue
      }
      let parameters: Array<string>
      try {
        parameters = getMethodParameters(fn)
      } catch (e) {
        parameters = []
      }
      let toolName = `${serviceName}_${key}`
      for (let i = 2; this.tools.has(toolName); i++) {
        toolName = `${serviceName}_${key}_${i}`
      }
      this.tools.set(toolName, {
        name: toolName,
        description: `${serviceName}/${key}`,
        inputSchema: schemaFor(parameters),
        service: o,
        method: fn,
        parameters
      })
      toolNames.push(toolName)
    }
    this.serviceTools.set(serviceName, toolNames)
  }

  /**
   * Handle one MCP request message.
   */
  async handle(message: JsonRpcMessage): Promise<Outcome> {
    const id = message.id as string
    switch (message.method) {
      case 'initialize':
        return this.json(
          newResult(id, {
            protocolVersion: this.negotiate(message.params?.protocolVersion),
            capabilities: { tools: {} },
            serverInfo: this.serverInfo
          })
        )
      case 'ping':
        return this.json(newResult(id, {}))
      case 'tools/list':
        return this.json(
          newResult(id, {
            tools: [...this.tools.values()].map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema
            }))
          })
        )
      case 'tools/call':
        return this.callTool(id, message.params)
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return { status: 202 }
      default:
        if (typeof message.method !== 'string') {
          return this.json(newError(id, INVALID_REQUEST))
        }
        return this.json(newError(id, METHOD_NOT_FOUND))
    }
  }

  private negotiate(requested: any): string {
    if (typeof requested === 'string' && this.protocolVersions.includes(requested)) {
      return requested
    }
    return this.protocolVersions[0]
  }

  private async callTool(id: string, params: any): Promise<Outcome> {
    const name = params?.name
    const tool = typeof name === 'string' ? this.tools.get(name) : undefined
    if (tool === undefined) {
      return this.json(newError(id, INVALID_PARAMS))
    }
    const args = params.arguments ?? {}
    const progressToken = params._meta?.progressToken
    const positional = tool.parameters.map((parameter) => args[parameter])

    let raw: any
    try {
      raw = await tool.method.apply(tool.service, positional)
    } catch (e) {
      return this.json(
        newResult(id, { content: [textContent(errorText(e))], isError: true })
      )
    }

    if (!isStreamable(raw)) {
      return this.json(newResult(id, { content: [textContent(raw)], isError: false }))
    }

    if (progressToken === undefined) {
      const values: Array<any> = []
      try {
        for await (const value of raw) {
          values.push(value)
        }
      } catch (e) {
        return this.json(
          newResult(id, { content: [textContent(errorText(e))], isError: true })
        )
      }
      return this.json(newResult(id, { content: values.map(textContent), isError: false }))
    }

    // Streamed results: one notifications/progress frame per value, then
    // the final tools/call response carrying every value as content.
    const stream = (async function* (): AsyncGenerator<object> {
      const values: Array<any> = []
      let progress = 0
      try {
        for await (const value of raw) {
          values.push(value)
          progress += 1
          yield {
            jsonrpc: '2.0',
            method: 'notifications/progress',
            params: { progressToken, progress, message: textContent(value) }
          }
        }
      } catch (e) {
        yield newResult(id, { content: [textContent(errorText(e))], isError: true })
        return
      }
      yield newResult(id, { content: values.map(textContent), isError: false })
    })()
    return { status: 200, stream }
  }

  private json(message: object): Outcome {
    return { status: 200, json: JSON.stringify(message) }
  }
}
