// Presentation only: retain original controls, handlers, state and engine nodes.
export function simplifyDocumentInterface(stage){
 const doc=stage.ownerDocument;
 function menu(parent,key,title){
  let panel=[...parent.children].find(node=>node.dataset.editorMenu===key);
  if(!panel){panel=doc.createElement('details');panel.dataset.editorMenu=key;panel.className='document-v2-more';const summary=doc.createElement('summary');summary.textContent=title;panel.append(summary);parent.prepend(panel);}
  return panel;
 }
 function wrap(node,key,title,extra){
  if(!node||node.closest('[data-editor-menu]'))return;
  const parent=node.parentElement,panel=menu(parent,key,title);parent.insertBefore(panel,node);panel.append(node);if(extra)panel.append(extra);
 }
 function groupPanels(parent,title){
  const panels=[...parent.children].filter(node=>node.tagName==='DETAILS'&&!node.hasAttribute('data-editor-menu'));
  if(!panels.length)return;
  const more=menu(parent,'tools',title);more.dataset.editorMore='';for(const panel of panels)more.append(panel);
 }
 function update(){
  for(const editor of stage.querySelectorAll('.hybrid-pdf-editor')){
   const shell=editor.parentElement.parentElement;if(shell?.contains(editor))groupPanels(shell,'More tools');
  }
  const formatting=stage.querySelector('[aria-label="Word paragraph formatting"]');
  if(formatting){const status=formatting.nextElementSibling;wrap(formatting,'format','Text formatting',status?.getAttribute('role')==='status'?status:null);groupPanels(stage,'Layout, tables and more');}
  const text=stage.querySelector('textarea.document-v2-text');
  if(text){const controls=[...stage.children].find(node=>node.matches('.document-v2-actions'));wrap(controls,'view','Text size, wrapping and go to line');groupPanels(stage,'Find and replace');}
  if(stage.querySelector('.document-v2-grid')){const jump=[...stage.children].find(node=>node.tagName==='FORM'&&node.querySelector('[aria-label="Go to cell"]'));wrap(jump,'jump','Go to a cell');}
 }
 const Observer=doc.defaultView.MutationObserver,observer=new Observer(update);observer.observe(stage,{childList:true,subtree:true});update();return()=>observer.disconnect();
}
const stage=document.querySelector('#document-v2-stage');if(stage)simplifyDocumentInterface(stage);
