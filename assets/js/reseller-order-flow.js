import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const $ = (s) => document.querySelector(s);
const keys = { packages: "mhr_reseller_package_cart", mixed: "mhr_reseller_mixed_cart" };
let products = [];
let reseller = null;
const money = (n, currency = "ZAR") => { try { return new Intl.NumberFormat("en-ZA", {style:"currency",currency}).format(Number(n||0)); } catch { return "R" + Number(n||0).toFixed(2); } };
function read(key) { try { const v = JSON.parse(localStorage.getItem(key) || "{}"); return new Map(Object.entries(v).map(([k,n])=>[Number(k),Number(n)]).filter(([k,n])=>Number.isSafeInteger(k)&&Number.isSafeInteger(n)&&n>0)); } catch { return new Map(); } }
function save(key,map) { localStorage.setItem(key, JSON.stringify(Object.fromEntries(map))); }
let packages = read(keys.packages), mixed = read(keys.mixed);
async function api(action, method="GET", body) {
 if (!auth.currentUser) throw new Error("Please sign in to continue.");
 const token=await auth.currentUser.getIdToken(), url=new URL("/api/reseller-portal",location.origin); url.searchParams.set("action",action);
 const response=await fetch(url,{method,headers:{Authorization:"Bearer "+token,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const data=await response.json().catch(()=>({})); if(!response.ok||!data.success)throw new Error(data.error||"Request failed. Please try again."); return data;
}
function findPackage(id){for(const product of products){const pkg=(product.packages||[]).find(p=>Number(p.package_id||p.id)===Number(id));if(pkg)return {product,pkg};}return null;}
function go(path){location.href=path;}
function lineRow(product,pkg,quantity,isMixed){
 const row=document.createElement("article");row.className="admin-panel";
 const h=document.createElement("h3");h.textContent=product.name+" — "+pkg.package_label;
 const p=document.createElement("p");p.className="muted";const units=isMixed?quantity:quantity*Number(pkg.units_per_package||1);const total=Number(pkg.stock_unit_price||0)*units;
 p.textContent=isMixed?quantity+" individual unit(s) × "+money(pkg.stock_unit_price,product.currency)+" = "+money(total,product.currency):quantity+" stock package(s), "+units+" units = "+money(total,product.currency);
 const remove=document.createElement("button");remove.type="button";remove.className="button button-outline";remove.textContent="Remove";remove.addEventListener("click",()=>{(isMixed?mixed:packages).delete(Number(pkg.package_id||pkg.id));save(isMixed?keys.mixed:keys.packages,isMixed?mixed:packages);renderCart();});
 row.append(h,p,remove);return {row,total,units};
}
function renderCart(){
 if(!$("#package-cart-items"))return;
 const box=$("#package-cart-items");box.replaceChildren();let total=0,count=0;
 for(const [id,qty] of packages){const f=findPackage(id);if(!f)continue;const x=lineRow(f.product,f.pkg,qty,false);box.append(x.row);total+=x.total;count+=qty;}
 if(!box.children.length)box.textContent="No full stock packages selected.";
 $("#package-cart-total").textContent="Package subtotal: "+money(total);$("#package-cart-count").textContent=count+" package(s)";
 const mb=$("#mixed-cart-items");mb.replaceChildren();let mixedTotal=0,units=0;
 for(const [id,qty] of mixed){const f=findPackage(id);if(!f)continue;const x=lineRow(f.product,f.pkg,qty,true);mb.append(x.row);mixedTotal+=x.total;units+=qty;}
 if(!mb.children.length)mb.textContent="No individual units selected.";
 $("#mixed-cart-total").textContent="Mixed order subtotal: "+money(mixedTotal)+" · "+units+" individual units";
 $("#checkout-packages").disabled=packages.size===0;$("#checkout-mixed").disabled=units<10;
}
function openBuilder(productId){
 const box=$("#mixed-builder-options");box.replaceChildren();
 const selected=productId?products.filter(p=>Number(p.id)===Number(productId)):products;
 for(const product of selected){
  const section=document.createElement("section");section.className="admin-panel";const h=document.createElement("h3");h.textContent=product.name;section.append(h);
  for(const pkg of (product.packages||[]).filter(p=>Number(p.is_enabled)===1)){
   const available=Number(pkg.stock_units_available??Number(pkg.stock_quantity)*Number(pkg.units_per_package||1));if(available<1)continue;
   const label=document.createElement("label");label.className="field";const span=document.createElement("span");span.textContent=pkg.package_label+" · "+money(pkg.stock_unit_price,product.currency)+" per unit · "+available+" available";
   const input=document.createElement("input");input.type="number";input.min="0";input.max=String(available);input.step="1";input.value=String(mixed.get(Number(pkg.package_id||pkg.id))||0);input.dataset.packageId=String(pkg.package_id||pkg.id);input.setAttribute("aria-label",product.name+" "+pkg.package_label+" individual units");label.append(span,input);section.append(label);
  }box.append(section);
 }
 $("#mixed-builder-status").textContent="Choose individual quantities. Add them to your cart, then continue to checkout.";const dialog=$("#mixed-builder-dialog");if(dialog.showModal)dialog.showModal();else dialog.setAttribute("open","");
}
function renderCheckout(){
 const box=$("#checkout-summary");if(!box)return;box.replaceChildren();const isMixed=new URL(location.href).searchParams.get("type")==="mixed";const selected=isMixed?mixed:packages;let total=0,unitCount=0;
 for(const [id,qty] of selected){const f=findPackage(id);if(!f)continue;const units=isMixed?qty:qty*Number(f.pkg.units_per_package||1);const amount=Number(f.pkg.stock_unit_price||0)*units;total+=amount;unitCount+=isMixed?qty:0;const p=document.createElement("p");p.textContent=f.product.name+" — "+f.pkg.package_label+": "+(isMixed?qty+" individual unit(s)":qty+" package(s), "+units+" units")+" · "+money(amount,f.product.currency);box.append(p);}
 if(!selected.size)box.textContent="Your cart is empty. Return to the cart to select stock.";
 $("#confirm-stock-order").disabled = selected.size === 0 || (isMixed && unitCount < 10);
 $("#checkout-total").textContent="Total payable to M.H.R.: "+money(total);
 $("#checkout-order-type").textContent=isMixed?"Mixed individual-unit order · "+unitCount+" units":"Full stock-package order";
 $("#confirm-stock-order").addEventListener("click",submitOrder,{once:true});
}
async function submitOrder(){
 const isMixed=new URL(location.href).searchParams.get("type")==="mixed",selected=isMixed?mixed:packages;
 const items=[...selected].map(([package_id,quantity])=>({package_id,quantity}));const units=items.reduce((n,i)=>n+i.quantity,0);
 if(!items.length||(isMixed&&units<10)){ $("#checkout-status").textContent=isMixed?"A mixed order must contain at least 10 individual units.":"Your cart is empty.";return; }
 const button=$("#confirm-stock-order");button.disabled=true;$("#checkout-status").textContent="Submitting your order…";
 try{
  const mode=$("#pay-later-mode")?.checked?"pay_later":"upfront";const body={items,fulfilment_mode:mode,reseller_notes:$("#order-note").value};if(isMixed)body.order_type="mixed";
  const result=await api("stock-orders","POST",body);selected.clear();save(isMixed?keys.mixed:keys.packages,selected);
  $("#checkout-status").textContent="Order "+result.data.order_number+" submitted. Total: "+money(result.data.total_amount,result.data.currency)+". "+(mode==="pay_later"?"M.H.R. must approve and release the stock.":"Please arrange payment with M.H.R.; stock is not released until payment is verified.");
  button.hidden=true;$("#back-to-cart").textContent="Return to cart";
 }catch(e){$("#checkout-status").textContent=e.message;button.disabled=false;button.addEventListener("click",submitOrder,{once:true});}
}
function initPage(){
 const path=location.pathname;
 if(path.includes("/checkout/")){renderCheckout();return;}
 const params=new URL(location.href).searchParams,requested=params.get("order_package");
 if(requested){const id=Number(requested),qty=Number(params.get("quantity")||1);const f=findPackage(id);if(f&&Number.isSafeInteger(qty)&&qty>=Number(f.pkg.minimum_order_quantity||1)&&qty<=Number(f.pkg.stock_quantity)){packages.set(id,(packages.get(id)||0)+qty);save(keys.packages,packages);$("#cart-status").textContent="Package added to your cart.";}else $("#cart-status").textContent="Could not add that package. Check stock and try again.";params.delete("order_package");params.delete("quantity");history.replaceState({},"",location.pathname);}
 const mixedProduct=params.get("mixed_product");if(mixedProduct){params.delete("mixed_product");history.replaceState({},"",location.pathname);openBuilder(mixedProduct);}
 $("#open-mixed-builder").addEventListener("click",()=>openBuilder());
 $("#add-mixed-to-cart").addEventListener("click",()=>{const inputs=[...$("#mixed-builder-options").querySelectorAll("input[data-package-id]")];let added=0;
  for(const input of inputs){const q=Number(input.value),id=Number(input.dataset.packageId);if(!Number.isSafeInteger(q)||q<0){$("#mixed-builder-status").textContent="Use whole numbers for quantities.";return;}if(q){const f=findPackage(id),available=Number(f.pkg.stock_units_available??Number(f.pkg.stock_quantity)*Number(f.pkg.units_per_package||1));if(q>available){$("#mixed-builder-status").textContent="Selected quantity exceeds available stock.";return;}mixed.set(id,q);added+=q;}}
  if(!added){$("#mixed-builder-status").textContent="Choose at least one individual unit.";return;}save(keys.mixed,mixed);renderCart();$("#mixed-builder-dialog").close();$("#cart-status").textContent="Individual units added to cart.";
 });
 $("#checkout-packages").addEventListener("click",()=>go("../checkout/?type=packages"));$("#checkout-mixed").addEventListener("click",()=>go("../checkout/?type=mixed"));
 renderCart();
}
onAuthStateChanged(auth,async user=>{
 if(!user){$("#order-page-status").textContent="Please sign in to your reseller account first.";$("#order-page-signin").hidden=false;return;}
 try{const me=await api("me");reseller=me.data?.reseller;if(!reseller||reseller.status!=="active"){throw new Error("Your reseller account must be approved before ordering stock.");}
 const result=await api("products");products=result.data?.products||[];
 if($("#pay-later-option"))$("#pay-later-option").hidden=Number(reseller.pay_later_enabled)!==1;
 $("#order-page-status").textContent="Signed in as "+(reseller.full_name||user.email)+".";
 initPage();
 }catch(e){$("#order-page-status").textContent=e.message;$("#order-page-signin").hidden=false;}
});
