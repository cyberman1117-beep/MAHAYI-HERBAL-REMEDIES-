(() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const defaults = [{slug:"shipping-policy",title:"Shipping Policy"},{slug:"returns-and-refunds",title:"Returns and Refunds"},{slug:"contact-us",title:"Contact Us"}];
  const markup = pages => pages.map(p => '<a href="/information.html?slug='+encodeURIComponent(p.slug)+'">'+esc(p.title || p.slug)+'</a>').join("");
  async function init() {
    let footer = document.querySelector("footer.site-footer");
    if (!footer) {
      const main = document.querySelector("main");
      if (!main) return;
      footer = document.createElement("footer"); footer.className="site-footer";
      footer.innerHTML='<div class="container footer-inner"><a class="brand" href="/">MAHAYI HERBAL REMEDIES</a><nav class="information-footer-links" aria-label="Information pages"><strong>Information</strong><span data-information-links></span></nav></div>';
      main.insertAdjacentElement("afterend",footer);
    }
    let links=footer.querySelector("[data-information-links]");
    const grid=footer.querySelector(".footer-grid");
    if(!links && grid){
      const col=document.createElement("div"); col.className="footer-column";
      col.innerHTML='<h3>Information</h3><div data-information-links></div>';
      const follow=[...grid.querySelectorAll(".footer-column")].find(e=>/follow/i.test(e.querySelector("h3")?.textContent||""));
      grid.insertBefore(col,follow||null); links=col.querySelector("[data-information-links]");
    }
    if(!links){
      const host=footer.querySelector(".footer-inner")||footer.querySelector(".footer-bottom");
      if(host){const nav=document.createElement("nav");nav.className="information-footer-links";nav.setAttribute("aria-label","Information pages");nav.innerHTML='<strong>Information</strong><span data-information-links></span>';host.append(nav);links=nav.querySelector("[data-information-links]");}
    }
    if(!links)return;
    links.innerHTML=markup(defaults);
    try{
      const r=await fetch("/api/content-pages",{headers:{Accept:"application/json"},cache:"no-store"});
      const p=await r.json();
      if(r.ok&&p.success&&Array.isArray(p.data))links.innerHTML=markup(p.data);
    }catch{/* Keep fallback links when the API is unavailable. */}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();