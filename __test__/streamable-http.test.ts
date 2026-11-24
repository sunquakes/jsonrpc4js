import * as http from 'http'
import StreamableHttpServer from '../src/server/streamable-http'
import StreamableHttpClient from '../src/client/streamable-http'
import NewServer from '../src/server'
import NewClient from '../src/client'
import Consul from '../src/discovery/consul'
import Nacos from '../src/discovery/nacos'
import SSEParser from '../src/utils/sse'
import { get, json } from '../src/utils/request'

jest.mock('../src/utils/request')

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
    for (let i = 1; i <= n; i++) {
      yield i
    }
  }

  list(): Array<number> {
    return [1, 2, 3]
  }

  async *boom() {
    yield 1
    throw new Error('bad')
  }
}

function rpcBody(method: string, params: Array<any>, id = '1'): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method: `StreamRpc/${method}`, params })
}

function startServer(port: number, options?: {}): Promise<http.Server> {
  const server = new StreamableHttpServer(port, undefined, options)
  server.register(new StreamRpc())
  return new Promise((resolve) => {
    server.start((s: http.Server) => resolve(s))
  })
}

interface RawResult {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

function rawRequest(
  port: number,
  method: string,
  opts: { headers?: { [key: string]: string }; body?: string; path?: string } = {}
): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: 'localhost',
        port,
        method,
        path: opts.path || '/mcp',
        headers: opts.headers
      },
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

/**
 * Open a GET stream and resolve with the raw text received once the matcher
 * is satisfied, then tear the connection down.
 */
function collectStream(
  port: number,
  headers: { [key: string]: string },
  matcher: (text: string) => boolean,
  timeoutMs = 3000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port, method: 'GET', path: '/mcp', headers },
      (res) => {
        let text = ''
        let done = false
        const finish = () => {
          if (done) return
          done = true
          clearTimeout(timer)
          req.destroy()
          resolve(text)
        }
        const timer = setTimeout(() => {
          if (done) return
          done = true
          req.destroy()
          reject(new Error('Stream timed out before the matcher matched'))
        }, timeoutMs)
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          text += chunk
          if (matcher(text)) finish()
        })
        res.on('end', finish)
        res.on('error', finish)
      }
    )
    req.on('error', () => {})
    req.end()
  })
}

async function stopServer(s: http.Server): Promise<void> {
  await sleep(1000)
  s.close()
  s.closeAllConnections()
}

test('Streamable http protocol client call server.', async () => {
  const port = 5010
  const s: http.Server = await new Promise((resolve) => {
    const server = NewServer('streamable-http', port)
    server.register(new StreamRpc())
    server.start((srv: http.Server) => resolve(srv))
  })

  const client = NewClient('StreamRpc', 'streamable-http', `localhost:${port}`)
  expect(await client.call('add', 1, 2)).toEqual(3)
  await expect(client.call('add0', 1, 2)).rejects.toEqual(new Error('Method not found'))

  await stopServer(s)
})

test('Streamable http stream results.', async () => {
  const port = 5011
  const s = await startServer(port)
  const client = new StreamableHttpClient('StreamRpc', `localhost:${port}`)

  const range: Array<number> = []
  for await (const value of client.stream('range', 3)) {
    range.push(value)
  }
  expect(range).toEqual([1, 2, 3])

  const list: Array<number> = []
  for await (const value of client.stream('list')) {
    list.push(value)
  }
  expect(list).toEqual([1, 2, 3])

  const got: Array<number> = []
  await expect(
    (async () => {
      for await (const value of client.stream('boom')) {
        got.push(value)
      }
    })()
  ).rejects.toThrow('Internal error')
  expect(got).toEqual([1])

  // call() over an SSE response resolves the first matching message.
  expect(await client.call('range', 2)).toEqual(1)

  // stream() over a unary JSON response yields the single value.
  const unary: Array<number> = []
  for await (const value of client.stream('add', 1, 2)) {
    unary.push(value)
  }
  expect(unary).toEqual([3])

  await stopServer(s)
})

