[English](https://github.com/sunquakes/jsonrpc4js/blob/main/README.md) | 🇨🇳 中文

# JSONRPC4JS

<p align="center">
  <a href="https://www.moonquakes.io/guide/javascript.html" target="_blank" rel="noopener noreferrer">
    <img width="200" src="https://www.moonquakes.io/images/logo.png" alt="jsonrpc4js logo">
  </a>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/node-%3E=22-brightgreen.svg?maxAge=2592000" alt="Node">
  <img alt="GitHub" src="https://img.shields.io/github/license/sunquakes/jsonrpc4js?color=blue">
  <img alt="jsonrpc4js" src="https://img.shields.io/github/v/release/sunquakes/jsonrpc4js">
</p>

## 文档

访问 [https://www.moonquakes.io/guide/javascript.html](https://www.moonquakes.io/guide/javascript.html).

## 快速开始

### 安装

```bash
pnpm add jsonrpc4js
```

### 服务端

```ts
const { NewServer } = require('jsonrpc4js')

class TcpRpc {
  add(a: number, b: number): number {
    return a + b
  }
}
const port = 3200
const server = NewServer('tcp', port) // 也支持http协议
server.register(new TcpRpc())
server.start()
```

### 客户端

```ts
const { NewClient } = require('jsonrpc4js')

const client = NewClient('TcpRpc', 'tcp', `localhost:3200`) // 也支持http协议
let res = await client.call('add', 1, 2) // 3
```

## Streamable HTTP

`streamable-http` 协议在单一 MCP 兼容端点（默认 `/mcp`）上提供 JSON-RPC 服务。
普通调用返回 `application/json`，流式调用返回 `text/event-stream`（SSE）。

```ts
const { NewServer, StreamableHttpClient } = require('jsonrpc4js')

class StreamRpc {
  add(a: number, b: number): number {
    return a + b
  }

  // 返回数组、生成器或异步可迭代对象即可流式输出结果
  async *range(n: number) {
    for (let i = 1; i <= n; i++) yield i
  }
}

const server = NewServer('streamable-http', 3300)
server.register(new StreamRpc())
server.start()

const client = new StreamableHttpClient('StreamRpc', 'localhost:3300')
await client.call('add', 1, 2) // 3
for await (const value of client.stream('range', 3)) {
  console.log(value) // 1, 2, 3
}
await client.close() // 终止会话（DELETE）
```

也可以用 `NewClient('StreamRpc', 'streamable-http', address)` 创建客户端，
但 `stream()` 仅在具体类 `StreamableHttpClient` 上提供。

选项：服务端 `{ path, keepAliveInterval, replayBufferSize, protocolVersions,
serverInfo }`，客户端 `{ path, callTimeout, streamIdleTimeout }`。

### MCP 兼容

streamable HTTP 服务端实现了 MCP 的传输与生命周期——`initialize`、`ping`、
通知返回 `202 Accepted`、`Mcp-Session-Id` 会话、`Mcp-Protocol-Version` 协商、
`Last-Event-ID` 断线续传以及 GET 服务端→客户端 SSE 通道——并把每个已注册的
服务方法以 `Service_method` 名称发布为 MCP 工具，agent 客户端可直接连接：

```ts
// tools/list  → [{ name: 'StreamRpc_add', inputSchema: {...} }, ...]
// tools/call  { name: 'StreamRpc_add', arguments: { a: 1, b: 2 } }
//             → { content: [{ type: 'text', text: '3' }], isError: false }
```

当调用携带 `_meta.progressToken` 时，流式工具结果会以 `notifications/progress`
帧逐条推送，最后返回最终结果。

## 服务注册发现

### consul

```ts
const { Consul } = require('jsonrpc4js')

const discovery = new jsonrpc4js.Consul('http://localhost:8500')

// 设置服务端和客户端注册中心
// const server = NewServer('tcp', port, discovery)
// const client = NewClient('TcpRpc', 'tcp', discovery)
```

### nacos

```ts
const { Nacos } = require('jsonrpc4js')

const discovery = new jsonrpc4js.Nacos('http://localhost:8848')

// 设置服务端和客户端注册中心
// const server = NewServer('tcp', port, discovery)
// const client = NewClient('TcpRpc', 'tcp', discovery)
```

### 测试

```bash
pnpm test
```

## 证书

[Apache-2.0 license](https://github.com/sunquakes/jsonrpc4js/blob/main/LICENSE)
