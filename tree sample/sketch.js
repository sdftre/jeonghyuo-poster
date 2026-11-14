/* θ = seed; H = makeTree; Tθ = stored branch/leaf geometry; y = rasterized pixels.
   No image assets. Geometry and sampling both use the seed for reproducibility. */
new p5((p) => {
  const W = 1080, H = 1920, PIXEL = 2;
  const PALETTE = [
    // 형광 정원
    '#7CF5C6', '#63EEE7', '#8196FF', '#D98BFF', '#ECFF4A', '#FF87E8', '#FFCF4A',
    // 열대 과실
    '#40E0C1', '#58BFFF', '#8578FF', '#63F28E', '#FFB83F', '#FF5F91', '#F3FF54',
    // 산호 화원
    '#7EE7DB', '#9AE89E', '#9CB2FF', '#CFA0F2', '#FF786E', '#FFC857', '#F75DB5',
    // 애시드 숲
    '#B9F542', '#53DAB8', '#47C9E0', '#A687F2', '#FF6BAE', '#FF9A45', '#F3F45B',
    // 쿨 블룸
    '#79E8F4', '#83A7FF', '#B691FF', '#55EDB7', '#FF77C8', '#FFB25E', '#F7F46B'
  ];
  function selectColors(s) {
    // Separate RNG keeps color selection independent of the tree geometry.
    const random=rng(s ^ 0x51C0A7);
    const woodIndex=Math.floor(random()*PALETTE.length);
    let leafIndex=Math.floor(random()*(PALETTE.length-1));
    if(leafIndex>=woodIndex) leafIndex++;
    return {wood:PALETTE[woodIndex],leaf:PALETTE[leafIndex]};
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  let seed, canvas, tree=null, colors, progress=0, requested=0, previousTime=0;
  const STAGE_SECONDS=1.1;
  function rng(s) {
    return () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function randomSeed() {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  function freshSeed(x,y) {
    // Touch coordinates still contribute, while fresh entropy varies each run.
    let s=(randomSeed() ^ (x<<16) ^ y)>>>0;
    s=Math.imul(s ^ s>>>16,0x45d9f3b);
    s=(s ^ s>>>16)>>>0;
    return s===seed ? (s+1)>>>0:s;
  }
  function mask() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    return c.getContext('2d', { willReadFrequently: true });
  }
  // Stochastic parametric bracketed L-system.
  // A = leader apex; B = lateral apex; F = tapered internode;
  // K = leader steering; R = relative turn; [ / ] = save / restore turtle;
  // L = foliage along the preceding terminal internode.
  // Parallel productions: A -> K F [R B] A; B -> F [R B] R B.
  // Production probabilities and internode parameters vary with a seeded RNG.
  function makeTree(s) {
    const random = rng(s), range = (a,b) => lerp(a,b,random());
    const token = (op, props={}) => ({op,...props});
    const generations=12, lean=range(-.03,.03);
    const turns=2+Math.floor(random()*3);
    const candidates=[2,3,4,5,6,7,8,9,10];
    const turnNodes=[];
    for(let i=0;i<turns;i++)turnNodes.push(candidates.splice(Math.floor(random()*candidates.length),1)[0]);
    let headingSide=random()<.5 ? -1:1;
    let target=headingSide*range(.17,.26);
    const headings=Array.from({length:generations},(_,n)=>{
      if(turnNodes.includes(n)){headingSide*=-1;target=headingSide*range(.18,.26);}
      const jitter=range(-.015,.015);
      return n<3 ? jitter:target+jitter;
    });
    const levels=[2,5,8,10].map(n=>n+(random()<.45 ? 1 : 0));
    // Add 2–3 distinct primary branch sites between the original trunk nodes.
    const extraCount=random()<.5 ? 2:3;
    const available=Array.from({length:10},(_,i)=>i+2).filter(n=>!levels.includes(n));
    for(let i=0;i<extraCount;i++) {
      const pick=Math.floor(random()*available.length);
      levels.push(available.splice(pick,1)[0]);
    }
    levels.sort((a,b)=>a-b);
    const initialSide=random()<.5 ? -1:1;
    let word=[token('A',{n:0,w:range(17,23)})];
    function production(t) {
      if(t.op==='A') {
        if(t.n===generations) return [token('B',{d:2,l:65,w:t.w,side:1})];
        const n=t.n, side=initialSide*(levels.indexOf(n)%2===0 ? 1:-1);
        const out=[token('K',{target:headings[n]+lean,n}),
          token('F',{l:range(120,180)*(1-n*.025),w:t.w,end:t.w*.89,stage:n<5 ? 1:2,trunk:true})];
        if(levels.includes(n)) out.push(token('['),token('R',{a:side*range(.8,1.25)}),
          token('B',{d:3,l:range(85,130)*(1-n*.025),w:t.w*.40,side}),token(']'));
        out.push(token('A',{n:n+1,w:t.w*.89})); return out;
      }
      if(t.op==='B') {
        const {d,l,w,side}=t;
        const out=[token('R',{a:range(-.16,.16)})];
        if(d>=2) {
          // A real lateral twig starts midway along the supporting branch.
          // This distributes foliage through its length instead of at one tip.
          out.push(token('F',{l:l*.45,w,end:w*.85,stage:d===3 ? 2:3}),token('['),
            token('R',{a:-side*range(.5,1.0)}),
            token('B',{d:0,l:l*range(.45,.7),w:w*.32,side:-side}),token(']'),
            token('F',{l:l*.55,w:w*.85,end:Math.max(.6,w*.67),stage:d===3 ? 2:3}));
        } else out.push(token('F',{l,w,end:Math.max(.6,w*.67),stage:d===0 ? 4:3}));
        if(d===0) return [...out,token('L',{count:Math.max(5,Math.round(l/10)),start:.1})];
        if(d===1) out.push(token('L',{count:2,start:.2}));
        out.push(token('E',{chance:random(),angle:side*range(.55,1.0)}));
        out.push(token('['),token('R',{a:-side*range(.38,.85)}),
          token('B',{d:d-1,l:l*range(.45,.65),w:w*.53,side:-side}),token(']'),
          token('R',{a:side*range(.08,.32)}),
          token('B',{d:d-1,l:l*range(.62,.82),w:w*.69,side}));
        return out;
      }
      return [t];
    }
    for(let pass=0;pass<generations+5;pass++) word=word.flatMap(production);
    let state={x:0,y:0,a:-Math.PI/2,last:null,id:-1};
    const stack=[], segments=[], leaves=[], buds=[];
    for(const t of word) {
      if(t.op==='[') stack.push({...state});
      else if(t.op===']') state=stack.pop();
      else if(t.op==='R') state.a+=t.a;
      else if(t.op==='K') {
        // Discrete woody joints, with upward tropism and a weak centering bias.
        // Angles persist between joints; no spline or periodic wave is used.
        const deviation=state.a+Math.PI/2;
        const limit=(t.n<3 ? 5:20)*Math.PI/180;
        const target=clamp(t.target,-limit,limit);
        const step=clamp((target-deviation)*.65,-Math.PI/20,Math.PI/20);
        state.a=-Math.PI/2+clamp(deviation+step,-limit,limit);
      } else if(t.op==='F') {
        const end={x:state.x+Math.cos(state.a)*t.l,y:state.y+Math.sin(state.a)*t.l};
        const seg={x:state.x,y:state.y,ex:end.x,ey:end.y,w:t.w,end:t.end,stage:t.stage,parent:state.id,trunk:t.trunk===true};
        segments.push(seg); state={...state,...end,last:seg,id:segments.length-1};
      } else if(t.op==='E') {
        buds.push({x:state.x,y:state.y,a:state.a+t.angle,parent:state.id,chance:t.chance});
      } else if(t.op==='L') {
        const line=state.last;
        for(let j=0;j<t.count;j++) {
          const u=lerp(t.start,1,(j+range(.15,.85))/t.count), side=j%2 ? -1:1;
          const a=state.a+side*range(.65,1.3);
          const x=lerp(line.x,line.ex,u),y=lerp(line.y,line.ey,u);
          // Single leaves on short petioles; the L-system supplies the twigs.
          const shootLength=range(5,12);
          const ex=x+Math.cos(a)*shootLength,ey=y+Math.sin(a)*shootLength;
          segments.push({x,y,ex,ey,w:.8,end:.5,stage:Math.max(3,line.stage),parent:state.id});
          const petiole=segments.length-1;
          const leafCount=1;
          for(let k=0;k<leafCount;k++) {
            const v=(k+1)/leafCount, size=range(9,16);
            const la=a+(k===leafCount-1 ? range(-.25,.25) : (k%2 ? -1:1)*range(.4,.85));
            const lx=lerp(x,ex,v),ly=lerp(y,ey,v);
            leaves.push({x:lx+Math.cos(la)*size*.55,y:ly+Math.sin(la)*size*.55,
              parent:petiole,stage:Math.max(3,line.stage),a:la,size,aspect:range(.34,.53),alpha:range(.65,.98)});
          }
        }
      }
    }
    // Optional lateral buds: actual height within this tree gives a gentle bias.
    const treeHeight=-Math.min(...segments.map(v=>Math.min(v.y,v.ey)));
    for(const bud of buds) {
      const h=clamp(-bud.y/treeHeight,0,1);
      if(bud.chance>=.15+.20*h)continue;
      let x=bud.x,y=bud.y,parent=bud.parent;
      const length=range(20,38);
      for(let k=0;k<2;k++) {
        const a=bud.a+range(-.15,.15),ex=x+Math.cos(a)*length,ey=y+Math.sin(a)*length;
        segments.push({x,y,ex,ey,w:k===0 ? 1.1:.75,end:.5,stage:4,parent});
        parent=segments.length-1;
        for(let j=0;j<2;j++) {
          const la=a+(j ? 1:-1)*range(.4,.9),size=range(8,12);
          leaves.push({x:lerp(x,ex,.55+j*.35)+Math.cos(la)*size*.5,
            y:lerp(y,ey,.55+j*.35)+Math.sin(la)*size*.5,
            parent,stage:4,a:la,size,aspect:range(.34,.5),alpha:range(.65,.95)});
        }
        x=ex;y=ey;
      }
    }
    // Fit every generated silhouette including foliage; the root stays below the frame.
    const xs=segments.flatMap(v=>[v.x,v.ex]).concat(leaves.flatMap(v=>[v.x-v.size,v.x+v.size]));
    const ys=segments.flatMap(v=>[v.y,v.ey]).concat(leaves.map(v=>v.y-v.size));
    const minX=Math.min(...xs)-16,maxX=Math.max(...xs)+16,minY=Math.min(...ys)-16;
    const scale=Math.min((H-150)/(-minY),(W-170)/(maxX-minX));
    const offsetX=W/2-(minX+maxX)*scale/2;
    // Parent-first timing within each growth generation. Each generation occupies
    // one timeline unit regardless of the number of concurrent branches.
    const maxima=[0,0,0,0,0];
    for(const v of segments) {
      const parent=segments[v.parent];
      v.stage=Math.max(v.stage,parent ? parent.stage:1);
      v.rawStart=parent && parent.stage===v.stage ? parent.rawEnd:0;
      v.rawEnd=v.rawStart+.035+Math.hypot(v.ex-v.x,v.ey-v.y)/700;
      maxima[v.stage]=Math.max(maxima[v.stage],v.rawEnd);
    }
    for(const v of leaves) {
      const parent=segments[v.parent];v.stage=parent.stage;
      v.rawStart=parent.rawEnd+.04;v.rawEnd=v.rawStart+.16;
      maxima[v.stage]=Math.max(maxima[v.stage],v.rawEnd);
    }
    for(const v of [...segments,...leaves]) {
      v.start=v.stage-1+v.rawStart/maxima[v.stage]*.96;
      v.finish=v.stage-1+v.rawEnd/maxima[v.stage]*.96;
    }
    return {segments,leaves,scale,offsetX,minX,maxX,minY};
  }
  const wood=mask(), foliage=mask();
  wood.canvas.width=foliage.canvas.width=W/PIXEL;
  wood.canvas.height=foliage.canvas.height=H/PIXEL;
  const smooth=t=>t*t*(3-2*t);
  const output=mask();
  output.canvas.width=W/PIXEL;output.canvas.height=H/PIXEL;
  const frame=output.createImageData(W/PIXEL,H/PIXEL);
  function describeTree(t) {
    const trunk=t.segments.filter(v=>v.trunk);
    const tip=trunk[trunk.length-1];
    return {
      height:-t.minY*t.scaleY/H,
      lean:tip.ex/Math.max(1,-tip.ey),
      angles:trunk.map(v=>Math.atan2(v.ey-v.y,v.ex-v.x)+Math.PI/2)
    };
  }
  function neighborDifferences(a,b) {
    const height=Math.abs(a.height-b.height)>=.12;
    const lean=Math.abs(a.lean-b.lean)>=.07;
    const bend=Math.sqrt(a.angles.reduce((sum,v,i)=>sum+(v-b.angles[i])**2,0)/a.angles.length)>=.12;
    return Number(height)+Number(lean)+Number(bend);
  }
  function makeForest(s) {
    const random=rng(s ^ 0x312C9);
    const count=6+Math.floor(random()*2);
    const minGap=40;
    // Random gap weights distribute free space, with no equal-width slots.
    const marginLeft=180+random()*35,marginRight=180+random()*35;
    const span=W-marginLeft-marginRight;
    const weights=Array.from({length:count-1},()=>Math.pow(random(),2));
    const narrow=Math.floor(random()*weights.length);
    const wide=(narrow+1+Math.floor(random()*(weights.length-1)))%weights.length;
    weights[narrow]=.015;weights[wide]=1.5;
    const sum=weights.reduce((a,b)=>a+b,0),free=span-minGap*(count-1);
    const roots=[marginLeft];
    for(const weight of weights)roots.push(roots[roots.length-1]+minGap+free*weight/sum);
    const forest=[];
    // Continuous random heights, with only the small/large presence condition.
    let heights;
    do {
      heights=Array.from({length:count},()=>H*lerp(.40,.92,random()));
    } while(!heights.some(h=>h<=H*.55)||!heights.some(h=>h>=H*.82));
    for(let i=0;i<count;i++) {
      let chosen=null;
      // Every adjacent pair must differ in >=2 traits. A nearest neighbor on
      // this ground line is always one of those adjacent trees.
      for(let attempt=0;attempt<512;attempt++) {
        const treeSeed=(s+Math.imul(i+1,0x9e3779b9)+Math.imul(attempt,0x85ebca6b))>>>0;
        const t=makeTree(treeSeed);
        // Keep the assigned height. Retry or mirror the shape to fit the frame.
        t.scaleY=heights[i]/(-t.minY);t.scaleX=t.scaleY;t.offsetX=roots[i];
        const fits=()=>t.offsetX+t.minX*t.scaleX>=25 && t.offsetX+t.maxX*t.scaleX<=W-25;
        if(!fits()) {
          for(const v of t.segments){v.x=-v.x;v.ex=-v.ex;}
          for(const v of t.leaves){v.x=-v.x;v.a=Math.PI-v.a;}
          const oldMin=t.minX;t.minX=-t.maxX;t.maxX=-oldMin;
          if(!fits())continue;
        }
        t.heightGroup=heights[i]<=H*.55 ? 0:heights[i]>=H*.82 ? 2:1;
        t.treeSeed=treeSeed;t.colors=selectColors(treeSeed);
        t.features=describeTree(t);t.minRootGap=minGap;
        if(i===0||neighborDifferences(t.features,forest[i-1].features)>=2){chosen=t;break;}
      }
      if(!chosen)throw new Error('Could not generate sufficiently distinct neighboring trees');
      forest.push(chosen);
    }
    return forest;
  }
  function drawGrowth() {
    frame.data.fill(255);
    for(const t of tree) drawTree(t);
    output.putImageData(frame,0,0);
    // Copy explicitly to the full backing store: no p5 pixel-density/stride assumptions.
    const ctx=canvas.elt.getContext('2d');
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;
    ctx.drawImage(output.canvas,0,0,canvas.elt.width,canvas.elt.height);ctx.restore();
  }
  function drawTree(t) {
    const {segments,leaves,scaleX,scaleY,offsetX,colors,treeSeed}=t;
    for(const ctx of [wood,foliage]) {
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W/PIXEL,H/PIXEL);
      ctx.setTransform(scaleX/PIXEL,0,0,scaleY/PIXEL,offsetX/PIXEL,(H+4)/PIXEL);
    }
    wood.fillStyle='#000';
    for(const v of segments) {
      const f=clamp((progress-v.start)/(v.finish-v.start),0,1);
      if(f<=0)continue;
      const ex=lerp(v.x,v.ex,f),ey=lerp(v.y,v.ey,f);
      const a=Math.atan2(v.ey-v.y,v.ex-v.x),nx=-Math.sin(a),ny=Math.cos(a);
      const maturation=.8+.2*clamp((progress-v.finish)/.5,0,1);
      const w=v.w*maturation, end=lerp(v.w,v.end,f)*maturation;
      wood.beginPath();wood.moveTo(v.x+nx*w/2,v.y+ny*w/2);
      wood.lineTo(ex+nx*end/2,ey+ny*end/2);wood.lineTo(ex-nx*end/2,ey-ny*end/2);
      wood.lineTo(v.x-nx*w/2,v.y-ny*w/2);wood.closePath();wood.fill();
      wood.beginPath();wood.arc(v.x,v.y,w*.49,0,Math.PI*2);wood.fill();
    }
    for(const v of leaves) {
      const f=smooth(clamp((progress-v.start)/(v.finish-v.start),0,1));
      if(f<=0)continue;
      foliage.save();foliage.translate(v.x,v.y);foliage.rotate(v.a);
      foliage.globalAlpha=v.alpha;foliage.fillStyle='#000';foliage.beginPath();
      foliage.ellipse(0,0,v.size*f,v.size*v.aspect*f,0,0,Math.PI*2);
      foliage.fill();foliage.restore();
    }
    const a=wood.getImageData(0,0,W/PIXEL,H/PIXEL).data;
    const b=foliage.getImageData(0,0,W/PIXEL,H/PIXEL).data;
    const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    const wc=rgb(colors.wood),lc=rgb(colors.leaf),white=[255,255,255];

    for(let y=0;y<H/PIXEL;y++)for(let x=0;x<W/PIXEL;x++) {
      const j=y*(W/PIXEL)+x,i=j*4,wa=a[i+3]/255,fa=b[i+3]/255*.86;
      // Stable spatial dithering: no shimmering from new random samples per frame.
      let hash=Math.imul(j ^ treeSeed,0x45d9f3b);hash=Math.imul(hash ^ hash>>>16,0x45d9f3b);
      const sample=((hash ^ hash>>>16)>>>0)/4294967296;
      const color=sample<fa ? lc:sample<(wa>.7 ? 1:wa) ? wc:null;
      if(color) {
        frame.data[i]=color[0];frame.data[i+1]=color[1];frame.data[i+2]=color[2];
      }
    }
  }

  function begin(s) {
    seed=s>>>0;tree=makeForest(seed);progress=0;requested=1;
    document.querySelector('#seed').value=seed;
    document.querySelector('#controls').style.visibility='visible';
    previousTime=p.millis();p.loop();
  }
  function reset() {
    tree=null;progress=0;requested=0;p.background(255);p.noLoop();
    document.querySelector('#controls').style.visibility='hidden';
  }
  p.draw=()=>{
    if(!tree)return;
    const now=p.millis(),dt=Math.min((now-previousTime)/1000,.08);previousTime=now;
    progress=Math.min(requested,progress+dt/STAGE_SECONDS);
    drawGrowth();
    if(progress>=requested)p.noLoop();
  };
  p.setup=()=>{
    canvas=p.createCanvas(W,H);p.pixelDensity(1);canvas.parent('art');p.frameRate(30);reset();
    document.querySelector('#art').setAttribute('aria-label','화면 아래에서 터치할 때마다 함께 자라는 6~7그루의 숲. 총 네 번의 터치로 완성됩니다.');
    document.querySelector('#new').textContent='처음으로';
    document.querySelector('#controls button[type="submit"]').textContent='시드로 재현';
    canvas.elt.addEventListener('pointerdown',event=>{
      if(!event.isPrimary || event.button!==0)return;
      event.preventDefault();
      if(!tree) {
        const rect=canvas.elt.getBoundingClientRect();
        const x=Math.round(clamp((event.clientX-rect.left)/rect.width,0,1)*65535);
        const y=Math.round(clamp((event.clientY-rect.top)/rect.height,0,1)*65535);
        begin(freshSeed(x,y));
      } else if(requested<4) {requested++;previousTime=p.millis();p.loop();}
    });
    document.querySelector('#controls').addEventListener('submit',e=>{
      e.preventDefault();const value=document.querySelector('#seed').value.trim();
      if(/^\d+$/.test(value))begin(Number(value));
    });
    document.querySelector('#new').addEventListener('click',reset);
    document.querySelector('#save').addEventListener('click',()=>p.saveCanvas(canvas,`tree-${seed}`,'png'));
  };
});
