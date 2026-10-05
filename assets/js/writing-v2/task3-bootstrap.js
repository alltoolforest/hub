import { mountProfessionalWritingTask2 } from "./task2-builder.js";

const root=document.querySelector("#writing-v2-workspace");

if(!root){
  throw new Error("Professional Writing Assistant V2 workspace was not found.");
}

try{
  mountProfessionalWritingTask2(root);
}catch(error){
  root.replaceChildren();
  const message=document.createElement("p");
  message.className="status error";
  message.setAttribute("role","alert");
  message.textContent="The writing workspace could not start. Reload the page and try again.";
  root.append(message);
  console.error(error);
}
