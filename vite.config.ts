import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig(({command})=>({base:command==='build'?'/app/':'/',plugins:[react(),tailwind()],build:{outDir:'backend/public/app',manifest:true},server:{proxy:{'/landing-header.css':'http://127.0.0.1:8080','/brand':'http://127.0.0.1:8080','/api':'http://127.0.0.1:8080','/p/':'http://127.0.0.1:8080','/preview':'http://127.0.0.1:8080','/landing.js':'http://127.0.0.1:8080','/landing.css':'http://127.0.0.1:8080','/blocks.css':'http://127.0.0.1:8080','/landing-assets':'http://127.0.0.1:8080','/media':'http://127.0.0.1:8080','/sitemap.xml':'http://127.0.0.1:8080'}}}));
