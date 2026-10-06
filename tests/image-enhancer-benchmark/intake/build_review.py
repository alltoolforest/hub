"""Build a private offline review pack; no acceptance labels are inferred."""
import argparse, base64, html, json, zipfile
from pathlib import Path

SCRIPT = r'''
const ids=Array.from(document.querySelectorAll('article')).map(e=>e.id);
const key='alltoolforest-intake-'+document.body.dataset.dataset;
function values(){return ids.map(id=>{const e=document.getElementById(id);return {id,decision:e.querySelector('[name=decision]').value,rightsReview:e.querySelector('[name=rights]').value,cohort:e.querySelector('[name=cohort]').value,notes:e.querySelector('textarea').value};});}
function save(){try{localStorage.setItem(key,JSON.stringify(values()));document.getElementById('status').textContent='Review saved on this browser.';}catch{document.getElementById('status').textContent='Browser storage unavailable. Export your review before closing.';}}
document.addEventListener('input',save);
try{for(const r of JSON.parse(localStorage.getItem(key)||'[]')){const e=document.getElementById(r.id);if(e){e.querySelector('[name=decision]').value=r.decision||'pending';e.querySelector('[name=rights]').value=r.rightsReview||'pending';e.querySelector('[name=cohort]').value=r.cohort||'';e.querySelector('textarea').value=r.notes||'';}}}catch{}
document.getElementById('export').onclick=()=>{const reviewer=document.getElementById('reviewer').value.trim();if(!reviewer){document.getElementById('status').textContent='Enter a reviewer name or initials before export.';document.getElementById('reviewer').focus();return;}
const blob=new Blob([JSON.stringify({version:1,kind:'source-intake-review',dataset:document.body.dataset.dataset,reviewer,reviewedAt:new Date().toISOString(),reviews:values(),acceptanceCorpusLocked:false},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='enhancer-source-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
'''

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--intake',required=True);ap.add_argument('--out',required=True);args=ap.parse_args()
    root=Path(args.intake).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    report=json.loads((root/'intake.json').read_text());cards=[]
    for r in report['candidates']:
        ident=r['id'];thumb=base64.b64encode((root/'thumbnails'/f'{ident}.jpg').read_bytes()).decode()
        def options(items):return ''.join(f'<option value="{html.escape(v)}">{html.escape(t)}</option>' for v,t in items)
        decision=options([('pending','Pending'),('keep','Keep as candidate'),('exclude','Exclude'),('duplicate','Possible duplicate')])
        rights=options([('pending','Pending'),('cleared','Item rights reviewed and cleared'),('unclear','Rights unclear')])
        cohort=options([('','Unassigned')]+[(x,x) for x in ['defocus','motion','pixelation','jpeg','old-damage','old-faded','low-light','overexposure','grayscale','clean']])
        title=html.escape(r['metadata'].get('title','Untitled'))
        credit=html.escape(str(r['metadata'].get('photographer') or r['metadata'].get('secondary_creator') or r['metadata'].get('center') or 'See metadata'))
        cards.append(f'<article id="{ident}"><h2>{ident}</h2><img width="224" loading="lazy" src="data:image/jpeg;base64,{thumb}" alt="{title}"><p>{title}</p><p>Credit: {credit}. Source preview: {r["dimensions"][0]} × {r["dimensions"][1]}.</p><p><a href="{html.escape(r["sourcePage"])}" target="_blank" rel="noopener noreferrer">NASA source record</a> · <a href="{html.escape(r["path"])}">Full downloaded preview</a></p><label>Candidate decision<select name="decision">{decision}</select></label><label>Rights review<select name="rights">{rights}</select></label><label>Proposed cohort<select name="cohort">{cohort}</select></label><label>Evidence, duplicates, content and damage notes<textarea rows="3"></textarea></label></article>')
    import hashlib
    dataset=hashlib.sha256((root/'intake.json').read_bytes()).hexdigest()
    page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Enhancer photo intake review</title><style>body{font:16px system-ui;margin:24px;line-height:1.5;color:#15221c;background:#f6f8f6}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}article{padding:18px;background:white;border:1px solid #bdcabc;border-radius:10px}img{max-width:100%;height:auto}label,select,textarea{display:block;width:100%;box-sizing:border-box;margin:8px 0}select,textarea,input,button{font:inherit;padding:9px}button{background:#174f39;color:white;border:0;border-radius:6px}a{color:#14593e}header{max-width:1000px;margin-bottom:24px}:focus-visible{outline:3px solid #e58a00}</style>'''
    page+=f'<body data-dataset="{dataset}"><header><h1>Photo source review — {len(cards)} candidates</h1><p><strong>Not an accepted benchmark. No restoration-quality verdicts are included.</strong></p><p>These NASA preview photographs are a source pool for controlled experiments. Review credits, duplicate captures, photograph suitability and actual damage before admission. Old-looking photos are not automatically damaged. Do not infer identity preservation or population coverage from this pool.</p><p>Thumbnails work offline. Full previews are included in the ZIP; source links require internet. Changes stay in this browser and are never uploaded. Export your review to return it. This review does not lock the dataset.</p><p>Possible duplicate pairs: {len(report["nearDuplicateReview"])}; see intake.json. Admission, severity, recoverability, consent/rights evidence, grouping, split and diversity review remain pending.</p><label>Reviewer name or initials <input id="reviewer" autocomplete="off"></label><button id="export">Export source review</button><p id="status" role="status" aria-live="polite">No review submitted.</p></header><main>'+''.join(cards)+'</main><script>'+SCRIPT+'</script></body></html>'
    (root/'review.html').write_text(page)
    (root/'README.txt').write_text('AllToolForest enhancer source intake, 2026-10-05.\nOpen review.html locally; source links require internet.\nNASA imagery is used for technical evaluation, without endorsement.\nPolicy: https://www.nasa.gov/nasa-brand-center/images-and-media/\n100 candidates is NOT 100 admitted acceptance sources.\nNo user/private photographs are included.\nNo split or damage labels have been fabricated.\nRetain original bytes and source records during review.\n')
    dest=out/'ALLTOOLFOREST_ENHANCER_PHOTO_REVIEW_2026-10-05.zip'
    with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name in ['review.html','README.txt','intake.json']:z.write(root/name,name)
        for r in report['candidates']:z.write(root/r['path'],r['path'])
        for p in sorted((root/'search-records').glob('*.json')):z.write(p,'search-records/'+p.name)
    print(json.dumps({'archive':str(dest),'bytes':dest.stat().st_size,'candidates':len(cards),'datasetSha256':dataset}))
if __name__=='__main__':main()
