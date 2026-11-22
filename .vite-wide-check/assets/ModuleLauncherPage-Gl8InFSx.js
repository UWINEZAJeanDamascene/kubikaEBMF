import{j as e}from"./query-vendor-B_4DkAI2.js";import{c as K,a as s,e as R,N as E,L as M}from"./react-vendor-JKBJju61.js";import{u as V,L as C,C as $,F as B,T as W,g as F}from"./Layout-CGp0l1L8.js";import{u as L,b as U,a as D,X as O,r as q,y as Q}from"./index-DVc9TQ-X.js";import{P as A,R as G}from"./receipt-C5I0n9xH.js";import{S as P}from"./search-DsQ-gKUT.js";import{S as H}from"./settings-2-yWUMLgmY.js";import{C as X}from"./file-spreadsheet-Durg_pQC.js";import{W as Y}from"./wallet-byIkgOAC.js";import{T as J}from"./trending-up-DTbFdgkW.js";import{A as Z}from"./arrow-up-right-CESkUdmp.js";import"./dialog-CGa8xy2W.js";import"./index-eK0ZFZ-S.js";import"./index-AFYJqcC2.js";import"./Combination-Dc0sHjT6.js";import"./index-D5wpZ8Z_.js";import"./input-b4NCOdDf.js";import"./label-BzFZiptj.js";import"./textarea-EYiXYUf5.js";import"./building-2-CEpW4U6U.js";import"./scale-8e-dmHus.js";import"./LanguageSelector-BwGFT94n.js";import"./index-rmnA7OVt.js";import"./index-Dudtajts.js";import"./index-vUy82ptn.js";import"./index-CsJ6BhbG.js";import"./check-xGuo6O-S.js";import"./boxes-C3sH0bLL.js";import"./users-BAlxm38W.js";import"./file-text-OnWsVvnZ.js";import"./shopping-cart-DI-WbopR.js";import"./wine-Bs1c5l5Y.js";import"./gauge-ZlHc3HJx.js";import"./printer-CKNN4w4W.js";import"./banknote-LIodkBr8.js";import"./hard-drive-D-fm2wXV.js";import"./triangle-alert--LyLPI01.js";import"./clock-BqziVnrP.js";import"./history-BqE2U3fD.js";import"./grip-vertical-DjJj5eiE.js";import"./chevron-down-BFF1n1E8.js";import"./circle-help-CHW1pUSs.js";import"./sheet-CFzgbi6K.js";import"./trash-2-CzUP-hzc.js";import"./sparkles-CbNYczyg.js";import"./plus-Ds4hDf0p.js";import"./credit-card-BCLGBTJj.js";import"./chevron-up-CUExdrz3.js";const ee={inventory:{icon:A,gradient:"from-sky-400 to-blue-600",glow:"hover:shadow-[0_10px_34px_rgba(14,165,233,0.38)]"},sales:{icon:J,gradient:"from-emerald-400 to-green-600",glow:"hover:shadow-[0_10px_34px_rgba(16,185,129,0.36)]"},"pos-till":{icon:G,gradient:"from-violet-500 to-purple-700",glow:"hover:shadow-[0_10px_34px_rgba(139,92,246,0.4)]"},"pos-back-office":{icon:q,gradient:"from-teal-400 to-cyan-600",glow:"hover:shadow-[0_10px_34px_rgba(20,184,166,0.38)]"},supply:{icon:W,gradient:"from-orange-400 to-amber-500",glow:"hover:shadow-[0_10px_34px_rgba(249,115,22,0.4)]"},finance:{icon:Y,gradient:"from-indigo-500 to-violet-700",glow:"hover:shadow-[0_10px_34px_rgba(99,102,241,0.4)]"},projects:{icon:B,gradient:"from-pink-400 to-fuchsia-600",glow:"hover:shadow-[0_10px_34px_rgba(236,72,153,0.38)]"},payroll:{icon:$,gradient:"from-cyan-400 to-sky-600",glow:"hover:shadow-[0_10px_34px_rgba(6,182,212,0.4)]"},reports:{icon:X,gradient:"from-lime-400 to-emerald-600",glow:"hover:shadow-[0_10px_34px_rgba(34,197,94,0.38)]"},system:{icon:H,gradient:"from-slate-300 to-slate-500",glow:"hover:shadow-[0_10px_34px_rgba(148,163,184,0.32)]"}},b=["/images/launcher-checkout.jpg","/images/launcher-cafe.jpg","/images/launcher-donations.jpg","/images/launcher-warehouse.jpg","/images/launcher-pos.jpg","/images/launcher-store.jpg"];function ae(r){return(r==null?void 0:r._id)||(r==null?void 0:r.id)}function Xe(){var z;const{t:r}=L(),n=K(),{user:c}=U(),{theme:l}=D(),m=l==="dark",[h,d]=s.useState(0),[i,u]=s.useState(!1),[x,v]=s.useState(""),y=s.useRef(null),g=V().filter(({allowedItems:a})=>a.length>0),I=ae(c),j=(z=c==null?void 0:c.name)==null?void 0:z.trim().split(/\s+/)[0],k=a=>a.id==="payroll"?r("nav.payroll",{defaultValue:"Payroll"}):r(a.labelKey),N=x.trim().toLocaleLowerCase(),w=g.filter(({section:a,allowedItems:t})=>N?[k(a),r(a.descriptionKey),a.id,...t.map(p=>r(p.nameKey))].join(" ").toLocaleLowerCase().includes(N):!0);s.useEffect(()=>{const a=window.matchMedia("(prefers-reduced-motion: reduce)"),t=()=>u(a.matches);return t(),a.addEventListener("change",t),()=>a.removeEventListener("change",t)},[]),s.useEffect(()=>{if(i)return;const a=window.setInterval(()=>{d(t=>(t+1)%b.length)},7e3);return()=>window.clearInterval(a)},[i]),s.useEffect(()=>{const a=t=>{var o;!(t.metaKey||t.ctrlKey)||t.key.toLowerCase()!=="k"||(t.preventDefault(),t.stopPropagation(),(o=y.current)==null||o.focus({preventScroll:!0}))};return window.addEventListener("keydown",a,!0),()=>window.removeEventListener("keydown",a,!0)},[]);const T=a=>{var S;const t=((S=g.find(({section:f})=>f.id===a.id))==null?void 0:S.allowedItems)||[],o=F(a,t),p=[o,...t.map(f=>f.href)],_=Q(I,a.id,p);n(_||o,_?{state:{launcherSectionId:a.id}}:void 0)};return e.jsx(C,{launcherBackground:b[h],children:e.jsxs("section",{"aria-label":r("nav.launcher",{defaultValue:"App launcher"}),className:"app-launcher-page relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-slate-950 text-white",children:[e.jsx("style",{children:`
          @keyframes launcher-image-drift {
            from { transform: scale(1); }
            to { transform: scale(1.09); }
          }
          .launcher-image-active { animation: launcher-image-drift 8s linear both; }
          .app-launcher-content {
            max-width: 1720px;
          }
          .launcher-app-grid {
            width: 100%;
            max-width: 1160px;
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 190px));
            justify-content: center;
            column-gap: 1rem;
            row-gap: 0.75rem;
          }
          .launcher-app-tile { max-width: 190px; }
          .launcher-app-icon {
            height: 5rem;
            width: 5rem;
            border-radius: 25px;
          }
          .launcher-app-glyph {
            height: 2.25rem;
            width: 2.25rem;
          }
          .launcher-app-title { font-size: 0.875rem; }
          .launcher-app-desc {
            max-width: 170px;
            min-height: 2rem;
            font-size: 0.6875rem;
            line-height: 1rem;
          }
          .launcher-title {
            max-width: 56rem;
            font-size: 1.875rem;
            line-height: 1.2;
          }
          .launcher-subtitle {
            max-width: 42rem;
            font-size: 0.75rem;
            line-height: 1.5;
          }
          .launcher-search { max-width: 460px; }
          .launcher-welcome { font-size: 0.75rem; }
          .launcher-apps-meta {
            width: 100%;
            max-width: 1160px;
            margin-left: auto;
            margin-right: auto;
          }

          /* Phone / small telephone */
          @media (max-width: 639px) {
            .app-launcher-content {
              padding-left: 0.9rem;
              padding-right: 0.9rem;
            }
            .app-launcher-header {
              padding-top: 0.55rem;
            }
            .launcher-brand-pill {
              display: flex;
              width: fit-content;
              margin-left: 0;
              margin-right: 0;
              gap: 0.45rem;
              max-width: 100%;
              padding: 0.35rem 0.7rem;
              font-size: 0.625rem;
            }
            .launcher-brand-workspace {
              display: none;
            }
            .launcher-brand-dot {
              display: none;
            }
            .launcher-brand-mark {
              height: 1.55rem;
              width: 1.55rem;
              border-radius: 0.55rem;
            }
            .launcher-welcome {
              margin-top: 0.65rem;
              font-size: 0.7rem;
            }
            .launcher-title {
              margin-top: 0.2rem;
              max-width: 20rem;
              font-size: 1.45rem;
              line-height: 1.18;
            }
            .launcher-subtitle {
              display: none;
            }
            .launcher-search {
              margin-top: 0.85rem;
              max-width: none;
              padding: 0.7rem 0.95rem;
            }
            .launcher-search-input {
              font-size: 0.9375rem;
            }
            .launcher-apps-scroll {
              padding-top: 0.85rem;
              padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
            }
            .launcher-apps-meta {
              margin-bottom: 0.55rem;
            }
            .launcher-app-grid {
              max-width: none;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              column-gap: 0.55rem;
              row-gap: 0.7rem;
            }
            .launcher-app-tile {
              max-width: none;
              min-height: 7.5rem;
              padding: 0.55rem 0.35rem 0.45rem;
              border-radius: 1rem;
            }
            .launcher-app-icon {
              height: 3.75rem;
              width: 3.75rem;
              border-radius: 1.15rem;
            }
            .launcher-app-glyph {
              height: 1.75rem;
              width: 1.75rem;
            }
            .launcher-app-title {
              margin-top: 0.55rem;
              font-size: 0.8125rem;
              white-space: normal;
              line-height: 1.2;
            }
            .launcher-app-desc {
              display: none;
            }
          }

          /* Very small phones */
          @media (max-width: 389px) {
            .launcher-title {
              font-size: 1.28rem;
              max-width: 17.5rem;
            }
            .launcher-app-icon {
              height: 3.35rem;
              width: 3.35rem;
              border-radius: 1rem;
            }
            .launcher-app-glyph {
              height: 1.55rem;
              width: 1.55rem;
            }
            .launcher-app-title {
              font-size: 0.75rem;
            }
            .launcher-app-tile {
              min-height: 6.75rem;
            }
          }

          /* Large phones / small tablets */
          @media (min-width: 640px) {
            .launcher-app-icon {
              height: 88px;
              width: 88px;
              border-radius: 28px;
            }
            .launcher-app-glyph {
              height: 2.5rem;
              width: 2.5rem;
            }
            .launcher-app-title { font-size: 0.9375rem; }
            .launcher-app-desc {
              font-size: 0.75rem;
              line-height: 1.1rem;
            }
            .launcher-title { font-size: 2.25rem; }
            .launcher-subtitle { font-size: 0.875rem; }
            .launcher-welcome { font-size: 0.875rem; }
            .launcher-app-grid {
              grid-template-columns: repeat(3, minmax(0, 190px));
              justify-content: center;
              column-gap: 0.85rem;
              row-gap: 0.9rem;
            }
          }

          /* iPad portrait / medium tablets */
          @media (min-width: 768px) and (max-width: 1023px) {
            .app-launcher-content {
              padding-left: 1.5rem;
              padding-right: 1.5rem;
            }
            .app-launcher-header {
              padding-top: 0.85rem;
            }
            .launcher-title {
              max-width: 34rem;
              font-size: 2.55rem;
              line-height: 1.12;
            }
            .launcher-subtitle {
              max-width: 30rem;
              font-size: 0.9375rem;
            }
            .launcher-search {
              max-width: 520px;
              padding: 0.8rem 1.1rem;
            }
            .launcher-apps-scroll {
              padding-top: 1.1rem;
              padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
            }
            .launcher-app-grid {
              max-width: 720px;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              column-gap: 0.85rem;
              row-gap: 1rem;
            }
            .launcher-app-tile {
              max-width: none;
              padding: 0.55rem 0.35rem;
            }
            .launcher-app-icon {
              height: 5.25rem;
              width: 5.25rem;
              border-radius: 1.55rem;
            }
            .launcher-app-glyph {
              height: 2.35rem;
              width: 2.35rem;
            }
            .launcher-app-title {
              font-size: 0.875rem;
            }
            .launcher-app-desc {
              max-width: 9.5rem;
              min-height: 2rem;
              font-size: 0.6875rem;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
          }

          /* iPad landscape / large tablet */
          @media (min-width: 1024px) and (max-width: 1366px) {
            .app-launcher-content {
              padding-left: 1.75rem;
              padding-right: 1.75rem;
            }
            .launcher-title {
              max-width: 42rem;
              font-size: 2.85rem;
              line-height: 1.1;
            }
            .launcher-subtitle {
              font-size: 0.95rem;
            }
            .launcher-search {
              max-width: 500px;
            }
            .launcher-apps-scroll {
              padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
            }
            .launcher-app-grid {
              max-width: 980px;
              grid-template-columns: repeat(5, minmax(0, 1fr));
              column-gap: 0.9rem;
              row-gap: 0.95rem;
            }
            .launcher-apps-meta {
              max-width: 980px;
            }
            .launcher-app-tile {
              max-width: none;
            }
            .launcher-app-icon {
              height: 5.5rem;
              width: 5.5rem;
              border-radius: 1.6rem;
            }
            .launcher-app-glyph {
              height: 2.45rem;
              width: 2.45rem;
            }
            .launcher-app-desc {
              max-width: 10rem;
              -webkit-line-clamp: 2;
              display: -webkit-box;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
          }

          /* Short landscape (iPad landscape height-constrained) */
          @media (max-height: 760px) and (orientation: landscape) and (max-width: 1366px) {
            .app-launcher-header {
              padding-top: 0.35rem;
            }
            .launcher-brand-pill {
              padding: 0.3rem 0.75rem;
              font-size: 0.65rem;
            }
            .launcher-welcome {
              margin-top: 0.4rem;
              font-size: 0.75rem;
            }
            .launcher-title {
              margin-top: 0.15rem;
              font-size: 1.85rem;
              line-height: 1.12;
            }
            .launcher-subtitle {
              display: none;
            }
            .launcher-search {
              margin-top: 0.55rem;
              padding: 0.55rem 0.9rem;
            }
            .launcher-apps-scroll {
              padding-top: 0.55rem;
              padding-bottom: 0.75rem;
            }
            .launcher-app-desc {
              display: none;
            }
            .launcher-app-icon {
              height: 4.35rem;
              width: 4.35rem;
              border-radius: 1.25rem;
            }
            .launcher-app-glyph {
              height: 2rem;
              width: 2rem;
            }
            .launcher-app-title {
              margin-top: 0.4rem;
              font-size: 0.8rem;
            }
          }

          /* Desktop beyond large tablets */
          @media (min-width: 1367px) {
            .launcher-title {
              font-size: 3.25rem;
              line-height: 1.1;
            }
            .launcher-subtitle {
              font-size: 1rem;
            }
            .launcher-app-grid {
              grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 190px));
            }
            .launcher-app-tile {
              max-width: 190px;
            }
          }

          /* Large desktop / QHD-ish */
          @media (min-width: 1536px) {
            .app-launcher-content { max-width: 1840px; }
            .launcher-apps-meta,
            .launcher-app-grid { max-width: 1160px; }
            .launcher-app-grid {
              grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 190px));
              column-gap: 1rem;
              row-gap: 0.75rem;
            }
            .launcher-app-tile { max-width: 210px; }
            .launcher-app-icon {
              height: 96px;
              width: 96px;
              border-radius: 30px;
            }
            .launcher-app-glyph {
              height: 2.65rem;
              width: 2.65rem;
            }
          }

          /* Ultrawide / 2000px+ */
          @media (min-width: 2000px) {
            .app-launcher-content {
              max-width: 2140px;
              padding-left: 2.75rem;
              padding-right: 2.75rem;
            }
            .app-launcher-header { padding-top: 1.75rem; }
            .launcher-apps-meta { max-width: 1160px; }
            .launcher-brand-pill {
              gap: 0.85rem;
              padding: 0.55rem 1.15rem;
              font-size: 0.8125rem;
            }
            .launcher-brand-mark {
              height: 2.25rem;
              width: 2.25rem;
            }
            .launcher-welcome {
              margin-top: 1.25rem;
              font-size: 1rem;
            }
            .launcher-title {
              margin-top: 0.35rem;
              max-width: 56rem;
              font-size: 3.75rem;
              line-height: 1.08;
            }
            .launcher-subtitle {
              margin-top: 0.75rem;
              max-width: 42rem;
              font-size: 1.125rem;
              line-height: 1.55;
            }
            .launcher-search {
              margin-top: 1.5rem;
              max-width: 560px;
              padding: 0.85rem 1.25rem;
            }
            .launcher-search-input { font-size: 1rem; }
            .launcher-apps-meta { margin-bottom: 0.9rem; }
            .launcher-apps-meta h2 {
              font-size: 0.75rem;
              letter-spacing: 0.22em;
            }
            .launcher-apps-meta span { font-size: 0.875rem; }
            .launcher-app-grid {
              max-width: 1160px;
              grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 190px));
              column-gap: 1rem;
              row-gap: 0.75rem;
            }
            .launcher-app-tile {
              max-width: 248px;
              padding: 0.65rem 0.5rem;
              border-radius: 1.15rem;
            }
            .launcher-app-icon {
              height: 112px;
              width: 112px;
              border-radius: 34px;
              box-shadow: 0 12px 34px rgba(0, 0, 0, 0.32);
            }
            .launcher-app-glyph {
              height: 3rem;
              width: 3rem;
            }
            .launcher-app-title {
              margin-top: 0.85rem;
              font-size: 1.0625rem;
            }
            .launcher-app-desc {
              margin-top: 0.2rem;
              max-width: 210px;
              min-height: 2.4rem;
              font-size: 0.8125rem;
              line-height: 1.25rem;
            }
            .launcher-apps-scroll {
              padding-top: 1.75rem;
              padding-bottom: 1.75rem;
            }
          }

          /* 2560px+ / 4K-class */
          @media (min-width: 2560px) {
            .app-launcher-content {
              max-width: 2460px;
              padding-left: 3.5rem;
              padding-right: 3.5rem;
            }
            .app-launcher-header { padding-top: 2.25rem; }
            .launcher-apps-meta { max-width: 1160px; }
            .launcher-brand-pill {
              gap: 1rem;
              padding: 0.65rem 1.35rem;
              font-size: 0.875rem;
            }
            .launcher-brand-mark {
              height: 2.5rem;
              width: 2.5rem;
            }
            .launcher-welcome {
              margin-top: 1.5rem;
              font-size: 1.125rem;
            }
            .launcher-title {
              max-width: 64rem;
              font-size: 4.5rem;
              line-height: 1.05;
            }
            .launcher-subtitle {
              margin-top: 0.9rem;
              max-width: 48rem;
              font-size: 1.25rem;
            }
            .launcher-search {
              margin-top: 1.75rem;
              max-width: 640px;
              padding: 1rem 1.4rem;
              gap: 0.85rem;
            }
            .launcher-search-input { font-size: 1.0625rem; }
            .launcher-apps-meta {
              max-width: 2100px;
              margin-bottom: 1.1rem;
            }
            .launcher-app-grid {
              max-width: 2100px;
              grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 280px));
              column-gap: 1.25rem;
              row-gap: 1.5rem;
            }
            .launcher-app-tile {
              max-width: 300px;
              padding: 1rem 0.75rem;
            }
            .launcher-app-icon {
              height: 176px;
              width: 176px;
              border-radius: 48px;
            }
            .launcher-app-glyph {
              height: 4.25rem;
              width: 4.25rem;
            }
            .launcher-app-title {
              margin-top: 1.1rem;
              font-size: 1.25rem;
            }
            .launcher-apps-scroll {
              padding-top: 2.25rem;
              padding-bottom: 2.25rem;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .launcher-image-active { animation: none; }
            .launcher-image-transition { transition: none !important; }
          }
        `}),b.map((a,t)=>e.jsx("img",{src:a,alt:"","aria-hidden":"true",className:`launcher-image-transition pointer-events-none absolute inset-0 -z-10 h-full w-full scale-105 object-cover blur-[1.5px] transition-opacity duration-[1400ms] ease-in-out ${h===t?"launcher-image-active opacity-100":"opacity-0"}`,style:{objectPosition:t===1?"center 42%":t===5?"center 48%":"center"}},a)),e.jsx("div",{className:`pointer-events-none absolute inset-0 -z-10 ${m?"bg-slate-950/65":"bg-slate-950/55"}`}),e.jsx("div",{className:"pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#090d21]/50 via-[#10172d]/45 to-[#080c1c]/85"}),e.jsx("div",{className:"pointer-events-none absolute -left-24 top-0 -z-10 h-80 w-80 rounded-full bg-violet-600/25 blur-[100px]"}),e.jsx("div",{className:"pointer-events-none absolute -right-20 bottom-0 -z-10 h-80 w-80 rounded-full bg-cyan-400/20 blur-[100px]"}),e.jsxs("div",{className:"app-launcher-content relative z-10 mx-auto flex h-full min-h-0 w-full flex-col px-4 sm:px-7 xl:px-9",children:[e.jsxs("header",{className:"app-launcher-header shrink-0 pt-3 text-center sm:pt-4 lg:pt-5",children:[e.jsxs("div",{className:"launcher-brand-pill sm:mx-auto inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-slate-950/45 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white shadow-[0_8px_32px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-2 sm:text-xs",children:[e.jsx("span",{className:"launcher-brand-mark grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-teal-500 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.35)] sm:h-8 sm:w-8",children:e.jsx(A,{className:"h-4 w-4","aria-hidden":"true"})}),e.jsx("span",{className:"tracking-[0.12em]",children:"KUBIKA"}),e.jsx("span",{className:"launcher-brand-dot h-1 w-1 rounded-full bg-cyan-300","aria-hidden":"true"}),e.jsx("span",{className:"launcher-brand-workspace text-white/70",children:r("common.workspace",{defaultValue:"Business Workspace"})})]}),e.jsxs("p",{className:"launcher-welcome mt-3 font-medium tracking-wide text-cyan-100/90 sm:mt-4",children:[r("common.welcomeBack",{defaultValue:"Welcome back"}),j?`, ${j}`:""]}),e.jsxs("h1",{className:"launcher-title mx-auto mt-1 font-semibold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]",children:[r("nav.launcherTitleStart",{defaultValue:"Where would you like to"})," ",e.jsx("span",{className:"bg-gradient-to-r from-cyan-200 to-cyan-400 bg-clip-text text-transparent",children:"work?"})]}),e.jsx("p",{className:"launcher-subtitle mx-auto mt-2 leading-relaxed text-white/75",children:r("nav.launcherSubtitle",{defaultValue:"Choose an app to get started. Your workspace will remember where you left off."})}),e.jsxs("div",{className:"launcher-search mx-auto mt-4 flex w-full items-center gap-3 rounded-full border border-white/15 bg-slate-950/45 px-4 py-2.5 shadow-[0_10px_36px_rgba(0,0,0,0.24)] backdrop-blur-xl transition focus-within:border-cyan-300/60 focus-within:ring-2 focus-within:ring-cyan-300/15 sm:mt-5",children:[e.jsx(P,{className:"h-4 w-4 shrink-0 text-white/60 min-[2000px]:h-5 min-[2000px]:w-5","aria-hidden":"true"}),e.jsx("label",{className:"sr-only",htmlFor:"launcher-app-search",children:r("nav.launcherSearch",{defaultValue:"Search applications"})}),e.jsx("input",{ref:y,id:"launcher-app-search",type:"search",value:x,onChange:a=>v(a.target.value),placeholder:r("nav.launcherSearchPlaceholder",{defaultValue:"Search for an application..."}),className:"launcher-search-input min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-white/50 focus:ring-0",autoComplete:"off",spellCheck:!1}),x?e.jsx("button",{type:"button",onClick:()=>v(""),className:"grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 min-[2000px]:h-8 min-[2000px]:w-8","aria-label":r("common.clearSearch",{defaultValue:"Clear search"}),children:e.jsx(O,{className:"h-4 w-4","aria-hidden":"true"})}):e.jsx("kbd",{className:"hidden shrink-0 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/65 sm:inline-flex min-[2000px]:px-2.5 min-[2000px]:text-xs",children:"Ctrl + K"})]})]}),e.jsx("div",{className:"launcher-apps-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain py-5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.22)_transparent]",children:e.jsx("div",{className:"mx-auto min-w-0 w-full 2xl:pb-2",children:g.length===0?e.jsxs("div",{role:"status",className:"mx-auto mt-8 max-w-xl rounded-2xl border border-white/15 bg-slate-950/40 p-6 text-center shadow-xl backdrop-blur-xl",children:[e.jsx("h2",{className:"text-lg font-semibold text-white",children:r("nav.noAppsAvailable",{defaultValue:"No apps are available for this account."})}),e.jsx("p",{className:"mt-2 text-sm text-white/65",children:r("nav.contactAdministrator",{defaultValue:"Contact your administrator if you think you should have access."})})]}):w.length===0?e.jsxs("div",{role:"status",className:"mx-auto mt-8 max-w-md rounded-2xl border border-white/10 bg-slate-950/35 p-7 text-center backdrop-blur-lg",children:[e.jsx(P,{className:"mx-auto h-7 w-7 text-cyan-200/80","aria-hidden":"true"}),e.jsx("h2",{className:"mt-3 text-base font-semibold text-white",children:r("nav.launcherNoMatches",{defaultValue:"No applications match your search."})}),e.jsx("p",{className:"mt-1 text-sm text-white/60",children:r("nav.launcherTryAnotherSearch",{defaultValue:"Try another name or clear the search."})})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"launcher-apps-meta mb-2 flex items-center justify-between px-1 sm:mb-3",children:[e.jsx("h2",{className:"text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55",children:r("nav.launcherApplications",{defaultValue:"Applications"})}),e.jsxs("span",{className:"text-xs text-white/45",children:[w.length," ",r("nav.launcherAppsCount",{defaultValue:"apps"})]})]}),e.jsx("div",{className:"launcher-app-grid mx-auto grid justify-items-center",children:w.map(({section:a})=>{const t=ee[a.id]||{icon:a.icon,gradient:"from-slate-400 to-slate-600",glow:""},o=t.icon,p=k(a);return e.jsxs("button",{type:"button",onClick:()=>T(a),className:"launcher-app-tile group relative flex w-full min-w-0 flex-col items-center rounded-2xl px-2 py-2 text-center transition duration-200 hover:-translate-y-1 hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80","aria-label":`${p}: ${r("nav.openApp",{defaultValue:"Open app"})}`,children:[e.jsx("span",{className:`launcher-app-icon relative grid place-items-center bg-gradient-to-br ring-1 ring-white/30 shadow-[0_9px_26px_rgba(0,0,0,0.28)] transition duration-200 group-hover:scale-[1.06] group-hover:ring-white/55 ${t.gradient} ${t.glow}`,children:e.jsx(o,{className:"launcher-app-glyph text-white drop-shadow-md",strokeWidth:2.1,"aria-hidden":"true"})}),e.jsx("span",{className:"launcher-app-title mt-2.5 block max-w-full truncate font-semibold tracking-tight text-white/95 transition-colors group-hover:text-white",children:p})]},a.id)})})]})})})]})]})})}function Ye(){const{sectionId:r}=R(),{t:n}=L(),l=V().find(({section:i})=>i.id===r),m=l==null?void 0:l.section,h=(l==null?void 0:l.allowedItems)||[];if(!m||h.length===0)return e.jsx(E,{to:"/launcher",replace:!0});const d=m.icon;return e.jsx(C,{children:e.jsxs("section",{className:"mx-auto w-full max-w-6xl space-y-6 p-2 sm:p-4",children:[e.jsx("header",{className:"rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7",children:e.jsxs("div",{className:"flex items-start gap-4",children:[e.jsx("span",{className:"flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary",children:e.jsx(d,{className:"h-6 w-6","aria-hidden":"true"})}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("p",{className:"text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground",children:n("nav.overview",{defaultValue:"Overview"})}),e.jsx("h1",{className:"mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl",children:n(m.labelKey)}),e.jsx("p",{className:"mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base",children:n(m.descriptionKey)})]})]})}),e.jsxs("section",{"aria-labelledby":"module-overview-pages",className:"space-y-3",children:[e.jsxs("div",{children:[e.jsx("h2",{id:"module-overview-pages",className:"text-lg font-semibold text-foreground",children:n("nav.quickActions",{defaultValue:"Quick actions"})}),e.jsx("p",{className:"mt-1 text-sm text-muted-foreground",children:n("nav.chooseTask",{defaultValue:"Go directly to a page in this section."})})]}),e.jsx("div",{className:"grid gap-3 sm:grid-cols-2 lg:grid-cols-3",children:h.map(i=>{const u=i.icon;return e.jsxs(M,{to:i.href,className:"group flex min-h-20 items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",children:[e.jsx("span",{className:"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground",children:e.jsx(u,{className:"h-5 w-5","aria-hidden":"true"})}),e.jsx("span",{className:"min-w-0 flex-1 truncate text-sm font-semibold text-foreground",children:n(i.nameKey)}),e.jsx(Z,{className:"h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary","aria-hidden":"true"})]},i.href)})})]})]})})}export{Ye as ModuleOverviewPage,Xe as default};
