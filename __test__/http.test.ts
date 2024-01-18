import HttpServer from '../src/server/http'
import HttpClient from '../src/client/http'
import NewServer from '../src/server'
import NewClient from '../src/client'
import * as http from 'http'
import Consul from '../src/discovery/consul'
import Nacos from '../src/discovery/nacos'
import { get, json } from '../src/utils/request'

jest.mock('../src/utils/request')

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))

class HttpRpc {
  add(a: number, b: number): number {
    return a + b
  }
}

test('Http client call server.', async () => {
  const port = 5000
  // Start a server.
  const s: http.Server = await new Promise((resolve) => {
    const server = new HttpServer(port)
    server.register(new HttpRpc())
    server.start((s: http.Server) => {
      resolve(s)
    })
  })

  // Call server.
  const client = new HttpClient('HttpRpc', `localhost:${port}`)
  let res = await client.call('add', 1, 2)
  expect(res).toEqual(3)

  // Method not found.
  try {
    await client.call('add0', 1, 2)
  } catch (e) {
    expect(e).toEqual(new Error('Method not found'))
  }
  await sleep(1000)
  s.close()
})

test('Http protocol client call server.', async () => {
  const port = 5001
  // Start a server.
  const s: http.Server = await new Promise((resolve) => {
    const server = NewServer('http', port)
    server.register(new HttpRpc())
    server.start((s: http.Server) => {
      resolve(s)
    })
  })

  // Call server.
  const client = NewClient('HttpRpc', 'http', `localhost:${port}`)
  let res = await client.call('add', 1, 2)
  expect(res).toEqual(3)

  // Method not found.
  try {
    await client.call('add0', 1, 2)
  } catch (e) {
    expect(e).toEqual(new Error('Method not found'))
  }
  await sleep(1000)
  s.close()
})

test('Http consul.', async () => {
  const port = 5002
  const discovery = new Consul('http://localhost:8500')
  // Start a server.
  const s: http.Server = await new Promise((resolve) => {
    ;(json as jest.Mock).mockResolvedValue('')
    const server = NewServer('http', port, discovery)
    server.register(new HttpRpc())
    server.start((s: http.Server) => {
      resolve(s)
    })
  })

  // Waiting service register to the discovery.
  // await sleep(5000)

  // Call server.
  ;(json as jest.Mock).mockResolvedValue(
    `[{"AggregatedStatus":"passing","Service":{"ID":"java_http-2:${port}","Service":"java_http","Tags":[],"Meta":{},"Port":${port},"Address":"localhost","TaggedAddresses":{"lan_ipv4":{"Address":"localhost","Port":${port}},"wan_ipv4":{"Address":"localhost","Port":${port}}},"Weights":{"Passing":1,"Warning":1},"EnableTagOverride":false,"Datacenter":"dc1"},"Checks":[{"Node":"1ae846e40d15","CheckID":"service:java_http-2:${port}","Name":"Service 'java_http' check","Status":"passing","Notes":"","Output":"HTTP GET http://localhost:${port}: 200 OK Output: ","ServiceID":"java_http-2:${port}","ServiceName":"java_http","ServiceTags":null,"Type":"","ExposedPort":0,"Definition":{"Interval":"0s","Timeout":"0s","DeregisterCriticalServiceAfter":"0s","HTTP":"","Header":null,"Method":"","Body":"","TLSServerName":"","TLSSkipVerify":false,"TCP":"","UDP":"","GRPC":"","GRPCUseTLS":false},"CreateIndex":0,"ModifyIndex":0}]}]`
  )
  const client = NewClient('HttpRpc', 'http', discovery)
  let res = await client.call('add', 1, 2)
  expect(res).toEqual(3)

  // Method not found.
  try {
    await client.call('add0', 1, 2)
  } catch (e) {
    expect(e).toEqual(new Error('Method not found'))
  }
  await sleep(1000)
  s.close()
}, 10000)

test('Http nacos.', async () => {
  const port = 5003
  const discovery = new Nacos('http://localhost:8848')
  // Start a server.
  const s: http.Server = await new Promise((resolve) => {
    ;(json as jest.Mock).mockResolvedValue('ok')
    const server = NewServer('http', port, discovery)
    server.register(new HttpRpc())
    server.start((s: http.Server) => {
      resolve(s)
    })
  })

  // Waiting service register to the discovery.
  // await sleep(5000)

  // Call server.
  ;(get as jest.Mock).mockResolvedValue(
    `{"name":"DEFAULT_GROUP@@java_tcp","groupName":"DEFAULT_GROUP","clusters":"","cacheMillis":10000,"hosts":[{"instanceId":"localhost#${port}#DEFAULT#DEFAULT_GROUP@@java_tcp","ip":"localhost","port":${port},"weight":1.0,"healthy":true,"enabled":true,"ephemeral":true,"clusterName":"DEFAULT","serviceName":"DEFAULT_GROUP@@java_tcp","metadata":{},"instanceHeartBeatInterval":5000,"instanceHeartBeatTimeOut":15000,"ipDeleteTimeout":30000,"instanceIdGenerator":"simple"}],"lastRefTime":1673444367069,"checksum":"","allIPs":false,"reachProtectionThreshold":false,"valid":true}`
  )
  const client = NewClient('HttpRpc', 'http', discovery)
  let res = await client.call('add', 1, 2)
  expect(res).toEqual(3)

  // Method not found.
  try {
    await client.call('add0', 1, 2)
  } catch (e) {
    expect(e).toEqual(new Error('Method not found'))
  }
  await sleep(1000)
  s.close()
}, 10000)
