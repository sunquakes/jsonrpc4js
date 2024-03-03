import HttpServer from '../src/server/http'
import HttpClient from '../src/client/http'
import NewServer from '../src/server'
import NewClient from '../src/client'
import * as http from 'http'
import Consul from '../src/discovery/consul'
import Nacos from '../src/discovery/nacos'
import { get, json } from '../src/utils/request'

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))

class HttpRpc {
  add(a: number, b: number): number {
    return a + b
  }
}

test('Http client call server.', async () => {
  const port = 9000
  // Start a server.
  const s: http.Server = await new Promise((resolve) => {
    const server = new HttpServer(port)
    server.register(new HttpRpc())
    server.start((s: http.Server) => {
      resolve(s)
    })
  })

  const postData =
    '{"id":"8a799769-8d18-41f1-a2db-9df15e9775d6","jsonrpc":"2.0","method":"/HttpRpc/add","params":[1,2]}'
  const res = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: 'localhost',
        port: port,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          resolve(data)
        })
      }
    )
    req.on('error', (e) => {
      reject(e)
    })
    req.write(postData)
    req.end()
  })
  expect(res).toEqual('{"id":"8a799769-8d18-41f1-a2db-9df15e9775d6","jsonrpc":"2.0","result":3}')
  await sleep(1000)
  s.close()
})