test('Streamable http session lifecycle.', async () => {
  const port = 5012
  const s = await startServer(port)
  const body = rpcBody('add', [1, 2])

  const issued = await rawRequest(port, 'POST', { headers: ACCEPT, body })
  expect(issued.status).toBe(200)
  const sessionId = issued.headers['mcp-session-id'] as string
  expect(typeof sessionId).toBe('string')
  expect(JSON.parse(issued.body).result).toEqual(3)

  const echoed = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': sessionId },
    body
  })
  expect(echoed.headers['mcp-session-id']).toEqual(sessionId)

  const bogus = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': 'bogus-session' },
    body
  })
  expect(bogus.status).toBe(404)

  const deleted = await rawRequest(port, 'DELETE', { headers: { 'Mcp-Session-Id': sessionId } })
  expect(deleted.status).toBe(204)

  const afterDelete = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': sessionId },
    body
  })
  expect(afterDelete.status).toBe(404)

  // The client keeps one session across calls and terminates it on close.
  const client = new StreamableHttpClient('StreamRpc', `localhost:${port}`)
  await client.call('add', 1, 2)
  const clientSession = (client as any).sessionId
  expect(typeof clientSession).toBe('string')
  await client.call('add', 2, 3)
  expect((client as any).sessionId).toEqual(clientSession)
  await client.close()
  const afterClose = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Session-Id': clientSession },
    body
  })
  expect(afterClose.status).toBe(404)

  await stopServer(s)
})

test('Streamable http SSE format and accept check.', async () => {
  const port = 5013
  const s = await startServer(port)

  const res = await rawRequest(port, 'POST', { headers: ACCEPT, body: rpcBody('range', [3]) })
  expect(res.headers['content-type']).toEqual('text/event-stream')
  const parser = new SSEParser()
  const events = [...parser.feed(res.body), ...parser.end()]
  expect(events.length).toBe(3)
  for (const event of events) {
    expect(event.event).toEqual('message')
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    const message = JSON.parse(event.data)
    expect(message.jsonrpc).toEqual('2.0')
    expect(message.id).toEqual('1')
  }
  expect(events.map((event) => JSON.parse(event.data).result)).toEqual([1, 2, 3])

  const rejected = await rawRequest(port, 'POST', {
    headers: { Accept: 'text/plain', 'Content-Type': 'application/json' },
    body: rpcBody('add', [1, 2])
  })
  expect(rejected.status).toBe(406)

  await stopServer(s)
})

test('Streamable http resumability.', async () => {
  const port = 5014
  const s = await startServer(port)

  const res = await rawRequest(port, 'POST', { headers: ACCEPT, body: rpcBody('range', [3]) })
  const sessionId = res.headers['mcp-session-id'] as string
  const parser = new SSEParser()
  const ids = parser.feed(res.body).map((event) => event.id)
  expect(ids.length).toBe(3)

  const replayed = await collectStream(
    port,
    {
      Accept: 'text/event-stream',
      'Mcp-Session-Id': sessionId,
      'Last-Event-ID': ids[1]
    },
    (text) => text.includes(ids[2])
  )
  expect(replayed).toContain(`id: ${ids[2]}`)
  expect(replayed).not.toContain(`id: ${ids[0]}`)
  expect(replayed).not.toContain(`id: ${ids[1]}`)

  const unknown = await rawRequest(port, 'GET', {
    headers: {
      Accept: 'text/event-stream',
      'Mcp-Session-Id': sessionId,
      'Last-Event-ID': 'no-such-event'
    }
  })
  expect(unknown.status).toBe(400)

  await stopServer(s)
})

test('Streamable http keepalive and protocol version.', async () => {
  const port = 5015
  const s = await startServer(port, { keepAliveInterval: 100 })

  const res = await rawRequest(port, 'POST', { headers: ACCEPT, body: rpcBody('add', [1, 2]) })
  const sessionId = res.headers['mcp-session-id'] as string

  const streamed = await collectStream(
    port,
    { Accept: 'text/event-stream', 'Mcp-Session-Id': sessionId },
    (text) => text.includes('keepalive')
  )
  expect(streamed).toContain(': keepalive')

  const supported = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Protocol-Version': '2025-06-18' },
    body: rpcBody('add', [1, 2])
  })
  expect(supported.headers['mcp-protocol-version']).toEqual('2025-06-18')

  const unsupported = await rawRequest(port, 'POST', {
    headers: { ...ACCEPT, 'Mcp-Protocol-Version': '1999-01-01' },
    body: rpcBody('add', [1, 2])
  })
  expect(unsupported.status).toBe(400)
  expect(unsupported.headers['mcp-protocol-version']).toEqual('2025-06-18')

  await stopServer(s)
})

