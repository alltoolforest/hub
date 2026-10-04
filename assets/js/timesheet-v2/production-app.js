import { mountTimesheetTask2 } from "./task2-builder.js";

function mount(){
  const root=document.getElementById("workspace");
  if(!root)return;
  try{
    mountTimesheetTask2(root);
  }catch(error){
    root.replaceChildren();
    const message=document.createElement("p");
    message.setAttribute("role","alert");
    message.textContent="The Timesheet & Work Hours tool could not start in this browser. Refresh the page or try a current browser.";
    root.append(message);
    console.error("Timesheet V2 startup failed",error);
  }
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
else mount();
