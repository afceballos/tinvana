// Keep overlays inside their owning dialog while escaping scroll-container clipping.
export function floatingPanel(anchor:HTMLElement,panel:HTMLElement){
 panel.setAttribute('popover','manual');
 const position=()=>{
  const r=anchor.getBoundingClientRect();const v=window.visualViewport;
  const left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||innerWidth,height=v?.height||innerHeight;
  const below=top+height-r.bottom-14,above=r.top-top-14;
  const down=below>=240||below>=above;const available=Math.max(100,Math.min(330,down?below:above));
  Object.assign(panel.style,{position:'fixed',inset:'auto',margin:'0',padding:'0',boxSizing:'border-box',positionAnchor:'auto',width:Math.min(r.width,width-24)+'px',maxHeight:available+'px',left:Math.max(left+12,Math.min(r.left,left+width-r.width-12))+'px',top:'0px',zIndex:'1000'});
  panel.style.top=Math.max(top+12,Math.min(top+height-panel.getBoundingClientRect().height-12,down?r.bottom+6:r.top-6-panel.getBoundingClientRect().height))+'px';
 };
 let active=false;
 const stop=()=>{if(!active)return;active=false;window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);window.visualViewport?.removeEventListener('resize',position);window.visualViewport?.removeEventListener('scroll',position);if(panel.matches(':popover-open'))panel.hidePopover();};
 return {open(){if(active){position();return;}active=true;position();if(panel.showPopover)panel.showPopover();position();window.addEventListener('resize',position);document.addEventListener('scroll',position,true);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);},close:stop};
}

export function floatingPhone(input:HTMLInputElement,host:HTMLElement){
 let floating:ReturnType<typeof floatingPanel>|undefined;
 const close=()=>{floating?.close();floating=undefined;};
 const open=()=>{close();const panel=host.querySelector<HTMLElement>('.iti--detached-country-selector');if(panel){floating=floatingPanel(input.closest<HTMLElement>('.iti')||input,panel);floating.open();}};
 input.addEventListener('open:countryselector',open);input.addEventListener('close:countryselector',close);
 return ()=>{close();input.removeEventListener('open:countryselector',open);input.removeEventListener('close:countryselector',close);};
}
