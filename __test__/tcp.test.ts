import TcpServer from '../src/server/tcp'
import TcpClient from '../src/client/tcp'
import NewServer from '../src/server'
import NewClient from '../src/client'
import * as net from 'net'

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))

class Rpc {
  add(a: number, b: number): number {
    return a + b
  }
}

test('Tcp client call.', async () => {
  const port = 4000
  // Start a server.
  const s: net.Server = await new Promise((resolve) => {
    const server = new TcpServer(port)
    server.register(new Rpc())
    server.start((s: net.Server) => {
      resolve(s)
    })
  })

  // Call server.
  const client = new TcpClient('Rpc', `localhost:${port}`)
  let res = await client.call('add', 1, 2)
  expect(res).toEqual(3)

  // Method not found.
  try {
    await client.call('add0', 1, 2)
  } catch (e) {
    expect(e).toEqual(new Error('Method not found'))
  }

  // Invalid params'.
  try {
    res = await client.call('add', { a: 1, b: 2 })
  } catch (e) {
    expect(e).toEqual(new Error('Invalid params'))
  }
  // res = await client.call('add', 1, '2', 3)
  // expect(res).toEqual(2)
  await sleep(1000)
  s.close()
})

test('Tcp protocol client call server.', async () => {
  const port = 4001
  // Start a server.
  const s: net.Server = await new Promise((resolve) => {
    const server = NewServer('tcp', port)
    server.register(new Rpc())
    server.start((s: net.Server) => {
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
