import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载所有环境变量（包括不带VITE_前缀的）
  const env = loadEnv(mode, process.cwd(), '')
  
  console.log('API_PORT:', env.API_PORT)
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${env.API_PORT || 3001}`,
          changeOrigin: true,
          secure: false,
          ws: false,
          configure: (proxy, options) => {
            proxy.on('error', (err, req, res) => {
              console.log('代理错误:', err)
            })
            proxy.on('proxyReq', (proxyReq, req, res) => {
              console.log('代理请求:', req.method, req.url)
            })
            proxy.on('proxyRes', (proxyRes, req, res) => {
              console.log('代理响应:', proxyRes.statusCode)
            })
          }
        },
        '/functions/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/functions\/api/, '/api'),
          configure: (proxy, options) => {
            proxy.on('error', (err, req, res) => {
              console.log('Worker 代理错误:', err)
            })
            proxy.on('proxyReq', (proxyReq, req, res) => {
              console.log('Worker 代理请求:', req.method, req.url)
            })
            proxy.on('proxyRes', (proxyRes, req, res) => {
              console.log('Worker 代理响应:', proxyRes.statusCode)
            })
          }
        }
      }
    },
    optimizeDeps: {
      include: ["pinia", "sweetalert2", "dplayer", "hls.js"]
    }
  }
})
