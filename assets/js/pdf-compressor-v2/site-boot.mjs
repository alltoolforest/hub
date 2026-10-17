// Only used by /documents/pdf-compressor/; shared/frozen tool boot untouched.
import {mount} from './site-entry.mjs';
const root=document.getElementById('workspace');
if(root){
  try{await mount(root);}
  catch(error){
    console.error('PDF Compressor could not start',error);
    const p=document.createElement('p');
    p.className='status error';
    p.textContent='PDF Compressor could not start. Reload the page and try again.';
    root.replaceChildren(p);
  }
}
