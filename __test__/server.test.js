import Tcp from '../server/tcp'
test('Test', async () => {
  expect(1).toBe(1)
  const tcp = new Tcp()
  tcp.start()
})
