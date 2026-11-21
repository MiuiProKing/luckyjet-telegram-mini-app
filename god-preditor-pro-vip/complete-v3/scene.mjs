// Uses the original reviewed Premium WebGL renderer; Canvas remains the fallback.
import { mountVortex } from './assets/vortex-original.mjs';
import { mountScene as mountCanvasScene } from './scene-canvas.mjs';
export { spiderPath } from './spider-path.mjs';

const palette = {violet:'168, 120, 255',blue:'59, 130, 246',pink:'236, 72, 153',highlight:'208, 219, 235'};

export function mountScene(base,spider,preferences=()=>({}),pulse=()=>0) {
  for(const [name,value] of Object.entries(palette)) {
    if(!getComputedStyle(base).getPropertyValue('--robot-'+name).trim())base.style.setProperty('--robot-'+name,value);
  }
  let dispose,stopped=false;
  try {
    dispose=mountVortex(base,pulse,preferences);
    base.dataset.sceneEngine='original-webgl';
    spider.hidden=true;
    const redraw=()=>queueMicrotask(()=>{if(!stopped)dispose.redraw?.();});
    document.addEventListener('input',redraw);
    document.addEventListener('change',redraw);
    return {
      resize(){if(!stopped)dispose.resize?.();},
      stop(){if(stopped)return;stopped=true;document.removeEventListener('input',redraw);document.removeEventListener('change',redraw);dispose();}
    };
  } catch(error) {
    dispose?.();
    // A canvas that acquired a failed WebGL context cannot later acquire Canvas2D.
    const replacement=base.cloneNode(false);
    replacement.dataset.sceneEngine='canvas-fallback';
    base.replaceWith(replacement);
    spider.hidden=false;
    return mountCanvasScene(replacement,spider,preferences,pulse);
  }
}
