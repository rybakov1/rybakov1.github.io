import json, time, sys
from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:8788"
res={}
with sync_playwright() as p:
    b=p.chromium.launch(channel="chrome")
    pg=b.new_page()
    reqs=[]
    pg.on("request", lambda r: reqs.append((r.method,r.url)) if "/api/lead" in r.url else None)
    pg.goto(BASE+"/stand-brief?show=ise-sydney-2027&utm_source=e2e")
    pg.fill("#fullName","E2E Tester")
    pg.fill("#email","e2e.tester@acme-test.com.au")
    pg.fill("#phone","0412 345 678")
    pg.fill("#company","Acme Test Pty Ltd")
    opts=pg.eval_on_selector_all("#targetShow option","os=>os.map(o=>o.value).filter(Boolean)")
    pg.select_option("#targetShow", opts[0])
    for sel in ["#standSize","#standType","#budget","#timeline"]:
        vals=pg.eval_on_selector_all(sel+" option","os=>os.map(o=>o.value).filter(Boolean)")
        pg.select_option(sel, vals[-1] if sel in("#standSize","#budget") else vals[0])
    pg.fill("#message","Need a 6x6 island stand with meeting room. E2E test.")
    pg.check("#consent")
    time.sleep(3)  # timing trap is 2.5s
    pg.click("form button[type=submit]")
    pg.wait_for_url("**/thanks**", timeout=15000)
    res["final_url"]=pg.url
    res["lead_requests"]=reqs
    res["thanks_h1"]=pg.inner_text("h1")
    # inline error path: bad email server-side via direct fetch from page context
    r=pg.evaluate("""async()=>{const r=await fetch('/api/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fullName:'x',email:'nope',formStartedAt:Date.now()-5000})});return {status:r.status, body:await r.json()}}""")
    res["validation_status"]=r["status"]; res["validation_fields"]=list((r["body"].get("fields") or {}).keys())
    # honeypot
    r=pg.evaluate("""async()=>{const r=await fetch('/api/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({company_fax:'spam',fullName:'Bot',email:'b@b.com'})});return r.status}""")
    res["honeypot_status"]=r
    b.close()
print(json.dumps(res,indent=1))
