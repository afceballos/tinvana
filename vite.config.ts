import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig(({command})=>({base:command==='build'?'/app/':'/',plugins:[react(),tailwind()],build:{outDir:'backend/public/app',manifest:true},server:{proxy:{'/api':'http://127.0.0.1:8080','/p/':'http://127.0.0.1:8080','/preview':'http://127.0.0.1:8080','/landing.js':'http://127.0.0.1:8080','/landing.css':'http://127.0.0.1:8080','/sitemap.xml':'http://127.0.0.1:8080'}}}));
