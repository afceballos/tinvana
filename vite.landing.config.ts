import {defineConfig} from 'vite';
export default defineConfig({build:{outDir:'backend/public/landing-assets',emptyOutDir:true,lib:{entry:'src/landing-runtime.ts',cssFileName:'landing-form',name:'ZenzalesLanding',formats:['iife'],fileName:()=> 'landing-runtime.js'}}});
