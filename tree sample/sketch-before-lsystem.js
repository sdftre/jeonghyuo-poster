/* θ = seed; H = makeTree; Tθ = stored branch/leaf geometry; y = rasterized pixels.
   No image assets. Geometry and sampling both use the seed for reproducibility. */
new p5((p) => {
  const W = 1080, H = 1920, PIXEL = 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  let seed, canvas;
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
  function mask() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    return c.getContext('2d', { willReadFrequently: true });
  }
  // A smoothly interpolated random spine; knot positions vary per tree.
  function spinePoint(knots, t) {
    const z = clamp(t, 0, 1) * (knots.length - 1);
    const i = Math.min(knots.length - 2, Math.floor(z)), f = z - i;
    const a = knots[Math.max(0, i - 1)], b = knots[i];
    const c = knots[i + 1], d = knots[Math.min(knots.length - 1, i + 2)];
    const x = .5 * ((2*b) + (-a+c)*f + (2*a-5*b+4*c-d)*f*f + (-a+3*b-3*c+d)*f*f*f);
    return { x, y: lerp(H + 14, 155, t) };
  }
  function stroke(ctx, a, b, width) {
    ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function makeTree(s) {
    const random = rng(s), range = (a,b) => lerp(a,b,random());
    const wood = mask(), foliage = mask();
    const base = range(435, 600), lean = range(-95, 95);
    const knots = Array.from({length: 8}, (_,i) => base + lean*i/7 + (i ? range(-85,85) : 0));
    const baseWidth = range(15, 21);
    let last = spinePoint(knots, 0);
    for (let j = 1; j <= 650; j++) {
      const t = j/650, next = spinePoint(knots,t);
      stroke(wood, last, next, 2 + baseWidth * Math.pow(1-t, .85)); last = next;
    }
    function leaf(x,y,angle,size) {
      foliage.save(); foliage.translate(x,y); foliage.rotate(angle);
      foliage.globalAlpha = range(.38,.92);
      foliage.fillStyle = '#000'; foliage.beginPath();
      foliage.ellipse(0,0,size,size*range(.32,.52),0,0,Math.PI*2);
      foliage.fill(); foliage.restore();
    }
    // Each branch continues upwards and sideways; descendants inherit heading.
    // Only terminal twigs carry leaves, leaving the trunk and major forks open.
    function branch(start, heading, length, width, depth) {
      const steps = Math.ceil(length/5), bend = range(-.65,.65);
      const points = [start]; let pos = start;
      for (let j=1;j<=steps;j++) {
        const t=j/steps, a=heading+bend*t + Math.sin(t*5)*.1;
        const next={x: pos.x+Math.cos(a)*length/steps, y:pos.y+Math.sin(a)*length/steps};
        stroke(wood,pos,next,Math.max(.7,width*(1-.65*t))); points.push(next); pos=next;
      }
      if (depth>0) {
        const count = depth===2 ? 3 : 2;
        for(let j=0;j<count;j++) {
          const t = range(.45,.95);
          const origin=points[Math.floor(t*steps)];
          const turn=(j%2 ? 1 : -1)*range(.35,.85);
          branch(origin,heading+bend*t+turn,length*range(.30,.48),width*.48,depth-1);
        }
      } else {
        for(let j=2;j<points.length;j+=2) {
          const a=heading+bend*j/steps;
          const side=j%4 ? 1 : -1, off=range(5,14), point=points[j];
          const x=point.x+Math.cos(a+side*Math.PI/2)*off;
          const y=point.y+Math.sin(a+side*Math.PI/2)*off;
          stroke(wood,point,{x,y},.6);
          leaf(x,y,a+side*range(.55,1.1),range(6,12));
          if(random()<.35) leaf(x+range(-8,8),y+range(-7,7),a+range(-1,1),range(4,8));
        }
      }
    }
    const count=4+Math.floor(random()*2);
    let side=random()<.5 ? -1 : 1;
    for(let i=0;i<count;i++) {
      // Stratified heights ensure separated foliage islands rather than a solid crown.
      const t=lerp(.30,.93,i/(count-1))+range(-.025,.025);
      const origin=spinePoint(knots,t);
      const desiredSide=random()<.8 ? -side : side; side=desiredSide;
      const heading=side>0 ? range(-.55,-.14) : Math.PI+range(.14,.55);
      const available=side>0 ? W-100-origin.x : origin.x-100;
      const length=Math.min(range(155,265)*(1-.24*t),available*.65);
      branch(origin,heading,length,range(3.0,5.5)*(1-.4*t),2);
    }
    branch(spinePoint(knots,.93),range(-1.8,-1.0),range(70,115),2.2,1);
    return { wood, foliage };
  }
  function render(s) {
    seed=s>>>0; document.querySelector('#seed').value=seed;
    const tree=makeTree(seed), random=rng(seed ^ 0x78AB91);
    const a=tree.wood.getImageData(0,0,W,H).data;
    const b=tree.foliage.getImageData(0,0,W,H).data;
    p.background(255); p.noStroke(); p.fill(0);
    // Coverage sampling on a fixed grid. Output contains only black 2px squares.
    for(let y=0;y<H;y+=PIXEL) for(let x=0;x<W;x+=PIXEL) {
      let wa=0,fa=0;
      for(let dy=0;dy<PIXEL;dy++) for(let dx=0;dx<PIXEL;dx++) {
        const i=((y+dy)*W+x+dx)*4+3; wa+=a[i]; fa+=b[i];
      }
      wa/=255*PIXEL*PIXEL; fa/=255*PIXEL*PIXEL;
      const probability=Math.max(wa>.7 ? 1 : wa,fa*.86);
      if(probability>0 && random()<probability) p.rect(x,y,PIXEL,PIXEL);
    }
  }
  p.setup=()=>{
    p.pixelDensity(1); canvas=p.createCanvas(W,H); canvas.parent('art'); p.noLoop();
    canvas.elt.addEventListener('click',()=>render(randomSeed()));
    const query=new URLSearchParams(location.search).get('seed');
    render(query!==null && /^\d+$/.test(query) ? Number(query) : randomSeed());
    document.querySelector('#controls').addEventListener('submit',e=>{
      e.preventDefault(); const value=document.querySelector('#seed').value.trim();
      if(/^\d+$/.test(value)) render(Number(value));
    });
    document.querySelector('#new').addEventListener('click',()=>render(randomSeed()));
    document.querySelector('#save').addEventListener('click',()=>p.saveCanvas(canvas,`tree-${seed}`,'png'));
  };
});
