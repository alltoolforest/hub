import { mountCoverLetterTask3 } from "./task3-builder.js";

function mount() {
  const root = document.getElementById("workspace");
  if (!root) return;
  try {
    mountCoverLetterTask3(root);
  } catch (error) {
    root.replaceChildren();
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = "The Cover Letter Builder could not start in this browser. Refresh the page or try a current browser.";
    root.append(message);
    console.error("Cover Letter Builder startup failed", error);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
