import typescript from 'rollup-plugin-typescript'
import resolve from 'rollup-plugin-node-resolve'

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/bundle.js',
      format: 'cjs'
    },
    {
      file: 'dist/bundle.mjs',
      format: 'esm'
    }
  ],
  plugins: [
    resolve({
      preferBuiltins: true 
    }),
    typescript()
  ]
}
