import Tcp from '../server/tcp'

test('Test', async () => {
  const server = await new Promise((resolve) => {
    const tcp = new Tcp()
    tcp.start((s) => {
      resolve(s)
    })
  })
  server.close()
})