test('Streamable http parse error.', async () => {
  const port = 5016
  const s = await startServer(port)

  const res = await rawRequest(port, 'POST', { headers: ACCEPT, body: 'not-json' })
  expect(res.status).toBe(400)
  expect(res.body).toContain('-32700')

  await stopServer(s)
})

test('Streamable http close then call.', async () => {
  const port = 5017
  const s = await startServer(port)

  const client = new StreamableHttpClient('StreamRpc', `localhost:${port}`)
  expect(await client.call('add', 1, 2)).toEqual(3)
  await client.close()
  expect(await client.call('add', 2, 3)).toEqual(5)

  await stopServer(s)
})

test('Streamable http consul.', async () => {
  const port = 5018
  const discovery = new Consul('http://localhost:8500')
  const s: http.Server = await new Promise((resolve) => {
    ;(json as jest.Mock).mockResolvedValue('')
    const server = NewServer('streamable-http', port, discovery)
    server.register(new StreamRpc())
    server.start((srv: http.Server) => resolve(srv))
  })

  ;(json as jest.Mock).mockResolvedValue(
    `[{"AggregatedStatus":"passing","Service":{"ID":"java_streamable-http-1:${port}","Service":"java_streamable-http","Tags":[],"Meta":{},"Port":${port},"Address":"localhost","TaggedAddresses":{"lan_ipv4":{"Address":"localhost","Port":${port}},"wan_ipv4":{"Address":"localhost","Port":${port}}},"Weights":{"Passing":1,"Warning":1},"EnableTagOverride":false,"Datacenter":"dc1"},"Checks":[]}]`
  )
  const client = NewClient('StreamRpc', 'streamable-http', discovery)
  expect(await client.call('add', 1, 2)).toEqual(3)

  await stopServer(s)
}, 10000)

test('Streamable http nacos.', async () => {
  const port = 5019
  const discovery = new Nacos('http://localhost:8848')
  const s: http.Server = await new Promise((resolve) => {
    ;(json as jest.Mock).mockResolvedValue('ok')
    const server = NewServer('streamable-http', port, discovery)
    server.register(new StreamRpc())
    server.start((srv: http.Server) => resolve(srv))
  })

  ;(get as jest.Mock).mockResolvedValue(
    `{"name":"DEFAULT_GROUP@@java_streamable-http","hosts":[{"instanceId":"localhost#${port}#DEFAULT#DEFAULT_GROUP@@java_streamable-http","ip":"localhost","port":${port},"weight":1.0,"healthy":true,"enabled":true,"ephemeral":true}]}`
  )
  const client = NewClient('StreamRpc', 'streamable-http', discovery)
  expect(await client.call('add', 1, 2)).toEqual(3)

  await stopServer(s)
}, 10000)

test('SSE parser unit.', () => {
  const parser = new SSEParser()

  // A frame split mid-JSON yields nothing until it completes.
  expect(parser.feed('id: 1\nevent: message\ndata: {"jsonrpc":"2.0","i')).toEqual([])
  let events = parser.feed('d":"1","result":5}\n\n')
  expect(events.length).toBe(1)
  expect(events[0].id).toEqual('1')
  expect(events[0].event).toEqual('message')
  expect(JSON.parse(events[0].data).result).toEqual(5)

  // CRLF terminators and multi-line data.
  events = parser.feed('data: a\r\ndata: b\r\n\r\n')
  expect(events.length).toBe(1)
  expect(events[0].data).toEqual('a\nb')

  // A CRLF pair split across two chunks.
  expect(parser.feed('data: x\r')).toEqual([])
  events = parser.feed('\n\r\n')
  expect(events.length).toBe(1)
  expect(events[0].data).toEqual('x')

  // Comment-only frames never dispatch, and ids persist across events.
  expect(parser.feed(': keepalive\n\n')).toEqual([])
  events = parser.feed('id: 9\ndata: one\n\ndata: two\n\n')
  expect(events.length).toBe(2)
  expect(events[0].id).toEqual('9')
  expect(events[1].id).toEqual('9')

  // end() flushes a trailing CR terminator without hanging on it.
  expect(parser.feed('data: z\r')).toEqual([])
  expect(parser.end()).toEqual([])
})
