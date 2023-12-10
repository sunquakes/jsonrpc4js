import HttpServer from '../src/server/http'
import HttpClient from '../src/client/http'
import NewServer from '../src/server'
import NewClient from '../src/client'
import * as http from 'http'

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))

class Rpc {
  add(a: number, b: number): number {
    return a + b
  }
}

test('Http client call server.', async () => {
  const port = 5000
  // Start a server.
  const s: http.Server = await new Promise((resolve) => {
    const server = new HttpServer(port)
    server.register(new Rpc())
    server.start((s: http.Server) => {
      resolve(s)
    })
  })

  // Call server.
  const client = new HttpClient('Rpc', `localhost:${port}`)
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
    server.register(new Rpc())
    server.start((s: http.Server) => {
      resolve(s)
    })
  })

  // Call server.
  const client = NewClient('Rpc', 'http', `localhost:${port}`)
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
