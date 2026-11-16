# AGENTS.md

Guidance for AI agents working in the `jsonrpc4js` repository.

## Project overview

`jsonrpc4js` is a TypeScript library providing a JSON-RPC 2.0 client and server over
TCP or HTTP, with optional service registration & discovery via Consul or Nacos.
It is published as a dual CJS/ESM bundle (`dist/bundle.cjs`, `dist/bundle.mjs`).

- Node requirement: >= 20.8.0
- Package manager: `pnpm`
- Language: TypeScript (strict mode)

## Commands

```bash
pnpm install     # install dependencies
pnpm test        # run jest test suite (__test__/*.test.ts)
pnpm build       # rollup build into dist/
```

Run a single test file:

```bash
pnpm test __test__/tcp.test.ts
```

## Layout

```
src/
  index.ts            # public exports (NewServer, NewClient, TcpServer, HttpServer, TcpClient, HttpClient, Consul, Nacos)
  server.ts           # NewServer(protocol, port, discovery?, options?) factory
  client.ts           # NewClient(service, protocol, address|discovery, options?) factory
  server/
    server.ts         # Server interface + REGISTER_RETRY_INTERVAL
    tcp.ts, http.ts   # protocol implementations
    handler.ts        # request dispatch: "Service/method" -> registered instance method
  client/
    client.ts         # Client interface
    tcp.ts, http.ts   # protocol implementations
    pool.ts           # TCP connection pool + round-robin over discovered addresses
  discovery/
    driver.ts         # Driver interface: register(), get()
    consul.ts, nacos.ts
  type/               # request / response / error JSON-RPC types
  utils/              # address, class (param name reflection), random (id), request (http helpers)
__test__/             # jest tests, one per area
```

## Conventions

- Formatting is enforced by `.prettierrc.json`: no semicolons, single quotes,
  2-space indent, print width 100, no trailing commas. Match this style exactly.
- Every module under `src/` uses a **default export** for its main class/function;
  interfaces (`Server`, `Client`, `Driver`) are `export default interface`.
- New protocols must implement the `Server` / `Client` interfaces and be wired into
  the `switch` statements in [server.ts](file:///c:/Users/RuiXinglong/Documents/GitHub/jsonrpc4js/src/server.ts)
  and [client.ts](file:///c:/Users/RuiXinglong/Documents/GitHub/jsonrpc4js/src/client.ts),
  and re-exported from [index.ts](file:///c:/Users/RuiXinglong/Documents/GitHub/jsonrpc4js/src/index.ts).
- New discovery backends must implement `Driver` and be re-exported from `index.ts`.
- Prefer Node built-ins (`net`, `http`, `querystring`, `os`); the package has no
  runtime dependencies — do not add any without a strong reason.
- Options objects are merged with defaults via `Object.assign(this.options, options)`;
  keep the default (e.g. TCP `delimiter: '\r\n'`) working when options are omitted.

## Behavioral notes

- RPC method names are sent as `ServiceName/methodName`; `handler` splits on `/`
  and resolves the registered instance by class name (or the explicit `name`
  passed to `register()`).
- Named (object) params are converted to positional args by reflecting parameter
  names from `Function.prototype.toString()` in
  [class.ts](file:///c:/Users/RuiXinglong/Documents/GitHub/jsonrpc4js/src/utils/class.ts).
  Avoid transformations/minification assumptions that would break this.
- TCP framing relies on the configurable `delimiter`; client and server must agree.
- Errors use the JSON-RPC codes in
  [error.ts](file:///c:/Users/RuiXinglong/Documents/GitHub/jsonrpc4js/src/type/error.ts)
  via `newError()`.

## Testing

- Jest transpiles via `babel-jest` (`babel.config.json` with preset-env + preset-typescript);
  type errors are therefore **not** caught by tests — check types separately with
  `npx tsc --noEmit` when changing types.
- Tests start real servers on fixed ports (4000+ for TCP, etc.). Use a fresh,
  unused port for each new test and close the server at the end.
- Discovery tests mock `src/utils/request` with `jest.mock` instead of hitting
  Consul/Nacos. Follow that pattern; never require a live registry in tests.

### Releasing

When the user defines a release version (`x.y.z`), execute these steps in this
exact order. Do not stop halfway and do not reorder them:

1. **Add the changelog entry.** Update `CHANGELOG.md`: prepend
   `## [x.y.z] - YYYY-MM-DD` with the release notes, keep the `---` separator
   used between entries, and set the same version in `package.json` so
   `package.json` and `CHANGELOG.md` stay in sync.

2. **Commit and push to `develop`.** Commit the release preparation as
   `chore: release version x.y.z` and push it (`git push origin develop`).

3. **Create and merge the pull request to `main`.** The `gh` CLI is installed and
   authenticated as `sunquakes`. Because the sandbox forbids writes to the
   default config directory, set `GH_CONFIG_DIR` to a temporary directory before
   calling it. Then run

   ```bash
   gh pr create --base main --head develop --title "chore: release version x.y.z" --body "..."
   ```

4. **Publish the tag.** After the pull request is merged, tag the merged commit
   as `x.y.z` and push the tag (`git tag x.y.z && git push origin x.y.z`). This
   triggers [create-release.yml](file:///workspace/.github/workflows/create-release.yml),
   which builds the library, creates the GitHub Release, uploads `jsonrpc4js.zip`,
   and publishes to NPM. The tag must match `*.*.*` and equal the `version` in
   `package.json`; never re-tag an already published version.

## Do not

- Do not commit `dist/` output or edit generated bundles.
- Do not bump the version in `package.json` or edit `CHANGELOG.md` unless asked;
  releases are handled by `.github/workflows/create-release.yml`.
- Do not change the public API surface (`index.ts` exports, factory signatures)
  without an explicit request.
