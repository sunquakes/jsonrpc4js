import Consul from '../src/discovery/consul'

test('Test consul register.', async () => {
  const consul = new Consul('http://localhost:8500')
  const res = await consul.register("test", "http", "192.168.1.15", 5002)
  expect(res).toEqual('')
})

test('Test consul get.', async () => {
  const consul = new Consul('http://localhost:8500')
  const res = await consul.get("test")
  expect(res).toEqual('192.168.1.15:5002')
})
