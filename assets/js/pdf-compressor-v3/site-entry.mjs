// Only the PDF Compressor page imports this entry. All frozen tools remain untouched.
import {mountV3Compressor} from './site-ui.mjs';
const root=document.querySelector('#workspace');
if(root){
 try{mountV3Compressor(root);}
 catch(error){
   console.error('PDF Compressor V3 startup failure',error?.name??'Error');
   const p=document.createElement('p');
   p.setAttribute('role','alert');
   p.textContent='PDF Compressor is temporarily unavailable. Your files were not uploaded.';
   root.replaceChildren(p);
 }
}
