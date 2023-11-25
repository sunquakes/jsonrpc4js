const Server = import('./server/tcp')

const port = 4000
const server = new Server(port)
server.register(new Rpc())
server.start((s) => {
  resolve(s)
})
