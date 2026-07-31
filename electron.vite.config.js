import path from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite 统一构建配置：主进程 / preload / 渲染层
// 注意：主进程/preload 入口必须用绝对路径，否则会被 electron-vite 默认 external
// 列表中的 /^electron\/.+/ 正则误判为外部模块（入口不能是 external）。
export default defineConfig({
  // 主进程：CommonJS 输出，入口 electron/main.cjs -> out/main/index.cjs
  // externalizeDepsPlugin：把 package.json dependencies 标记为 external，
  // 避免 better-sqlite3 等 native 模块被 rollup 打包破坏 .node 文件路径解析
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: path.resolve(__dirname, 'electron/main.cjs'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  // Preload：CommonJS 输出，入口 electron/preload.cjs -> out/preload/index.cjs
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: path.resolve(__dirname, 'electron/preload.cjs'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  // 渲染层：ESM + JSX，根目录为项目根，入口 index.html -> out/renderer
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: 'index.html'
      }
    }
  }
})
