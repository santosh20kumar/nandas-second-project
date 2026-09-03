let password=sessionStorage.getItem("adminPassword")||"";
const $=id=>document.getElementById(id);
const statuses=["Received","Confirmed","Baking","Out for delivery","Delivered","Cancelled"];
async function login(){
  password=$("adminPassword").value;
  const r=await fetch("/api/admin/orders",{headers:{"x-admin-password":password}});
  if(!r.ok){$("loginError").textContent="Incorrect password.";return}
  sessionStorage.setItem("adminPassword",password); $("loginBox").classList.add("hidden");$("dashboard").classList.remove("hidden");render(await r.json());
}
async function loadOrders(){
  const r=await fetch("/api/admin/orders",{headers:{"x-admin-password":password}});
  if(r.status===401){sessionStorage.removeItem("adminPassword");location.reload();return}
  render(await r.json());
}
function render(orders){
  $("orders").innerHTML=orders.length?orders.map(o=>`<article class="order">
    <div class="order-head"><div><h3>${o.id}</h3><small>${new Date(o.createdAt).toLocaleString()}</small></div><select onchange="updateStatus('${o.id}',this.value)">${statuses.map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select></div>
    <p><b>${o.customer.name}</b> · ${o.customer.phone}<br>${o.customer.address}${o.customer.city?`, ${o.customer.city}`:""}${o.customer.pincode?` - ${o.customer.pincode}`:""}</p>
    <ul>${o.items.map(i=>`<li>${i.name} × ${i.quantity} — ₹${i.lineTotal}</li>`).join("")}</ul>
    <b>Total: ₹${o.total}</b> · ${o.paymentMethod}${o.notes?`<br><small>Notes: ${o.notes}</small>`:""}
  </article>`).join(""):"<p>No orders yet.</p>";
}
async function updateStatus(id,status){
  const r=await fetch("/api/admin/orders/"+encodeURIComponent(id),{method:"PATCH",headers:{"Content-Type":"application/json","x-admin-password":password},body:JSON.stringify({status})});
  if(!r.ok)alert("Could not update order."); else loadOrders();
}
if(password){$("loginBox").classList.add("hidden");$("dashboard").classList.remove("hidden");loadOrders();}
