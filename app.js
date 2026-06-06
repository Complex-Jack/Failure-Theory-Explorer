const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};
const value = (id) => Math.max(Number($(id).value) || 0, id.startsWith("#s") ? 0.001 : -Infinity);
const strengths = () => ({ syt:value("#syt"), syc:value("#syc"), sut:value("#sut"), suc:value("#suc") });
let swapPrincipalAxes = false;
const stress = () => {
  const sx=Number($("#sigmaX").value)||0, sy=Number($("#sigmaY").value)||0, txy=Number($("#tauXY").value)||0;
  const avg=(sx+sy)/2, radius=Math.hypot((sx-sy)/2,txy);
  const high=avg+radius, low=avg-radius;
  const a=swapPrincipalAxes?low:high, b=swapPrincipalAxes?high:low;
  const [p1,p2,p3]=[a,b,0].sort((x,y)=>y-x);
  return { a, b, p1, p2, p3, sx, sy, txy };
};
const ordered = (a,b) => ({ hi:Math.max(a,b), lo:Math.min(a,b) });
const principal3 = (a,b) => {
  const [p1,p2,p3]=[a,b,0].sort((x,y)=>y-x);
  return {p1,p2,p3};
};
const safeRatio = (strength, demand) => demand > 1e-10 ? strength / demand : Infinity;

const theories = [
  { id:"ductile-normal", family:"ductile", name:"Maximum Normal Stress", short:"MNS · tensile yield", color:"#7d5fff", fos:(a,b,s)=>{const {p1,p3}=principal3(a,b);return safeRatio(s.syt,Math.max(Math.abs(p1),Math.abs(p3)));} },
  { id:"tresca", family:"ductile", name:"Maximum Shear Stress", short:"Tresca · tensile yield", color:"#008d76", fos:(a,b,s)=>{const {p1,p3}=principal3(a,b);return safeRatio(s.syt,p1-p3);} },
  { id:"von-mises", family:"ductile", name:"Distortion Energy", short:"von Mises · tensile yield", color:"#e69b00", fos:(a,b,s)=>{const {p1,p2,p3}=principal3(a,b);return safeRatio(s.syt,Math.sqrt(((p1-p2)**2+(p2-p3)**2+(p3-p1)**2)/2));} },
  { id:"ductile-cm", family:"ductile", name:"Ductile Coulomb–Mohr", short:"asymmetric yield", color:"#e55934", fos:(a,b,s)=>{const {p1,p3}=principal3(a,b);return coulombMohr(p1,p3,s.syt,s.syc);} },
  { id:"brittle-normal", family:"brittle", name:"Maximum Normal Stress", short:"ultimate strengths", color:"#3378c5", fos:(a,b,s)=>{const {p1,p3}=principal3(a,b);return Math.min(p1>0?safeRatio(s.sut,p1):Infinity,p3<0?safeRatio(s.suc,-p3):Infinity);} },
  { id:"brittle-cm", family:"brittle", name:"Brittle Coulomb–Mohr", short:"asymmetric ultimate", color:"#bd4cb7", fos:(a,b,s)=>{const {p1,p3}=principal3(a,b);return coulombMohr(p1,p3,s.sut,s.suc);} },
  { id:"modified-mohr", family:"brittle", name:"Modified Mohr", short:"refined mixed-sign", color:"#3f5964", fos:(a,b,s)=>{const {p1,p3}=principal3(a,b);return modifiedMohr(p1,p3,s);} },
];
let family = "ductile";
const enabled = new Set(theories.filter((t) => t.id !== "ductile-cm").map((t) => t.id));
const maxAttempts = 3;
let attempts = 0;
let revealPlotValues = false;

