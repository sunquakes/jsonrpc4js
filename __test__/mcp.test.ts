import * as http from 'http'
import StreamableHttpServer from '../src/server/streamable-http'
import SSEParser from '../src/utils/sse'

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))

const ACCEPT = {
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json'
}

class StreamRpc {
  add(a: number, b: number): number {
    return a + b
  }

  async *range(n: number) {
    for (let i = 1; i <= n; i++) yield i
  }

  list(): Array<number> {
    return [1, 2, 3]
  }

  async *boom() {
    yield 1
    throw new Error('bad')
  }
}

interface RawResult {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

function rawRequest(
  port: number,
  method: string,
  opts: { headers?: { [key: string]: string }; body?: string } = {}
): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port, method, path: '/mcp', headers: opts.headers },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () =>
          resolve({ status: res.statusCode as number, headers: res.headers, body: data })
        )
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

function msg(id: string | undefined, method: string, params?: any): string {
  const message: any = { jsonrpc: '2.0', method }
  if (id !== undefined) message.id = id
  if (params !== undefined) message.params = params
  return JSON.stringify(message)
}

function startServer(port: number, options?: {}): Promise<http.Server> {
  const server = new StreamableHttpServer(port, undefined, options)
  server.register(new StreamRpc())
  return new Promise((resolve) => {
    server.start((s: http.Server) => resolve(s))
  })
}

/**
 * Perform the initialize handshake and return the issued session id.
 */
async function initialize(port: number, protocolVersion = '2025-06-18'): Promise<string> {
  const res = await rawRequest(port, 'POST', {
    headers: ACCEPT,
    body: msg('0', 'initialize', {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'mcp-test', version: '1.0.0' }
    })
  })
  expect(res.status).toBe(200)
  return res.headers['mcp-session-id'] as string
}

async function stopServer(s: http.Server): Promise<void> {
  await sleep(1000)
  s.close()
  s.closeAllConnections()
}

test('MCP initialize, ping and tools/list.', async () => {
  const port = 5020
  const s = await startServer(port)

  const init = await rawRequest(port, 'POST', {
    headers: ACCEPT,
    body: msg('0', 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'mcp-test', version: '1.0.0' }
    })
  })
  expect(init.status).toBe(200)
  const sessionId = init.headers['mcp-session-id'] as string
  expect(typeof sessionId).toBe('string')
  const initResult = JSON.parse(init.body)
  expect(initResult.id).toEqual('0')
  expect(initResult.result.protocolVersion).toEqual('2025-06-18')
  expect(initResult.result.capabilities.tools).toBeDefined()
  expect(initResult.result.serverInfo.name).toEqual('jsonrpc4js')

  // Unsupported requested versions fall back to the latest supported one.
  const fallback = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': sessionId },
    body: msg('1', 'initialize', { protocolVersion: '1999-01-01', capabilities: {} })
  })
  expect(JSON.parse(fallback.body).result.protocolVersion).toEqual('2025-06-18')

  // The initialized notification gets an empty 202.
  const notification = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': sessionId },
    body: msg(undefined, 'notifications/initialized')
  })
  expect(notification.status).toBe(202)
  expect(notification.body).toEqual('')

  const ping = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': sessionId },
    body: msg('2', 'ping')
  })
  expect(JSON.parse(ping.body).result).toEqual({})

  const list = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': sessionId },
    body: msg('3', 'tools/list')
  })
  const tools = JSON.parse(list.body).result.tools as Array<any>
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  expect([...byName.keys()].sort()).toEqual(
    ['StreamRpc_add', 'StreamRpc_boom', 'StreamRpc_list', 'StreamRpc_range'].sort()
  )
  expect(byName.get('StreamRpc_add').inputSchema).toEqual({
    type: 'object',
    properties: { a: {}, b: {} },
    required: ['a', 'b']
  })
  expect(byName.get('StreamRpc_list').inputSchema).toEqual({ type: 'object', properties: {} })

  const call = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': sessionId },
    body: msg('4', 'tools/call', { name: 'StreamRpc_add', arguments: { a: 1, b: 2 } })
  })
  const callResult = JSON.parse(call.body).result
  expect(callResult.isError).toBe(false)
  expect(callResult.content).toEqual([{ type: 'text', text: '3' }])

  await stopServer(s)
})

