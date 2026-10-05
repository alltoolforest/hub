import { mountLinkedInTask3 } from "./task3-builder.js";

function mount(){
  const root=document.getElementById("workspace");
  if(!root)return;
  try{
    mountLinkedInTask3(root);
  }catch(error){
    root.replaceChildren();
    const message=document.createElement("p");
    message.setAttribute("role","alert");
    message.textContent="The LinkedIn Profile Helper could not start in this browser. Refresh the page or try a current browser.";
    root.append(message);
    console.error("LinkedIn Profile Helper V2 startup failed",error);
  }
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
else mount();