function coulombMohr(a,b,tension,compression){
  const {hi,lo}=ordered(a,b);
  if(lo>=0)return safeRatio(tension,hi);
  if(hi<=0)return safeRatio(compression,-lo);
  return 1/(hi/tension-lo/compression);
}
function modifiedMohr(a,b,s){
  const {hi,lo}=ordered(a,b);
  if(lo>=0)return safeRatio(s.sut,hi);
  if(hi<=0)return safeRatio(s.suc,-lo);
  if(Math.abs(lo/hi)<=1)return 1/(hi/s.sut-lo/s.suc);
  return 1/(((s.suc-s.sut)*hi)/(s.suc*s.suc)-lo/s.suc);
}
function visibleTheories(){
  return theories.filter((t)=>(family==="both"||t.family===family)&&enabled.has(t.id));
}
function renderToggles(){
  $("#theoryToggles").innerHTML=theories.filter((t)=>family==="both"||t.family===family).map((t)=>`
    <label class="theory-toggle" style="--color:${t.color}">
      <input type="checkbox" data-id="${t.id}" ${enabled.has(t.id)?"checked":""}>
      <i></i><span><strong>${t.name}</strong><small>${t.family} · ${t.short}</small></span>
    </label>`).join("");
  $$("#theoryToggles input").forEach((box)=>box.addEventListener("change",()=>{box.checked?enabled.add(box.dataset.id):enabled.delete(box.dataset.id);resetAttempts();render();}));
}
function surfacePoints(theory,s){
  const points=[];
  for(let i=0;i<=360;i++){
    const angle=i*Math.PI/180, a=Math.cos(angle), b=Math.sin(angle);
    const n=theory.fos(a,b,s);
    points.push([a*n,b*n]);
  }
  return points;
}
function renderPlot(){
  const svg=$("#yieldPlot"), s=strengths(), load=stress(), active=visibleTheories();
  svg.replaceChildren();
  svg.dataset.loadA=load.a;
  svg.dataset.loadB=load.b;
  const W=760,H=650,pad=62;
  const all=active.flatMap((t)=>surfacePoints(t,s));
  const maxVal=Math.max(s.syc,s.suc,s.syt,s.sut,Math.abs(load.a),Math.abs(load.b),...all.flatMap(p=>p.map(Math.abs)));
  const extent=Math.ceil(maxVal*1.12/100)*100 || 100;
  const x=(v)=>pad+(v+extent)/(2*extent)*(W-2*pad), y=(v)=>H-pad-(v+extent)/(2*extent)*(H-2*pad);
  const grid=el("g"), curves=el("g"), labels=el("g");
  for(let i=-4;i<=4;i++){
    const v=extent*i/4;
    grid.append(el("line",{x1:x(v),y1:pad,x2:x(v),y2:H-pad,stroke:i===0?"#68716c":"#deded7","stroke-width":i===0?1.3:1}));
    grid.append(el("line",{x1:pad,y1:y(v),x2:W-pad,y2:y(v),stroke:i===0?"#68716c":"#deded7","stroke-width":i===0?1.3:1}));
    const tx=el("text",{x:x(v),y:y(0)+17,fill:"#7b827e","text-anchor":"middle","font-family":"DM Mono","font-size":9});tx.textContent=Math.round(v);labels.append(tx);
    if(i!==0){const ty=el("text",{x:x(0)-8,y:y(v)+3,fill:"#7b827e","text-anchor":"end","font-family":"DM Mono","font-size":9});ty.textContent=Math.round(v);labels.append(ty);}
  }
  active.forEach((t)=>{
    const pts=surfacePoints(t,s);
    const d=pts.map((p,i)=>`${i?"L":"M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")+" Z";
    curves.append(el("path",{d,fill:t.color+"08",stroke:t.color,"stroke-width":2,"stroke-linejoin":"round"}));
  });
  curves.append(el("circle",{cx:x(load.a),cy:y(load.b),r:7,fill:"#ff5c35",stroke:"#fff","stroke-width":3}));
  const lp=el("text",{x:x(load.a)+11,y:y(load.b)-11,fill:"#b63c20","font-family":"DM Mono","font-size":10,"font-weight":500});lp.textContent=revealPlotValues?`LOAD A, B = (${load.a.toFixed(1)}, ${load.b.toFixed(1)})`:"LOAD A, B";labels.append(lp);
  const xl=el("text",{x:W-pad,y:y(0)-12,fill:"#444d48","text-anchor":"end","font-family":"DM Mono","font-size":10});xl.textContent="σA (MPa)";labels.append(xl);
  const yl=el("text",{x:x(0)+12,y:pad+4,fill:"#444d48","font-family":"DM Mono","font-size":10});yl.textContent="σB (MPa)";labels.append(yl);
  svg.append(grid,curves,labels);
}
function renderResults(){
  const s=strengths(),{a,b}=stress();
  $("#resultCards").innerHTML=visibleTheories().map((t)=>{
    return `<article class="result-card" data-theory="${t.id}" style="--color:${t.color}">
      <span class="family">${t.family}</span>
      <h3>${t.name}</h3>
      <div class="answer-row"><span>n =</span><input type="number" inputmode="decimal" step="0.01" aria-label="${t.name} factor of safety"></div>
      <p class="feedback">Awaiting answer</p>
    </article>`;
  }).join("")||"<p class='footnote'>Select at least one theory to compare.</p>";
}
function resetAttempts(){
  attempts=0; revealPlotValues=false;
  $("#attemptStatus").textContent=`Attempt 1 of ${maxAttempts}`;
  $("#checkAnswers").disabled=false;
  $("#plotCaption").hidden=true;
}
function render(){renderPlot();renderResults();}

function generateCase(){
  const quadrant=Math.floor(Math.random()*4);
  const signA=quadrant===0||quadrant===3?1:-1;
  const signB=quadrant<2?1:-1;
  let a=signA*(0.35+Math.random()*0.65);
  let b=signB*(0.35+Math.random()*0.65);
  const currentEquivalent=Math.sqrt(a*a-a*b+b*b);
  const targetFos=0.5+Math.random()*2.5;
  const scale=strengths().syt/(targetFos*currentEquivalent);
  a*=scale; b*=scale;
  swapPrincipalAxes=a<b;
  const theta=Math.random()*Math.PI;
  const avg=(a+b)/2, halfDiff=(a-b)/2;
  const sx=avg+halfDiff*Math.cos(2*theta);
  const sy=avg-halfDiff*Math.cos(2*theta);
  const txy=halfDiff*Math.sin(2*theta);
  $("#sigmaX").value=sx.toFixed(1);
  $("#sigmaY").value=sy.toFixed(1);
  $("#tauXY").value=txy.toFixed(1);
  resetAttempts();
  render();
}
function guidance(answer,correct,theory){
  if(!Number.isFinite(answer))return "Enter a numerical factor of safety.";
  const ratio=answer/correct;
  if(Math.abs(ratio-1)<=0.02)return "Correct.";
  if(theory.id==="tresca"&&Math.abs(ratio-2)<=0.08)return "You may have divided Sy by τmax. Tresca compares τmax with Sy/2.";
  if(Math.abs(ratio-2)<=0.08||Math.abs(ratio-0.5)<=0.04)return "Check whether a factor of 2 belongs in your criterion.";
  if(ratio>1.02&&ratio<1.2)return "Close, but high. Check rounding and your governing stress difference.";
  if(ratio<0.98&&ratio>0.8)return "Close, but low. Check rounding and your governing stress difference.";
  if(ratio>1)return "Too high. Recheck the criterion equation and governing stress term.";
  return "Too low. Recheck the criterion equation and governing stress term.";
}
function checkAnswers(){
  const s=strengths(),{a,b}=stress();
  attempts+=1;
  const finalAttempt=attempts>=maxAttempts;
  visibleTheories().forEach((t)=>{
    const card=$(`.result-card[data-theory="${t.id}"]`), input=card.querySelector("input"), answer=input.value.trim()===""?NaN:Number(input.value), correct=t.fos(a,b,s);
    const accepted=Number.isFinite(answer)&&Math.abs(answer-correct)<=Math.max(0.02,Math.abs(correct)*0.02);
    card.classList.toggle("correct",accepted); card.classList.toggle("incorrect",!accepted);
    card.querySelector(".feedback").textContent=finalAttempt&&!accepted?`Solution: n = ${correct.toFixed(3)}. For plane stress, sort {σA, σB, 0} into σ₁ ≥ σ₂ ≥ σ₃ before applying the criterion.`:guidance(answer,correct,t);
    if(finalAttempt)input.disabled=true;
  });
  if(finalAttempt){
    revealPlotValues=true; $("#plotCaption").hidden=false; $("#checkAnswers").disabled=true; $("#attemptStatus").textContent="Solutions revealed"; renderPlot();
  }else{
    $("#attemptStatus").textContent=`Attempt ${attempts+1} of ${maxAttempts}`;
    if(attempts===maxAttempts-1){
      revealPlotValues=true;
      renderPlot();
    }
  }
}
$("#newCase").addEventListener("click",generateCase);
$("#checkAnswers").addEventListener("click",checkAnswers);
$$("input[type=number]").forEach((input)=>input.addEventListener("input",()=>{resetAttempts();render();}));
$$(".family-toggle button").forEach((button)=>button.addEventListener("click",()=>{
  family=button.dataset.family;
  $$(".family-toggle button").forEach((b)=>b.classList.toggle("active",b===button));
  resetAttempts();renderToggles();render();
}));
renderToggles();generateCase();
