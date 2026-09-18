import { testPlanarity } from './planarity-core.js';

const svg = document.getElementById('board');
const world = document.getElementById('world');
const edgeLayer = document.getElementById('edges');
const vertexLayer = document.getElementById('vertices');
const vertexCountInput = document.getElementById('vertexCount');
const timerEl = document.getElementById('timer');
const movesEl = document.getElementById('moves');
const statusEl = document.getElementById('status');
const clearOverlay = document.getElementById('clearOverlay');
const clearTimeEl = document.getElementById('clearTime');
const clearMovesEl = document.getElementById('clearMoves');

const state = {
  n: 20, edges: [], positions: [], initialPositions: [],
  zoom: 1, panX: 0, panY: 0, moves: 0, startedAt: null, elapsed: 0,
  dragging: null, panning: null, solved: false, crossingPairs: new Set(),
  seed: 1
};

const NS = 'http://www.w3.org/2000/svg';
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const key = (a,b) => a < b ? a + ':' + b : b + ':' + a;

class RNG {
  constructor(seed) { this.s = seed >>> 0 || 1; }
  next() { this.s = (1664525 * this.s + 1013904223) >>> 0; return this.s / 4294967296; }
  int(n) { return Math.floor(this.next() * n); }
  shuffle(a) { for (let i=a.length-1;i>0;i--) { const j=this.int(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
}

function nextSeed() {
  state.seed = (crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now()) >>> 0;
}

function addEdge(set, a, b) {
  if (a === b) return;
  set.add(key(a,b));
}

function edgeListFromSet(set) {
  return [...set].map(k => k.split(':').map(Number));
}

function generatePlanarGraph(n, rng) {
  // Build a planar graph from a polygon, then add only noncrossing diagonals.
  // The result is guaranteed planar by construction; Boyer-Myrvold is then
  // run on the completed graph to validate the generated instance.
  const edges = new Set();
  if (n === 4) {
    addEdge(edges,0,1); addEdge(edges,1,2); addEdge(edges,2,3); addEdge(edges,3,0);
  } else {
    for (let i=0;i<n;i++) addEdge(edges,i,(i+1)%n);
    const candidates = [];
    for (let a=0;a<n;a++) for (let b=a+2;b<n;b++) {
      if (a===0 && b===n-1) continue;
      candidates.push([a,b]);
    }
    rng.shuffle(candidates);
    const coords = Array.from({length:n},(_,i)=> {
      const t=2*Math.PI*i/n;
      return {x:Math.cos(t),y:Math.sin(t)};
    });
    for (const [a,b] of candidates) {
      const ok = ![...edges].some(k => {
        const [c,d]=k.split(':').map(Number);
        if (a===c||a===d||b===c||b===d) return false;
        return segmentsProper(coords[a],coords[b],coords[c],coords[d]);
      });
      if (ok && rng.next() < 0.55) addEdge(edges,a,b);
    }
    // Occasionally add a hub to vary the structure; its spokes are planar.
    if (rng.next() < 0.38) {
      const hub = rng.int(n);
      for (let i=0;i<n;i++) if (i!==hub) addEdge(edges,hub,i);
    }
  }
  return edgeListFromSet(edges);
}

function orient(a,b,c) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
function onSegment(a,b,p) {
  return Math.min(a.x,b.x)-1e-9<=p.x && p.x<=Math.max(a.x,b.x)+1e-9 &&
         Math.min(a.y,b.y)-1e-9<=p.y && p.y<=Math.max(a.y,b.y)+1e-9;
}
function segmentsProper(a,b,c,d) {
  const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
  return ((o1>1e-9&&o2<-1e-9)||(o1<-1e-9&&o2>1e-9)) &&
         ((o3>1e-9&&o4<-1e-9)||(o3<-1e-9&&o4>1e-9));
}
function segmentsCross(a,b,c,d) { return segmentsProper(a,b,c,d); }

function layoutPositions(n) {
  const rect = svg.getBoundingClientRect();
  const r = Math.max(120, Math.min(rect.width, rect.height) * 0.33);
  const cx = rect.width / 2, cy = rect.height / 2;
  return Array.from({length:n},(_,i)=>{
    const t = 2*Math.PI*i/n - Math.PI/2;
    return {x:cx+r*Math.cos(t), y:cy+r*Math.sin(t)};
  });
}

function scramblePositions(initial, rng) {
  const out = initial.map(p=>({...p}));
  const order = [...Array(state.n).keys()];
  rng.shuffle(order);
  const shuffled = order.map(i=>({...initial[i]}));
  // Apply a few random continuous offsets so puzzles are not merely permutations.
  for (let i=0;i<out.length;i++) {
    out[i] = shuffled[i];
    out[i].x += (rng.next()-.5)*55;
    out[i].y += (rng.next()-.5)*55;
  }
  return out;
}

function transformPoint(p) {
  const rect=svg.getBoundingClientRect();
  return { x:(p.x-state.panX-rect.width/2)/state.zoom+rect.width/2,
           y:(p.y-state.panY-rect.height/2)/state.zoom+rect.height/2 };
}
function worldPointFromEvent(e) {
  const rect=svg.getBoundingClientRect();
  return { x:(e.clientX-rect.left-state.panX-rect.width/2)/state.zoom+rect.width/2,
           y:(e.clientY-rect.top-state.panY-rect.height/2)/state.zoom+rect.height/2 };
}
function applyTransform() {
  const rect=svg.getBoundingClientRect();
  world.setAttribute('transform', `translate(${rect.width/2+state.panX} ${rect.height/2+state.panY}) scale(${state.zoom}) translate(${-rect.width/2} ${-rect.height/2})`);
  document.getElementById('zoomReset').textContent = Math.round(state.zoom*100)+'%';
}

function updateTimer() {
  if (state.startedAt && !state.solved) {
    state.elapsed=(performance.now()-state.startedAt)/1000;
    timerEl.textContent=state.elapsed.toFixed(1);
    requestAnimationFrame(updateTimer);
  }
}

function edgePairsCrossing() {
  const bad=new Set();
  for (let i=0;i<state.edges.length;i++) {
    const [a,b]=state.edges[i];
    for (let j=i+1;j<state.edges.length;j++) {
      const [c,d]=state.edges[j];
      if (a===c||a===d||b===c||b===d) continue;
      if (segmentsCross(state.positions[a],state.positions[b],state.positions[c],state.positions[d])) bad.add(i+':'+j);
    }
  }
  return bad;
}

function render() {
  edgeLayer.replaceChildren();
  vertexLayer.replaceChildren();
  const bad=edgePairsCrossing();
  state.crossingPairs=bad;
  const selected=state.dragging?.vertex;
  const neighbors=new Set();
  if (selected!==undefined) for (const [a,b] of state.edges) {
    if(a===selected) neighbors.add(b);
    if(b===selected) neighbors.add(a);
  }

  state.edges.forEach(([a,b],i)=>{
    const l=document.createElementNS(NS,'line');
    l.classList.add('edge');
    if ([...bad].some(k=>k===i+':'+(i+1) || k.startsWith(i+':') || k.endsWith(':'+i))) l.classList.add('crossing');
    if (selected!==undefined && (a===selected||b===selected)) l.classList.add('neighbor');
    l.setAttribute('x1',state.positions[a].x); l.setAttribute('y1',state.positions[a].y);
    l.setAttribute('x2',state.positions[b].x); l.setAttribute('y2',state.positions[b].y);
    edgeLayer.appendChild(l);
  });
  for(let i=0;i<state.n;i++){
    const c=document.createElementNS(NS,'circle');
    c.classList.add('vertex');
    if(i===selected)c.classList.add('selected');
    else if(neighbors.has(i))c.classList.add('neighbor');
    c.setAttribute('cx',state.positions[i].x); c.setAttribute('cy',state.positions[i].y);
    c.setAttribute('r','8');
    c.dataset.vertex=i;
    vertexLayer.appendChild(c);
  }
  applyTransform();
  if (!state.solved && bad.size===0 && state.startedAt) finish();
}

function finish() {
  state.solved=true;
  state.elapsed=(performance.now()-state.startedAt)/1000;
  timerEl.textContent=state.elapsed.toFixed(1);
  clearTimeEl.textContent=state.elapsed.toFixed(1);
  clearMovesEl.textContent=state.moves;
  clearOverlay.hidden=false;
  statusEl.textContent='Solved';
}

function startTimer() {
  if (state.startedAt || state.solved) return;
  state.startedAt=performance.now();
  requestAnimationFrame(updateTimer);
}

function resetPuzzle() {
  state.positions=state.initialPositions.map(p=>({...p}));
  state.moves=0; state.startedAt=null; state.elapsed=0; state.solved=false;
  timerEl.textContent='0.0'; movesEl.textContent='0'; clearOverlay.hidden=true; statusEl.textContent='';
  render();
}

async function newPuzzle() {
  const n=clamp(parseInt(vertexCountInput.value,10)||20,4,100);
  vertexCountInput.value=n; state.n=n; nextSeed();
  const rng=new RNG(state.seed);
  state.edges=generatePlanarGraph(n,rng);
  const check=await testPlanarity(n,state.edges);
  if(!check.planar) throw new Error('Generated graph failed the Boyer-Myrvold planarity test.');
  const base=layoutPositions(n);
  state.initialPositions=base.map(p=>({...p}));
  state.positions=scramblePositions(base,rng);
  state.panX=0; state.panY=0; state.zoom=1;
  state.moves=0; state.startedAt=null; state.elapsed=0; state.solved=false;
  timerEl.textContent='0.0'; movesEl.textContent='0'; clearOverlay.hidden=true;
  statusEl.textContent='';
  render();
}

function pointerDown(e) {
  if(state.solved) return;
  const target=e.target.closest?.('.vertex');
  if(target){
    const v=Number(target.dataset.vertex);
    state.dragging={vertex:v, startX:e.clientX,startY:e.clientY, moved:false, offset: (()=> {
      const p=worldPointFromEvent(e); return {x:state.positions[v].x-p.x,y:state.positions[v].y-p.y};
    })()};
    svg.setPointerCapture(e.pointerId);
    startTimer();
  } else {
    state.panning={x:e.clientX,y:e.clientY,panX:state.panX,panY:state.panY};
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
  }
  render();
}
function pointerMove(e) {
  if(state.dragging){
    const p=worldPointFromEvent(e), d=state.dragging;
    if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>3) d.moved=true;
    if(d.moved){
      state.positions[d.vertex]={x:p.x+d.offset.x,y:p.y+d.offset.y};
      render();
    }
  } else if(state.panning){
    state.panX=state.panning.panX+(e.clientX-state.panning.x);
    state.panY=state.panning.panY+(e.clientY-state.panning.y);
    applyTransform();
  }
}
function pointerUp(e) {
  if(state.dragging){
    if(state.dragging.moved){state.moves++;movesEl.textContent=state.moves;}
    state.dragging=null;
    render();
  }
  if(state.panning){state.panning=null;svg.classList.remove('dragging');}
  if(svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
}

svg.addEventListener('pointerdown',pointerDown);
svg.addEventListener('pointermove',pointerMove);
svg.addEventListener('pointerup',pointerUp);
svg.addEventListener('pointercancel',pointerUp);

document.getElementById('resetBtn').onclick=resetPuzzle;
document.getElementById('newBtn').onclick=()=>newPuzzle().catch(err=>statusEl.textContent=err.message);
document.getElementById('overlayNew').onclick=()=>newPuzzle().catch(err=>statusEl.textContent=err.message);
vertexCountInput.addEventListener('change',()=>newPuzzle().catch(err=>statusEl.textContent=err.message));

document.getElementById('zoomIn').onclick=()=>{state.zoom=clamp(state.zoom*1.2,.35,3);applyTransform();};
document.getElementById('zoomOut').onclick=()=>{state.zoom=clamp(state.zoom/1.2,.35,3);applyTransform();};
document.getElementById('zoomReset').onclick=()=>{state.zoom=1;state.panX=0;state.panY=0;applyTransform();};

document.getElementById('themeBtn').onclick=()=>{
  const light=document.documentElement.classList.toggle('light');
  document.getElementById('themeBtn').textContent=light?'Dark':'Light';
  localStorage.setItem('planarity-theme',light?'light':'dark');
};
if(localStorage.getItem('planarity-theme')==='light'){
  document.documentElement.classList.add('light');
  document.getElementById('themeBtn').textContent='Dark';
}
window.addEventListener('resize',()=>{
  if(!state.startedAt && state.initialPositions.length) {
    const base=layoutPositions(state.n);
    state.initialPositions=base.map(p=>({...p}));
    state.positions=base.map(p=>({...p}));
  }
  render();
});
newPuzzle().catch(err=>{statusEl.textContent=err.message;console.error(err);});
