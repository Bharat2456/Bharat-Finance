import { icon } from '../ui/util.js';
import { siteNav, siteFooter, wireNav } from './site.js';
import { BUILDER as B } from '../content/builder.js';
export function renderBuilder(root) {
  root.innerHTML = `${siteNav('builder')}<main id="main" class="wrap"><div class="bld"><div><div class="role" style="color:var(--amber)">${B.eyebrow}</div><h1 style="font-size:40px;letter-spacing:.1em;text-transform:uppercase;margin:6px 0 28px">Builder</h1>
    <img class="photo" src="${B.photo}" alt="Portrait of ${B.name}" width="280" height="280"><div class="nm" style="color:var(--green-strong)">${B.name}</div><div class="role" style="color:var(--amber)">${B.role}</div></div>
    <div style="padding-top:18px"><div class="panel"><div class="ph">About me <span>Builder</span></div>${B.about.map((p, i) => `<p style="${i ? 'color:var(--muted)' : 'font-size:17px'}">${p}</p>`).join('')}</div>
    <div class="panel amber"><div class="ph">Work with me <span>Freelance</span></div>${B.work.map((p) => `<p style="font-size:17px">${p}</p>`).join('')}<p class="muted">${B.workSub}</p><a class="btn primary" href="${B.linkedin}" target="_blank" rel="noopener noreferrer">${icon('linkedin')} Connect on LinkedIn</a></div>
    <div class="panel"><div class="ph">Socials <span>Find me</span></div><div class="grid g2">${B.socials.map((s) => `<a class="social" href="${s.href}" target="_blank" rel="noopener noreferrer">${icon(s.id)}<span><b>${s.label}</b><small>${s.text}</small></span></a>`).join('')}</div></div></div></div></main>${siteFooter()}`;
  wireNav(root); return () => {};
}
