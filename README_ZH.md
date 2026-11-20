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
