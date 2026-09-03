let products=[], cart={}, config={};

const money = n => "₹" + Number(n).toLocaleString("en-IN");
const $ = id => document.getElementById(id);

async function init(){
  [products, config] = await Promise.all([
    fetch("/api/products").then(r=>r.json()),
    fetch("/api/config").then(r=>r.json())
  ]);
  $("shopName").textContent=config.shopName; $("footerShop").textContent=config.shopName; $("year").textContent=new Date().getFullYear();
  renderCategories(); renderProducts(); updateCart();
}
function renderCategories(){
  const cats=["All",...new Set(products.map(p=>p.category))];
  $("categories").innerHTML=cats.map((c,i)=>`<button class="${i===0?"active":""}" onclick="filterCategory('${c}',this)">${c}</button>`).join("");
}
function filterCategory(cat,el){
  document.querySelectorAll(".categories button").forEach(b=>b.classList.remove("active")); el.classList.add("active");
  renderProducts(cat);
}
function renderProducts(cat="All"){
  const list=cat==="All"?products:products.filter(p=>p.category===cat);
  $("products").innerHTML=list.map(p=>`<article class="product"><div class="product-art">${p.emoji}</div><h3>${p.name}</h3><p>${p.description}</p><div class="price-row"><span class="price">${money(p.price)}</span><button class="add" onclick="addToCart('${p.id}')">Add +</button></div></article>`).join("");
}
function addToCart(id){cart[id]=(cart[id]||0)+1;saveCart();updateCart();}
function changeQty(id,d){cart[id]=(cart[id]||0)+d;if(cart[id]<=0)delete cart[id];saveCart();renderCart();}
function saveCart(){localStorage.setItem("bakeryCart",JSON.stringify(cart))}
function loadCart(){try{cart=JSON.parse(localStorage.getItem("bakeryCart")||"{}")}catch{cart={}}}
function updateCart(){loadCart();$("cartCount").textContent=Object.values(cart).reduce((a,b)=>a+b,0)}
function cartData(){return Object.entries(cart).map(([id,quantity])=>({product:products.find(p=>p.id===id),quantity})).filter(x=>x.product)}
function subtotal(){return cartData().reduce((s,x)=>s+x.product.price*x.quantity,0)}
function delivery(){return subtotal()>=Number(config.freeDeliveryAbove)?0:Number(config.deliveryFee)}
function renderCart(){
  const data=cartData();
  $("cartItems").innerHTML=data.length?data.map(x=>`<div class="cart-line"><div><b>${x.product.name}</b><div>${money(x.product.price)} each</div></div><div class="qty"><button onclick="changeQty('${x.product.id}',-1)">−</button> ${x.quantity} <button onclick="changeQty('${x.product.id}',1)">+</button></div></div>`).join(""):"<p>Your cart is empty.</p>";
  $("cartTotals").innerHTML=data.length?`Subtotal: ${money(subtotal())}<br>Delivery: ${delivery()?money(delivery()):"FREE"}<br><strong>Total: ${money(subtotal()+delivery())}</strong>`:"";
}
function openCart(){renderCart();$("cartModal").classList.remove("hidden")}
function closeCart(){$("cartModal").classList.add("hidden")}
function openCheckout(){
  if(!cartData().length)return alert("Add at least one item first.");
  closeCart(); $("orderSuccess").classList.add("hidden"); $("checkoutForm").classList.remove("hidden"); $("checkoutModal").classList.remove("hidden");
  $("checkoutSummary").innerHTML=`<div class="totals">Order total: <strong>${money(subtotal()+delivery())}</strong></div>`;
}
function closeCheckout(){$("checkoutModal").classList.add("hidden")}
$("checkoutForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const body={customer:{name:f.get("name"),phone:f.get("phone"),address:f.get("address"),city:f.get("city"),pincode:f.get("pincode")},items:cartData().map(x=>({productId:x.product.id,quantity:x.quantity})),paymentMethod:f.get("paymentMethod"),notes:f.get("notes")};
  const btn=e.target.querySelector("button[type=submit]"); btn.disabled=true; btn.textContent="Placing order...";
  const r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); const data=await r.json();
  btn.disabled=false; btn.textContent="Place order";
  if(!r.ok)return alert(data.error||"Could not place order.");
  cart={};saveCart();updateCart();e.target.classList.add("hidden");
  $("orderSuccess").classList.remove("hidden");
  $("orderSuccess").innerHTML=`<h3>Order received! 🎉</h3><p>Your order number is <strong>${data.order.id}</strong>.</p><p>Total: <strong>${money(data.order.total)}</strong></p>${data.whatsappUrl?`<p><a class="primary" target="_blank" href="${data.whatsappUrl}">Send order to bakery WhatsApp</a></p>`:""}<p>Save your order number and use the tracking box on the shop page.</p>`;
});
async function trackOrder(){
  const id=$("trackId").value.trim(); if(!id)return;
  const r=await fetch("/api/orders/"+encodeURIComponent(id)); const d=await r.json();
  $("trackResult").innerHTML=r.ok?`<div class="success"><b>${d.id}</b> — ${d.items.map(i=>`${i.name} × ${i.quantity}`).join(", ")}<br><br>Status: <span class="status">${d.status}</span><br>Total: ${money(d.total)}</div>`:`<p class="error">${d.error}</p>`;
}
init();
