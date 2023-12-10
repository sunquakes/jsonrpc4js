import querystring from 'querystring'

test('Test url parse.', async () => {
  const parsedUrl = new URL('http://localhost:8500?token=123456')
  const queryParams = querystring.parse(parsedUrl.search.slice(1))
  const protocol = parsedUrl.protocol
  const host = parsedUrl.host
  expect(queryParams.token).toEqual('123456')
  expect(protocol).toEqual('http:')
  expect(host).toEqual('localhost:8500')
})
