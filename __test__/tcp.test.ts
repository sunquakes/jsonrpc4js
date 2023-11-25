import Server from '../server/tcp'
import Client from '../client/tcp'
import * as net from 'net'

class Rpc {
  add(a: number, b: number): number {
    return a + b
  }
}

test('Tcp client call.', async () => {
  const port = 4000
  // Start a server.
  const s: net.Server = await new Promise((resolve) => {
    const server = new Server(port)
    server.register(new Rpc())
    server.start((s: net.Server) => {
      resolve(s)
    })
  })
  expect(1).toEqual(1)
  // Call server.
  const client = new Client('Rpc', `localhost:${port}`)
  client.call('add', 1, 2).then((result) => {
    console.log('result', result)
    expect(result).toEqual(3)
  })
  s.close()
})