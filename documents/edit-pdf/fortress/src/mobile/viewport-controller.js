export class ViewportController{
  constructor(scroller){this.scroller=scroller;this.snapshot=null;this.handler=()=>this.keepActiveVisible();this.active=null;}
  watch(el){this.active=el;this.snapshot={top:this.scroller.scrollTop,left:this.scroller.scrollLeft};globalThis.visualViewport?.addEventListener('resize',this.handler);this.keepActiveVisible();}
  stop({restore=false}={}){globalThis.visualViewport?.removeEventListener('resize',this.handler);if(restore&&this.snapshot){this.scroller.scrollTop=this.snapshot.top;this.scroller.scrollLeft=this.snapshot.left;}this.active=null;}
  keepActiveVisible(){if(!this.active)return;const r=this.active.getBoundingClientRect();const vh=globalThis.visualViewport?.height||globalThis.innerHeight;if(r.bottom>vh-16)this.active.scrollIntoView({block:'center',behavior:'smooth'});}
}
