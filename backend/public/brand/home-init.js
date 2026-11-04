/* Tinbana home: runs in <head> before the first paint (external file because the CSP forbids inline scripts).
   1) Theme: saved choice (same key as the panel) or, on a first visit, the system preference.
   2) Intro: the brand preload plays at most once per browser session and never with reduced motion. */
(function(){
 var root=document.documentElement,theme=null;
 try{var saved=localStorage.getItem('tinvana-theme');if(saved==='light'||saved==='dark')theme=saved;}catch(e){}
 if(!theme)theme=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
 root.dataset.theme=theme;root.style.colorScheme=theme;
 var meta=document.querySelector('meta[name=theme-color]');if(meta)meta.setAttribute('content',theme==='dark'?'#14120f':'#fff8f1');
 var skip=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 try{if(sessionStorage.getItem('tb-home-intro'))skip=true;else sessionStorage.setItem('tb-home-intro','1');}catch(e){}
 root.classList.add(skip?'intro-skip':'intro-on','js');
 // Hide the hero copy until GSAP plays its entrance (CSS reveals it anyway after 3 s if the script never runs).
 if(!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches))root.classList.add('m-ok');
})();
