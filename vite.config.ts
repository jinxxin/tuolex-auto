import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './', // 统一入口路径前缀（方案A）；过渡到子域方案B时改回 '/'
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // vendor 分包：首屏只拉核心包，图表/3D/文档生成等按需加载
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('three')) return 'vendor-3d';
          if (id.includes('echarts') || id.includes('zrender')) return 'vendor-charts';
          if (id.includes('tiptap') || id.includes('prosemirror')) return 'vendor-editor';
          if (id.includes('docx') || id.includes('jspdf') || id.includes('html2canvas') || id.includes('jszip') || id.includes('xlsx')) return 'vendor-docs';
          if (id.includes('antd') || id.includes('@ant-design') || id.includes('react') || id.includes('react-dom') || id.includes('react-router') || id.includes('dayjs')) return 'vendor-react';
          return 'vendor-misc';
        },
      },
    },
  },
  server: {
    proxy: {
      // 开发环境：/api 转发到后端服务
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
