English | [🇨🇳 中文](https://github.com/sunquakes/jsonrpc4js/blob/main/README_ZH.md)

# JSONRPC4JS

<p align="center">
  <a href="https://www.moonquakes.io/guide/javascript.html" target="_blank" rel="noopener noreferrer">
    <img width="200" src="https://www.moonquakes.io/images/logo.png" alt="jsonrpc4js logo">
  </a>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/node-%3E=20.8.0-brightgreen.svg?maxAge=2592000" alt="Node">
  <img alt="GitHub" src="https://img.shields.io/github/license/sunquakes/jsonrpc4js?color=blue">
  <img alt="jsonrpc4js" src="https://img.shields.io/github/v/release/sunquakes/jsonrpc4js">
</p>

## Documentation

Visit [https://www.moonquakes.io/guide/javascript.html](https://www.moonquakes.io/guide/javascript.html).

## Quick Start

### Installing

```bash
pnpm add jsonrpc4js
```

### Server

```ts
const { NewServer } = require('jsonrpc4js')

class TcpRpc {
  add(a: number, b: number): number {
    return a + b
  }
}
const port = 3200
const server = NewServer('tcp', port)
server.register(new TcpRpc())
server.start()
```

### Client

```ts
const { NewClient } = require('jsonrpc4js')

const client = NewClient('TcpRpc', 'tcp', `localhost:3200`)
let res = await client.call('add', 1, 2) // 3
```

## Service registration & discovery

### consul

```ts
const { Consul } = require('jsonrpc4js')

const discovery = new Consul('http://localhost:8500')

// Set discovery in server and client.
// const server = NewServer('tcp', port, discovery)
// const client = NewClient('TcpRpc', 'tcp', discovery)
```

### nacos

```ts
const { Nacos } = require('jsonrpc4js')

const discovery = new Nacos('http://localhost:8848')

// Set discovery in server and client.
// const server = NewServer('tcp', port, discovery)
// const client = NewClient('TcpRpc', 'tcp', discovery)
```

## Test

```bash
pnpm test
```

## License

[Apache-2.0 license](https://github.com/sunquakes/jsonrpc4js/blob/main/LICENSE)
