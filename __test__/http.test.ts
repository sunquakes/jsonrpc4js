import Server from '../src/server/http'
import Client from '../src/client/http'
import * as http from 'http'

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))

class Rpc {
  add(a: number, b: number): number {
    return a + b
  }
}

test('Http client call.', async () => {
  const port = 5000
  // Start a server.
  const s: http.Server = await new Promise((resolve) => {
    const server = new Server(port)
    server.register(new Rpc())
    server.start((s: http.Server) => {
      resolve(s)
    })
  })

  // Call server.
  const client = new Client('Rpc', `localhost:${port}`)
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
