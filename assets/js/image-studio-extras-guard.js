const root=document.querySelector('#workspace');
if(root) protectExtras(root);

function protectExtras(root){
  const mobileLike=()=>/iP(?:hone|ad|od)/.test(navigator.userAgent||'')||(/Macintosh/.test(navigator.userAgent||'')&&navigator.maxTouchPoints>1)||matchMedia('(max-width:700px)').matches||matchMedia('(pointer:coarse)').matches;
  const status=(text,error=false)=>{const n=root.querySelector('#status');if(n){n.textContent=text;n.classList.toggle('error',error)}};
  const buttonByText=text=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
  const sourceDimensions=()=>{for(const item of root.querySelectorAll('.result-item')){const label=item.querySelector('small')?.textContent?.trim();if(label==='Dimensions'){const m=item.querySelector('strong')?.textContent?.match(/([\d,]+)\s*[×x]\s*([\d,]+)/);if(m)return [Number(m[1].replace(/,/g,'')),Number(m[2].replace(/,/g,''))]}}return null};

  const redactionDownload=buttonByText('Download redacted image');
  redactionDownload?.addEventListener('click',e=>{const d=sourceDimensions();if(!d)return;const [w,h]=d,limit=mobileLike()?8e6:24e6;if(w*h>limit){e.preventDefault();e.stopImmediatePropagation();status(`For reliable redaction on this device, first create and reopen an image below ${limit/1e6} million pixels. The main editor can safely reduce large dimensions.`,true)}},true);

  const reset=buttonByText('Reset image');
  reset?.addEventListener('click',()=>{
    buttonByText('Clear selection')?.click();
    const mode=root.querySelector('#extra-redact-mode');if(mode)mode.value='pixelate';
    const intensity=root.querySelector('#extra-redact-intensity');if(intensity)intensity.value='12';
    const circleSize=root.querySelector('#extra-circle-size');if(circleSize)circleSize.value='800';
    const circleFormat=root.querySelector('#extra-circle-format');if(circleFormat)circleFormat.value='image/png';
    for(const d of root.querySelectorAll('.studio-extra-section'))d.open=false;
    for(const wrap of root.querySelectorAll('.studio-analysis-wrap'))wrap.hidden=true;
    root.querySelector('.studio-swatches')?.replaceChildren();
    root.querySelector('.studio-meta')?.replaceChildren();
  });
}