test('MCP streamed tool results.', async () => {
  const port = 5021
  const s = await startServer(port)
  const sessionId = await initialize(port)

  // With a progress token the call streams notifications/progress frames
  // followed by the final result carrying every value.
  const streamed = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': sessionId },
    body: msg('1', 'tools/call', {
      name: 'StreamRpc_range',
      arguments: { n: 3 },
      _meta: { progressToken: 'tok-1' }
    })
  })
  expect(streamed.headers['content-type']).toEqual('text/event-stream')
  const parser = new SSEParser()
  const messages = parser.feed(streamed.body).map((event) => JSON.parse(event.data))
  expect(messages.length).toBe(4)
  for (let i = 0; i < 3; i++) {
    expect(messages[i].method).toEqual('notifications/progress')
    expect(messages[i].params.progressToken).toEqual('tok-1')
    expect(messages[i].params.progress).toEqual(i + 1)
    expect(messages[i].params.message).toEqual({ type: 'text', text: String(i + 1) })
  }
  expect(messages[3].id).toEqual('1')
  expect(messages[3].result.content).toEqual([
    { type: 'text', text: '1' },
    { type: 'text', text: '2' },
    { type: 'text', text: '3' }
  ])

  // Without a progress token the same call answers a single JSON body.
  const unary = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': sessionId },
    body: msg('2', 'tools/call', { name: 'StreamRpc_range', arguments: { n: 3 } })
  })
  expect(unary.headers['content-type']).toEqual('application/json')
  expect(JSON.parse(unary.body).result.content.length).toBe(3)

  await stopServer(s)
})

test('MCP tool errors, origin check and legacy dispatch.', async () => {
  const port = 5022
  const s = await startServer(port)
  const sessionId = await initialize(port)
  const headers = { ...ACCEPT, 'Mcp-Session-Id': sessionId }

  // A throwing tool reports an MCP-level error result, not a JSON-RPC error.
  const failed = await rawRequest(port, 'POST', {
    headers,
    body: msg('1', 'tools/call', { name: 'StreamRpc_boom', arguments: {} })
  })
  const failedResult = JSON.parse(failed.body).result
  expect(failedResult.isError).toBe(true)
  expect(failedResult.content).toEqual([{ type: 'text', text: 'bad' }])

  const unknownTool = await rawRequest(port, 'POST', {
    headers,
    body: msg('2', 'tools/call', { name: 'StreamRpc_nope', arguments: {} })
  })
  expect(JSON.parse(unknownTool.body).error.code).toEqual(-32602)

  const unknownMethod = await rawRequest(port, 'POST', {
    headers,
    body: msg('3', 'bogus')
  })
  expect(JSON.parse(unknownMethod.body).error.code).toEqual(-32601)

  // The legacy "Service/method" dispatch keeps working on the same server.
  const legacy = await rawRequest(port, 'POST', {
    headers,
    body: msg('4', 'StreamRpc/add', [1, 2])
  })
  expect(JSON.parse(legacy.body).result).toEqual(3)

  // Legacy notifications (no id) are accepted with 202 as well.
  const legacyNotification = await rawRequest(port, 'POST', {
    headers,
    body: msg(undefined, 'StreamRpc/add', [1, 2])
  })
  expect(legacyNotification.status).toBe(202)

  // DNS-rebinding protection: foreign origins are rejected.
  const evil = await rawRequest(port, 'POST', {
    headers: { ...headers, Origin: 'http://evil.example' },
    body: msg('5', 'ping')
  })
  expect(evil.status).toBe(403)

  const same = await rawRequest(port, 'POST', {
    headers: { ...headers, Origin: `http://localhost:${port}` },
    body: msg('6', 'ping')
  })
  expect(same.status).toBe(200)

  await stopServer(s)
})
