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
function cartQuantityControl(id,qty,isMixed,product,pkg){
 const wrap=document.createElement("div");wrap.className="reseller-cart-quantity-controls";
 const label=document.createElement("label");label.className="reseller-cart-quantity-label";label.textContent=isMixed?"Individual units":"Full packages";
 const input=document.createElement("input");input.type="number";input.inputMode="numeric";input.min="1";input.step="1";input.value=String(qty);input.className="reseller-cart-quantity";input.setAttribute("aria-label",label.textContent+" quantity for "+product.name+" "+pkg.package_label);
 const unitsPerPackage=Math.max(1,Number(pkg.units_per_package||1));
 const max=isMixed?Number(pkg.stock_units_available??Number(pkg.stock_quantity)*unitsPerPackage):Number(pkg.stock_quantity);
 input.max=String(Math.max(1,max));
 input.addEventListener("change",()=>{
  const next=Number(input.value);
  if(!Number.isSafeInteger(next)||next<1){input.value=String(qty);return;}
  if(next>max){input.value=String(qty);const status=$("#cart-status");if(status)status.textContent="That quantity exceeds available stock.";return;}
  const map=isMixed?mixed:packages,key=isMixed?keys.mixed:keys.packages;map.set(id,next);save(key,map);renderCart();
  const status=$("#cart-status");if(status)status.textContent="Cart quantity updated.";
 });
 const remove=document.createElement("button");remove.type="button";remove.className="button button-outline reseller-cart-remove";remove.textContent="Remove item";remove.addEventListener("click",()=>{
  const map=isMixed?mixed:packages,key=isMixed?keys.mixed:keys.packages;map.delete(id);save(key,map);renderCart();
  const status=$("#cart-status");if(status)status.textContent="Item removed from your cart.";
 });
 wrap.append(label,input,remove);return wrap;
}
function lineRow(product,pkg,quantity,isMixed){
 const row=document.createElement("article");row.className="reseller-cart-line "+(isMixed?"reseller-cart-line-mixed":"reseller-cart-line-package");
 const details=document.createElement("div");details.className="reseller-cart-line-details";
 const badge=document.createElement("span");badge.className="reseller-cart-type-badge "+(isMixed?"is-individual":"is-package");badge.textContent=isMixed?"INDIVIDUAL UNITS":"FULL PACKAGE";
 const h=document.createElement("h3");h.textContent=product.name+" — "+(pkg.package_label||"Stock size");
 const unitsPerPackage=Math.max(1,Number(pkg.units_per_package||1));const units=isMixed?quantity:quantity*unitsPerPackage;const total=Number(pkg.stock_unit_price||0)*units;
 const description=document.createElement("p");description.className="reseller-cart-line-description";
 description.textContent=isMixed?quantity+" individual unit(s) × "+money(pkg.stock_unit_price,product.currency)+" per unit":quantity+" full package(s) × "+unitsPerPackage+" unit(s) per package";
 const subtotal=document.createElement("p");subtotal.className="reseller-cart-line-subtotal";subtotal.textContent="Line subtotal: "+money(total,product.currency);
 details.append(badge,h,description,subtotal);
 row.append(details,cartQuantityControl(Number(pkg.package_id||pkg.id),quantity,isMixed,product,pkg));return {row,total,units};
}
function renderCart(){
 const box=$("#cart-items");if(!box)return;box.replaceChildren();let total=0,packageCount=0,mixedUnits=0;
 for(const [id,qty] of packages){const f=findPackage(id);if(!f)continue;const x=lineRow(f.product,f.pkg,qty,false);box.append(x.row);total+=x.total;packageCount+=qty;}
 for(const [id,qty] of mixed){const f=findPackage(id);if(!f)continue;const x=lineRow(f.product,f.pkg,qty,true);box.append(x.row);total+=x.total;mixedUnits+=qty;}
 if(!box.children.length)box.textContent="Your cart is empty. Browse the catalogue and add products to get started.";
 $("#cart-total").textContent="Cart total: "+money(total);
 $("#cart-count").textContent=packageCount+" full package(s) · "+mixedUnits+" individual unit(s)";
 const checkout=$("#proceed-to-checkout");if(checkout)checkout.disabled=packages.size===0&&mixed.size===0;
}
function openBuilder(productId){
 const box=$("#mixed-builder-options");box.replaceChildren();
 const selected=productId?products.filter(p=>Number(p.id)===Number(productId)):products;
 for(const product of selected){
  const availablePackages=(product.packages||[]).filter(p=>Number(p.is_enabled)===1&&Number(p.stock_units_available??Number(p.stock_quantity)*Number(p.units_per_package||1))>0);
  const section=document.createElement("section");section.className="mixed-builder-product";
  const heading=document.createElement("div");heading.className="mixed-builder-product-heading";
  const h=document.createElement("h3");h.textContent=product.name;
  const intro=document.createElement("p");intro.textContent="Choose the number of individual units for each size.";heading.append(h,intro);section.append(heading);
  for(const pkg of availablePackages){
   const id=Number(pkg.package_id||pkg.id);
   const available=Number(pkg.stock_units_available??Number(pkg.stock_quantity)*Number(pkg.units_per_package||1));
   const label=document.createElement("label");label.className="mixed-builder-option";
   const info=document.createElement("span");info.className="mixed-builder-option-info";
   const name=document.createElement("strong");name.className="mixed-builder-option-name";name.textContent=pkg.package_label;
   const price=document.createElement("span");price.className="mixed-builder-option-price";price.textContent=money(pkg.stock_unit_price,product.currency)+" per unit";
   const stock=document.createElement("span");stock.className="mixed-builder-option-stock";stock.textContent=available+" individual units available";
   info.append(name,price,stock);
   const quantity=document.createElement("span");quantity.className="mixed-builder-quantity-wrap";
   const quantityLabel=document.createElement("span");quantityLabel.className="mixed-builder-quantity-label";quantityLabel.textContent="Quantity";
   const input=document.createElement("input");input.className="mixed-builder-quantity";input.type="number";input.min="0";input.max=String(available);input.step="1";input.inputMode="numeric";input.value=String(mixed.get(id)||0);input.dataset.packageId=String(id);input.setAttribute("aria-label",product.name+" "+pkg.package_label+" individual units");
   quantity.append(quantityLabel,input);label.append(info,quantity);section.append(label);
  }
  if(!availablePackages.length){const empty=document.createElement("p");empty.className="mixed-builder-empty";empty.textContent="No individual units are currently available for this product.";section.append(empty);}
  box.append(section);
 }
 updateMixedBuilderSummary();
 $("#mixed-builder-status").textContent="Minimum order: 10 individual units combined across all sizes. Choose quantities below, then add them to your cart.";
 const dialog=$("#mixed-builder-dialog");if(dialog.showModal)dialog.showModal();else dialog.setAttribute("open","");
}
function updateMixedBuilderSummary(){
 const inputs=[...($("#mixed-builder-options")?.querySelectorAll("input[data-package-id]")||[])];
 const units=inputs.reduce((sum,input)=>sum+Math.max(0,Number(input.value)||0),0);
 const total=inputs.reduce((sum,input)=>{const f=findPackage(Number(input.dataset.packageId));return sum+(f?Math.max(0,Number(input.value)||0)*Number(f.pkg.stock_unit_price||0):0);},0);
 const summary=$("#mixed-builder-summary");
 if(summary)summary.textContent=units+" individual unit"+(units===1?"":"s")+" selected · Estimated subtotal "+money(total);
 const add=$("#add-mixed-to-cart");if(add)add.disabled=units===0;
}
function getCartLines(){
 return [
  ...[...packages].map(([package_id,quantity])=>({package_id,quantity,item_type:"packages"})),
  ...[...mixed].map(([package_id,quantity])=>({package_id,quantity,item_type:"mixed"}))
 ];
}
function renderCheckout(){
 const box=$("#checkout-summary");if(!box)return;box.replaceChildren();const items=getCartLines();let total=0,mixedUnits=0;
 for(const item of items){const f=findPackage(item.package_id);if(!f)continue;const isMixed=item.item_type==="mixed";const units=isMixed?item.quantity:item.quantity*Number(f.pkg.units_per_package||1);const amount=Number(f.pkg.stock_unit_price||0)*units;total+=amount;if(isMixed)mixedUnits+=item.quantity;
  const p=document.createElement("p");p.textContent=f.product.name+" — "+f.pkg.package_label+": "+(isMixed?item.quantity+" individual unit(s)":item.quantity+" full package(s), "+units+" units")+" · "+money(amount,f.product.currency);box.append(p);}
 if(!items.length)box.textContent="Your cart is empty. Return to the cart to add products.";
 $("#confirm-stock-order").disabled=!items.length||(mixed.size>0&&mixedUnits<10);
 $("#checkout-total").textContent="Total for all cart items: "+money(total);
 $("#checkout-order-type").textContent=items.length+" line item(s)"+(mixedUnits?" · "+mixedUnits+" individual units":"")+(packages.size?" · full packages included":"");
}
async function submitOrder(){
 const items=getCartLines(),mixedUnits=items.filter(i=>i.item_type==="mixed").reduce((n,i)=>n+i.quantity,0);
 if(!items.length||(mixed.size>0&&mixedUnits<10)){ $("#checkout-status").textContent=!items.length?"Your cart is empty.":"Your individual-unit selections must total at least 10 units.";return; }
 const button=$("#confirm-stock-order");button.disabled=true;$("#checkout-status").textContent="Submitting your order…";
 try{
  const mode=$("#pay-later-mode")?.checked?"pay_later":"upfront";const body={items,fulfilment_mode:mode,reseller_notes:$("#order-note").value};
  const result=await api("stock-orders","POST",body);packages.clear();mixed.clear();save(keys.packages,packages);save(keys.mixed,mixed);renderCheckout();
  $("#checkout-status").textContent="Order "+result.data.order_number+" submitted. Total: "+money(result.data.total_amount,result.data.currency)+". "+(mode==="pay_later"?"M.H.R. must approve and release the stock.":"Please arrange payment with M.H.R.; stock is not released until payment is verified.");
  button.hidden=true;$("#back-to-cart").textContent="Return to cart";
 }catch(e){$("#checkout-status").textContent=e.message;button.disabled=false;}
}
function initPage(){
 const path=location.pathname;
 if(path.includes("/checkout/")){renderCheckout();$("#confirm-stock-order").addEventListener("click",submitOrder);return;}
 const params=new URL(location.href).searchParams,requested=params.get("order_package");
 if(requested){const id=Number(requested),qty=Number(params.get("quantity")||1);const f=findPackage(id);if(f&&Number.isSafeInteger(qty)&&qty>=Number(f.pkg.minimum_order_quantity||1)&&qty<=Number(f.pkg.stock_quantity)){packages.set(id,(packages.get(id)||0)+qty);save(keys.packages,packages);$("#cart-status").textContent="Package added to your cart.";}else $("#cart-status").textContent="Could not add that package. Check stock and try again.";params.delete("order_package");params.delete("quantity");history.replaceState({},"",location.pathname);}
 const mixedProduct=params.get("mixed_product");if(mixedProduct){params.delete("mixed_product");history.replaceState({},"",location.pathname);openBuilder(mixedProduct);}
 $("#open-mixed-builder").addEventListener("click",()=>openBuilder());
 $("#mixed-builder-options").addEventListener("input",event=>{if(event.target.matches("input[data-package-id]"))updateMixedBuilderSummary();});
 $("#add-mixed-to-cart").addEventListener("click",()=>{const inputs=[...$("#mixed-builder-options").querySelectorAll("input[data-package-id]")];let added=0;
  for(const input of inputs){const q=Number(input.value),id=Number(input.dataset.packageId);if(!Number.isSafeInteger(q)||q<0){$("#mixed-builder-status").textContent="Use whole numbers for quantities.";return;}if(q){const f=findPackage(id),available=Number(f.pkg.stock_units_available??Number(f.pkg.stock_quantity)*Number(f.pkg.units_per_package||1));if(q>available){$("#mixed-builder-status").textContent="Selected quantity exceeds available stock.";return;}mixed.set(id,(mixed.get(id)||0)+q);added+=q;}}
  if(!added){$("#mixed-builder-status").textContent="Choose at least one individual unit.";return;}save(keys.mixed,mixed);renderCart();$("#mixed-builder-dialog").close();$("#cart-status").textContent="Individual units added to your cart.";
 });
 const continueShopping=$("#continue-shopping");if(continueShopping)continueShopping.addEventListener("click",()=>go("../catalog/"));
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
