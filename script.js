(() => {
  const $ = id => document.getElementById(id);
  const filesInput = $('files'), canvas = $('canvas'), ctx = canvas.getContext('2d');
  let photos = [], generation = 0, currentLayout = null;
  const ratios = { '16:9':[16,9,1920,1080], '16:10':[16,10,1920,1200], '3:2':[3,2,2160,1440], '21:9':[21,9,2560,1080] };

  function size() {
    if ($('ratio').value === 'custom') {
      return [clamp(+$('customW').value || 1920,320,7680), clamp(+$('customH').value || 1080,240,4320)];
    }
    const r = ratios[$('ratio').value];
    return [r[2],r[3]];
  }
  function clamp(n,min,max) { return Math.max(min,Math.min(max,n)); }
  function rand(min,max) { return min + Math.random()*(max-min); }
  function shuffleArray(a) { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; }
  function roundedRect(c,x,y,w,h,r) {
    c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
  }
  function drawCover(img,x,y,w,h,angle=0,polaroid=false) {
    ctx.save(); ctx.translate(x+w/2,y+h/2); ctx.rotate(angle);
    const frame = polaroid ? Math.max(10,canvas.width*.009) : 0;
    const bottom = polaroid ? frame*2.3 : frame;
    ctx.shadowColor='rgba(0,0,0,.32)'; ctx.shadowBlur=canvas.width*.008; ctx.shadowOffsetX=canvas.width*.002; ctx.shadowOffsetY=canvas.width*.003;
    ctx.fillStyle=polaroid?'#fff':'rgba(255,255,255,.08)';
    roundedRect(ctx,-w/2,-h/2,w,h,polaroid?Math.max(2,canvas.width*.002):Math.max(2,canvas.width*.0015)); ctx.fill();
    ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0;
    const ix=-w/2+frame, iy=-h/2+frame, iw=w-frame*2, ih=h-frame-bottom;
    ctx.save(); roundedRect(ctx,ix,iy,iw,ih,polaroid?1:Math.max(2,canvas.width*.002)); ctx.clip();
    const scale=Math.max(iw/img.naturalWidth,ih/img.naturalHeight);
    const sw=img.naturalWidth*scale, sh=img.naturalHeight*scale;
    ctx.drawImage(img,ix+(iw-sw)/2,iy+(ih-sh)/2,sw,sh); ctx.restore(); ctx.restore();
  }
  function paintBackground(W,H) {
    if (!$('bgMode') || $('bgMode').value !== 'gradient') {
      ctx.fillStyle=$('bg').value; ctx.fillRect(0,0,W,H); return;
    }
    const angle=(+$('gradientAngle').value||0)*Math.PI/180;
    const cx=W/2, cy=H/2;
    const length=Math.abs(W*Math.cos(angle))+Math.abs(H*Math.sin(angle));
    const dx=Math.cos(angle)*length/2, dy=Math.sin(angle)*length/2;
    const grad=ctx.createLinearGradient(cx-dx,cy-dy,cx+dx,cy+dy);
    const colors=[...$('gradientColorInputs').querySelectorAll('input[type="color"]')].map(el=>el.value);
    (colors.length?colors:['#172554','#4f46e5','#ec4899']).forEach((c,i,a)=>grad.addColorStop(a.length===1?0:i/(a.length-1),c));
    ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
  }

  function buildGradientColorInputs() {
    const count=+$('gradientColorCount').value||3;
    const defaults=['#172554','#4f46e5','#ec4899','#f97316','#facc15','#14b8a6'];
    const old=[...$('gradientColorInputs').querySelectorAll('input[type="color"]')].map(el=>el.value);
    $('gradientColorInputs').innerHTML='';
    for(let i=0;i<count;i++){
      const wrap=document.createElement('div'), label=document.createElement('label'), input=document.createElement('input');
      label.htmlFor='gradientColor'+(i+1); label.textContent='Color '+(i+1);
      input.type='color'; input.id='gradientColor'+(i+1); input.value=old[i]||defaults[i];
      input.addEventListener('input',()=>render(false)); wrap.append(label,input); $('gradientColorInputs').appendChild(wrap);
    }
  }
    function render(regenerate = false) {
    const [W,H]=size();
    const previousW=canvas.width, previousH=canvas.height;
    const settingsOnly = photos.length > 0 && !regenerate && currentLayout && previousW===W && previousH===H;
    if(settingsOnly) {
      // Keep the existing randomized photo positions; update only the background color.
      canvas.hidden=false; $('empty').hidden=true;
      paintBackground(W,H);
      if(currentLayout && currentLayout.length) {
        currentLayout.forEach(item => drawCover(item.p.img,item.x,item.y,item.w,item.h,item.angle,item.polaroid));
      }
      $('status').textContent='Settings changed. Click Randomize layout to apply layout settings and create a new arrangement.';
      updateButtons();
      return;
    }
    canvas.width=W; canvas.height=H;
    $('dimensions').textContent=`${W} × ${H} px · ${Math.round(W/H*100)/100}:1`;
    paintBackground(W,H);
    if (!photos.length) { currentLayout=null; canvas.hidden=true; $('empty').hidden=false; updateButtons(); return; }
    canvas.hidden=false; $('empty').hidden=true;
    currentLayout=[];
    const selected=shuffleArray(photos).slice(0,clamp(+$('count').value||30,1,100));
    const density=+$('density').value/100, style=$('layout').value;
    if(style==='grid') {
      // Higher size means fewer columns and larger tiles.
      const marginPct = Number($('borderSpacing').value) / 100;
      const mx=W*marginPct, my=H*marginPct, innerW=W-2*mx, innerH=H-2*my;
      const targetCell = Math.min(innerW,innerH) * (0.18 + density * 1.12);
      const cols=Math.max(1, Math.min(selected.length, Math.round(innerW / targetCell))), rows=Math.ceil(selected.length/cols);
      const cellW=innerW/cols, cellH=innerH/rows, gap=Math.min(W,H)*Math.max(0.003,0.018-density*0.014);
      selected.forEach((p,i)=>{
        const col=i%cols,row=Math.floor(i/cols), pad=gap/2;
        const x=mx+col*cellW+pad,y=my+row*cellH+pad,w=cellW-gap,h=cellH-gap;
        currentLayout.push({p,x,y,w,h,angle:0,polaroid:false});
        drawCover(p.img,x,y,w,h,0,false);
      });
    } else {
      const polaroid=style==='polaroid';
      const randomized=shuffleArray(selected);
      const placed=[];
      const marginPct = Number($('borderSpacing').value) / 100;
      const mx=W*marginPct, my=H*marginPct, innerW=W-2*mx, innerH=H-2*my;
      const overlapRatio=0.10;

      // Edge-to-edge mode uses recorded background-cover photos, drawn first.
      // Recording them prevents gaps from appearing when settings repaint the same layout.
      if (marginPct===0 && randomized.length) {
        const edgeH=H*0.22, edgeW=W*0.18;
        const strips=[
          {p:randomized[0],x:0,y:0,w:W,h:edgeH},
          {p:randomized[1]||randomized[0],x:0,y:H-edgeH,w:W,h:edgeH},
          {p:randomized[2]||randomized[0],x:0,y:0,w:edgeW,h:H},
          {p:randomized[3]||randomized[1]||randomized[0],x:W-edgeW,y:0,w:edgeW,h:H}
        ];
        strips.forEach(item=>{
          currentLayout.push({...item,angle:0,polaroid:false,edgeStrip:true});
          drawCover(item.p.img,item.x,item.y,item.w,item.h,0,false);
        });
      }

      randomized.forEach((p,index)=>{
        const aspect=p.img.naturalWidth/p.img.naturalHeight;
        let scale=(0.10 + density*0.82)*rand(0.68,1.18);
        if(randomized.length>12) scale*=Math.max(0.48,Math.sqrt(12/randomized.length));
        let w=Math.min(Math.min(innerW,innerH)*scale*Math.sqrt(aspect),innerW*0.48);
        let h=w/aspect;
        if(h>innerH*0.52){h=innerH*0.52;w=h*aspect;}
        if(polaroid){w*=1.06;h*=1.10;}
        w=Math.min(w,innerW*0.50); h=Math.min(h,innerH*0.54);

        let best=null,bestOverlap=Infinity;
        for(let attempt=0;attempt<90;attempt++){
          const angle=rand(polaroid?-0.24:-0.16,polaroid?0.24:0.16);
          const bw=Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle));
          const bh=Math.abs(h*Math.cos(angle))+Math.abs(w*Math.sin(angle));
          const x=rand(mx,Math.max(mx,mx+innerW-bw));
          const y=rand(my,Math.max(my,my+innerH-bh));
          const rect={x,y,w:bw,h:bh,angle,drawX:x+(bw-w)/2,drawY:y+(bh-h)/2};
          let overlap=0;
          for(const prev of placed){
            const ix=Math.max(0,Math.min(rect.x+rect.w,prev.x+prev.w)-Math.max(rect.x,prev.x));
            const iy=Math.max(0,Math.min(rect.y+rect.h,prev.y+prev.h)-Math.max(rect.y,prev.y));
            overlap+=ix*iy/Math.max(1,Math.min(rect.w*rect.h,prev.w*prev.h));
          }
          if(overlap<bestOverlap){bestOverlap=overlap;best=rect;}
          if(overlap<overlapRatio) break;
        }
        if(best){
          placed.push(best);
          currentLayout.push({p,x:best.drawX,y:best.drawY,w,h,angle:best.angle,polaroid});
          drawCover(p.img,best.drawX,best.drawY,w,h,best.angle,polaroid);
        }
      });
    }
    $('status').textContent=`Showing ${selected.length} of ${photos.length} selected image${photos.length===1?'':'s'}.`;
    updateButtons();
  }
  function updateButtons() {
    $('shuffle').disabled=!photos.length; $('download').disabled=!photos.length; $('clear').disabled=!photos.length;
  }
  function updateThumbs() {
    $('thumbs').innerHTML='';
    photos.forEach((p,i)=>{
      const box=document.createElement('div'); box.className='thumb';
      const img=document.createElement('img'); img.src=p.url; img.alt=p.file.name;
      const btn=document.createElement('button'); btn.textContent='×'; btn.title='Remove '+p.file.name; btn.setAttribute('aria-label','Remove '+p.file.name);
      btn.onclick=()=>{URL.revokeObjectURL(p.url);photos.splice(i,1);updateThumbs();render();updateUploadLimits();};
      box.append(img,btn); $('thumbs').append(box);
    });
  }
  async function ensureHeicConverter() {
    if (typeof window.HeicTo === 'function') return;
    // heic2any uses an older libheif build and fails on some newer iPhone HEIC files.
    // heic-to tracks newer libheif releases and supports more HEIC/HEIF variants.
    const urls = [
      'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js',
      'https://unpkg.com/heic-to@1.5.2/dist/iife/heic-to.js'
    ];
    const errors = [];
    for (const src of urls) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src; script.async = true;
          script.onload = () => typeof window.HeicTo === 'function'
            ? resolve()
            : reject(new Error('HEIC converter loaded but its API was unavailable'));
          script.onerror = () => reject(new Error('Could not load converter from ' + new URL(src).hostname));
          document.head.appendChild(script);
        });
        if (typeof window.HeicTo === 'function') return;
      } catch (err) { errors.push(err.message); }
    }
    throw new Error('Could not load the updated HEIC converter. Check your internet connection and try again.');
  }


  const MAX_IMAGES = 50;
  const MAX_FILE_BYTES = 30 * 1024 * 1024;
  const MAX_TOTAL_BYTES = MAX_IMAGES * MAX_FILE_BYTES;
  let cancelRequested = false;
  const formatMB = bytes => Math.round(bytes / (1024 * 1024));
  function updateUploadLimits() {
    const remaining = Math.max(0, MAX_IMAGES - photos.length);
    $('uploadLimits').textContent = `Upload limits: maximum ${MAX_IMAGES} images, ${formatMB(MAX_FILE_BYTES)} MB per image, ${formatMB(MAX_TOTAL_BYTES)} MB combined. ${remaining} image slot${remaining===1?'':'s'} remaining.`;
  }
  function setLoading(visible, message='Preparing selected images…') {
    $('loadingOverlay').hidden = !visible;
    $('loadingMessage').textContent = message;
    if (visible) {
      $('progressBar').style.width = '0%';
      $('progressCount').textContent = '0 of 0 images';
      $('progressPercent').textContent = '0%';
    }
  }
  function updateLoadingProgress(done, total, fileName='') {
    const percent = total ? Math.round(done / total * 100) : 0;
    $('progressBar').style.width = percent + '%';
    $('progressCount').textContent = `${done} of ${total} images`;
    $('progressPercent').textContent = percent + '%';
    $('loadingMessage').textContent = fileName ? `Processing: ${fileName}` : 'Preparing selected images…';
  }
  $('cancelLoading').addEventListener('click', () => { cancelRequested = true; $('loadingMessage').textContent = 'Cancelling after the current image…'; });

  filesInput.addEventListener('change', async e=>{
    const picked = [...e.target.files];
    const supported = picked.filter(f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|bmp|tiff?)$/i.test(f.name));
    const failures = [];
    let acceptedBytes = photos.reduce((sum,p) => sum + (p.file?.size || 0), 0);
    let slots = Math.max(0, MAX_IMAGES - photos.length);
    const files = [];
    for (const file of supported) {
      if (file.size > MAX_FILE_BYTES) { failures.push(`${file.name}: exceeds the ${formatMB(MAX_FILE_BYTES)} MB per-image limit.`); continue; }
      if (slots <= 0) { failures.push(`${file.name}: the collage limit is ${MAX_IMAGES} images.`); continue; }
      if (acceptedBytes + file.size > MAX_TOTAL_BYTES) { failures.push(`${file.name}: adding it would exceed the ${formatMB(MAX_TOTAL_BYTES)} MB combined limit.`); continue; }
      files.push(file); acceptedBytes += file.size; slots--;
    }
    if (picked.length !== supported.length) failures.push(`${picked.length-supported.length} unsupported file(s) skipped.`);
    if (!files.length) {
      $('status').textContent = failures.length ? failures.slice(0,3).join(' ') : 'No supported image files were selected.';
      filesInput.value = ''; updateUploadLimits(); return;
    }

    let loadedNow = 0, processed = 0;
    cancelRequested = false;
    setLoading(true, 'Preparing selected images…');
    const hasHeic = files.some(f => /\.(heic|heif)$/i.test(f.name) || /image\/(heic|heif)/i.test(f.type));
    let converterReady = !hasHeic;
    if (hasHeic) {
      try { $('loadingMessage').textContent = 'Loading HEIC/HEIF converter…'; await ensureHeicConverter(); converterReady = true; }
      catch(err) { failures.push(err.message); }
    }
    for (const file of files) {
      if (cancelRequested) break;
      updateLoadingProgress(processed, files.length, file.name);
      let imageBlob = file;
      const isHeic = /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif)/i.test(file.type);
      try {
        if (isHeic) {
          if (!converterReady || typeof window.HeicTo !== 'function') throw new Error('HEIC converter unavailable.');
          try {
            imageBlob = await window.HeicTo({blob:file,type:'image/jpeg',quality:0.92});
          } catch (convertError) {
            const detail = convertError && convertError.message ? convertError.message : String(convertError);
            throw new Error(/format not supported|libheif/i.test(detail)
              ? 'This HEIC variant is not supported by the decoder. Please convert it to JPG using the iPhone Photos app or Windows Photos, then upload the JPG.'
              : 'HEIC conversion failed: ' + detail);
          }
          if (!(imageBlob instanceof Blob)) throw new Error('The HEIC converter did not return an image. Please convert this photo to JPG and try again.');
        }
        const url = URL.createObjectURL(imageBlob);
        try {
          const img = new Image(); img.src = url; await img.decode();
          const displayFile = isHeic ? new File([imageBlob], file.name.replace(/\.(heic|heif)$/i, '') + '.jpeg', {type:'image/jpeg'}) : file;
          photos.push({file:displayFile,url,img}); loadedNow++;
        } catch(err) { URL.revokeObjectURL(url); throw new Error('The image could not be decoded by this browser.'); }
      } catch(err) {
        console.error('Could not load image:', file.name, err);
        failures.push(`${file.name}: ${err.message || 'Unsupported image format.'}`);
      }
      processed++;
      updateLoadingProgress(processed, files.length, file.name);
      // Let the browser paint progress and respond to the cancel button between files.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    setLoading(false);
    updateThumbs(); render(); updateUploadLimits();
    const summary = `Loaded ${loadedNow} image${loadedNow===1?'':'s'}${cancelRequested?' before cancellation':''}.`;
    $('status').textContent = failures.length ? `${summary} ${failures.length} issue(s): ${failures.slice(0,2).join(' ')}` : summary;
    filesInput.value = '';
  });
  $('shuffle').onclick=()=>{ generation++; render(true); };
  $('download').onclick=()=>{
    const a=document.createElement('a'); a.download='wallpaper-collage.png'; a.href=canvas.toDataURL('image/png'); a.click();
    $('status').textContent='Wallpaper downloaded as PNG.';
  };
  $('clear').onclick=()=>{photos.forEach(p=>URL.revokeObjectURL(p.url));photos=[];updateThumbs();render();updateUploadLimits();$('status').textContent='All photos removed.';};
  $('ratio').onchange=()=>{$('customFields').hidden=$('ratio').value!=='custom';render(true);};
  buildGradientColorInputs();
  updateUploadLimits();
  $('gradientColorCount').addEventListener('change',()=>{buildGradientColorInputs();render(false);});
  ['bg','gradientAngle','bgMode'].forEach(id=>$(id).addEventListener('input',()=>{
    $('gradientFields').hidden=$('bgMode').value!=='gradient';
    $('solidColorField').hidden=$('bgMode').value==='gradient';
    $('gradientAngleValue').textContent=$('gradientAngle').value+'°';
    render(false);
  }));
  $('bgMode').addEventListener('change',()=>{
    $('gradientFields').hidden=$('bgMode').value!=='gradient';
    $('solidColorField').hidden=$('bgMode').value==='gradient';
    render(false);
  });
  ['customW','customH','layout','count'].forEach(id=>$(id).addEventListener('input',render));
  $('borderSpacing').addEventListener('input',()=>{
    $('borderSpacingValue').textContent=$('borderSpacing').value+'%';
    render();
  });
  const updatePhotoSize=()=>{$('densityValue').textContent=$('density').value+'%';render();};
  $('density').addEventListener('input',updatePhotoSize);
  $('density').addEventListener('change',updatePhotoSize);
  updateUploadLimits();
  render(true);
})();
