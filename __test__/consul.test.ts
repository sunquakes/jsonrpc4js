import Consul from '../src/discovery/consul'
import { json } from '../src/utils/request'

jest.mock('../src/utils/request')

test('Test consul register.', async () => {
  ;(json as jest.Mock).mockResolvedValue('')
  const consul = new Consul('http://localhost:8500')
  const res = await consul.register('test', 'http', '192.168.1.15', 5002)
  expect(res).toEqual(true)
})

test('Test consul get.', async () => {
  ;(json as jest.Mock).mockResolvedValue(
    `[{"AggregatedStatus":"passing","Service":{"ID":"java_http-2:3202","Service":"java_http","Tags":[],"Meta":{},"Port":3202,"Address":"10.222.1.164","TaggedAddresses":{"lan_ipv4":{"Address":"10.222.1.164","Port":3202},"wan_ipv4":{"Address":"10.222.1.164","Port":3202}},"Weights":{"Passing":1,"Warning":1},"EnableTagOverride":false,"Datacenter":"dc1"},"Checks":[{"Node":"1ae846e40d15","CheckID":"service:java_http-2:3202","Name":"Service 'java_http' check","Status":"passing","Notes":"","Output":"HTTP GET http://10.222.1.164:3202: 200 OK Output: ","ServiceID":"java_http-2:3202","ServiceName":"java_http","ServiceTags":null,"Type":"","ExposedPort":0,"Definition":{"Interval":"0s","Timeout":"0s","DeregisterCriticalServiceAfter":"0s","HTTP":"","Header":null,"Method":"","Body":"","TLSServerName":"","TLSSkipVerify":false,"TCP":"","UDP":"","GRPC":"","GRPCUseTLS":false},"CreateIndex":0,"ModifyIndex":0}]}]`
  )
  const consul = new Consul('http://localhost:8500')
  const res = await consul.get('test')
  expect(res).toEqual('10.222.1.164:3202')
})
