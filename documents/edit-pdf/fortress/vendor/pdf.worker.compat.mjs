import { ensurePdfjsRuntimeCompat, assertPdfjsRuntimeCompatible } from '../src/rendering/browser-compat.js';
ensurePdfjsRuntimeCompat();
assertPdfjsRuntimeCompatible();
const {WorkerMessageHandler}=await import('./pdf.worker.mjs');
export {WorkerMessageHandler};
