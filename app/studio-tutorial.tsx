"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { InterfaceMode } from '../lib/interface-mode';
import { TUTORIAL_COMPLETION_KEY, tutorialDestination, tutorialSteps, type TutorialView } from '../lib/studio-tutorial';

interface Props {
  runtime: 'browser' | 'desktop';
  hasChart: boolean;
  view: TutorialView;
  onNavigate: (view: TutorialView) => void;
  onPreviewMode: (mode: InterfaceMode | null) => void;
  onClose: () => void;
}

export function StudioTutorial({runtime, hasChart, view, onNavigate, onPreviewMode, onClose}: Props) {
  const [track, setTrack] = useState<InterfaceMode | null>(null);
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState<Partial<Record<InterfaceMode, boolean>>>(() => {
    try { const value = JSON.parse(window.localStorage.getItem(TUTORIAL_COMPLETION_KEY) || '{}'); return {simple:value?.simple === true, advanced:value?.advanced === true}; }
    catch { return {}; }
  });
  const steps = useMemo(()=>tutorialSteps(track ?? 'simple', runtime),[track,runtime]);
  const step = track ? steps[index] : null;
  const panel = useRef<HTMLElement>(null);
  const [geometry, setGeometry] = useState<{top:number;left:number;target:DOMRect | null}>({top:16,left:16,target:null});
  useEffect(()=> {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      onPreviewMode(null);
      if (previous?.isConnected && !document.querySelector('[aria-modal="true"]')) previous.focus();
    };
  },[onPreviewMode]);
  useEffect(()=> {
    onPreviewMode(track);
    if (step) onNavigate(tutorialDestination(step,hasChart));
  },[track,step,hasChart,onNavigate,onPreviewMode]);
  useLayoutEffect(()=> {
    let frame = 0;
    const position = () => {
      if (!panel.current) return;
      const width = window.innerWidth, height = window.innerHeight;
      const bounds = panel.current.getBoundingClientRect();
      const clamp = (n:number,max:number)=>Math.max(16,Math.min(n,Math.max(16,max)));
      const candidates = step && (!step.needsChart || hasChart) ? [...document.querySelectorAll<HTMLElement>(step.target)] : [];
      const anchor = candidates.find(el=>el.getClientRects().length && el.getBoundingClientRect().width > 0);
      const rect = anchor?.getBoundingClientRect();
      const visible = rect && rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width;
      const rightFits = visible && rect.right + bounds.width + 32 < width;
      setGeometry({
        top:clamp(visible ? rect.bottom + 16 : (height-bounds.height)/2,height-bounds.height-16),
        left:clamp(rightFits ? rect.right + 16 : visible ? rect.left : (width-bounds.width)/2,width-bounds.width-16),
        target:visible ? new DOMRect(Math.max(4,rect.left-5),Math.max(4,rect.top-5),Math.max(0,Math.min(width-4,rect.right+5)-Math.max(4,rect.left-5)),Math.max(0,Math.min(height-4,rect.bottom+5)-Math.max(4,rect.top-5))) : null,
      });
    };
    const schedule = ()=> {cancelAnimationFrame(frame);frame=requestAnimationFrame(position);};
    const anchor = step && (!step.needsChart || hasChart) ? document.querySelector<HTMLElement>(step.target) : null;
    anchor?.scrollIntoView({block:'nearest',inline:'nearest'});
    position();
    const observer = new ResizeObserver(schedule);
    if(panel.current) observer.observe(panel.current);
    if(anchor) observer.observe(anchor);
    window.addEventListener('resize',schedule);
    window.addEventListener('scroll',schedule,true);
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);};
  },[step,view,hasChart]);
  useEffect(()=> {panel.current?.focus();},[track,index]);
  useEffect(()=> {
    const anchor = step ? document.querySelector<HTMLElement>(step.target) : null;
    const details = anchor?.closest('details');
    if (!details) return;
    const wasOpen = details.open;
    details.open = true;
    return ()=> { if (details.isConnected) details.open = wasOpen; };
  },[step,view]);
  const finish = () => {
    if(track) {
      const next={...completed,[track]:true};setCompleted(next);
      try {window.localStorage.setItem(TUTORIAL_COMPLETION_KEY,JSON.stringify(next));} catch { /* Completion is optional device preference storage. */ }
    }
    onClose();
  };
  return <div className="onboarding-tour" data-tutorial-mode={track ?? 'choose'} data-tutorial-step={step?.id ?? 'choose'}>
    {geometry.target ? <div className="onboarding-tour__spotlight" aria-hidden="true" style={{top:geometry.target.top,left:geometry.target.left,width:geometry.target.width,height:geometry.target.height}}/> : <div className="onboarding-tour__shade" aria-hidden="true"/>}
    <section ref={panel} className={`onboarding-tour__panel${track ? '' : ' onboarding-tour__panel--chooser'}`} role="dialog" aria-modal="true" aria-labelledby="studio-tutorial-title" tabIndex={-1} style={{top:geometry.top,left:geometry.left}} onKeyDown={event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key==='Tab') {
        const controls=[...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled), select, a[href]')].filter(el=>el.getClientRects().length);
        const first=controls[0], last=controls.at(-1);
        if(event.shiftKey && (document.activeElement===first || document.activeElement===panel.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && (document.activeElement===last || document.activeElement===panel.current)){event.preventDefault();first?.focus();}
      }
      if(track && !(event.target instanceof HTMLSelectElement)) {
        if(event.key==='ArrowRight'){event.preventDefault();setIndex(n=>Math.min(n+1,steps.length-1));}
        if(event.key==='ArrowLeft'){event.preventDefault();setIndex(n=>Math.max(0,n-1));}
      }
    }}>
      <header><span className="eyebrow">{track ? `${track === 'simple' ? 'Simple' : 'Advanced'} walkthrough` : 'Tips & tour'}</span><button className="onboarding-tour__close" type="button" onClick={onClose} aria-label="Close tutorial">×</button></header>
      <h2 id="studio-tutorial-title">{step?.title ?? 'Choose your walkthrough'}</h2>
      {step ? <>
        <label className="onboarding-tour__topics">Jump to topic<select aria-label="Tutorial topic" value={index} onChange={e=>setIndex(Number(e.target.value))}>{steps.map((s,i)=><option key={s.id} value={i}>{i+1}. {s.title}</option>)}</select></label>
        <p>{step.body}</p>
        <ul className="onboarding-tour__checklist">{step.tips.map(tip=><li key={tip}>{tip}</li>)}</ul>
        {step.needsChart && !hasChart ? <p className="onboarding-tour__empty">Open or import a chart to use these controls. You can continue this walkthrough without creating one.</p> : null}
        <div className="onboarding-tour__steps" aria-hidden="true">{steps.map((s,i)=><span key={s.id} className={i===index ? 'is-active' : ''}/>)}</div>
        <footer><button type="button" className="onboarding-tour__skip" onClick={()=>{setTrack(null);setIndex(0);}}>Choose mode</button><span><button type="button" className="button button--secondary" disabled={index===0} onClick={()=>setIndex(n=>Math.max(0,n-1))}>Back</button><button type="button" className="button button--primary" onClick={()=>index===steps.length-1 ? finish() : setIndex(n=>n+1)}>{index===steps.length-1 ? 'Finish tour' : 'Next topic'}</button></span></footer>
        <p className="onboarding-tour__progress" role="status">Topic {index+1} of {steps.length} · Esc closes · Arrow keys move between topics</p>
      </> : <>
        <p>Follow either path at your own pace. The tour temporarily shows that mode and its workspace sections. Closing returns to your previous section and mode; no chart data is changed.</p>
        <div className="onboarding-tour__choices">{(['simple','advanced'] as const).map(mode=><div key={mode}><h3>{mode === 'simple' ? 'Simple' : 'Advanced'}</h3><p>{mode === 'simple' ? 'Everyday updates, AI decisions, saved files, history, monthly checkpoints, imports and exports.' : 'All Simple topics, plus detailed hierarchy, layout, connectors, evidence imports, accessible tables and consistency reviews.'}</p><button type="button" className="button button--primary" onClick={()=>{setIndex(0);setTrack(mode);}}>Start {mode === 'simple' ? 'Simple' : 'Advanced'} tour</button><small>{tutorialSteps(mode,runtime).length} topics{completed[mode] ? ' · Completed on this device' : ''}</small></div>)}</div>
        <p className="onboarding-tour__progress">Replay either walkthrough anytime from Tips & tour.</p>
      </>}
    </section>
  </div>;
}
