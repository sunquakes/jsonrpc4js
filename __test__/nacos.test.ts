import Nacos from '../src/discovery/nacos'
import { get } from '../src/utils/request'

jest.mock('../src/utils/request')

test('Test nacos register.', async () => {
  ;(get as jest.Mock).mockResolvedValue('')
  const nacos = new Nacos('http://localhost:8848')
  const res = await nacos.register('test', 'http', '192.168.1.15', 5002)
  expect(res).toEqual('')
})

test('Test nacos get.', async () => {
  ;(get as jest.Mock).mockResolvedValue(
    `{"name":"DEFAULT_GROUP@@java_tcp","groupName":"DEFAULT_GROUP","clusters":"","cacheMillis":10000,"hosts":[{"instanceId":"192.168.1.15#3232#DEFAULT#DEFAULT_GROUP@@java_tcp","ip":"192.168.1.15","port":3232,"weight":1.0,"healthy":true,"enabled":true,"ephemeral":true,"clusterName":"DEFAULT","serviceName":"DEFAULT_GROUP@@java_tcp","metadata":{},"instanceHeartBeatInterval":5000,"instanceHeartBeatTimeOut":15000,"ipDeleteTimeout":30000,"instanceIdGenerator":"simple"}],"lastRefTime":1673444367069,"checksum":"","allIPs":false,"reachProtectionThreshold":false,"valid":true}`
  )
  const nacos = new Nacos('http://localhost:8848')
  const res = await nacos.get('test')
  expect(res).toEqual('192.168.1.15:3232')
})
