import time, json
from playwright.sync_api import sync_playwright
out={}
with sync_playwright() as p:
    b=p.chromium.launch(channel="chrome")
    for mode in ("502","404"):
        pg=b.new_page()
        if mode=="502":
            pg.route("**/api/lead", lambda r: r.fulfill(status=502, content_type="application/json", body='{"ok":false,"error":"delivery_failed","message":"We couldn’t deliver your brief just now. Please try again in a minute."}'))
        else:
            pg.route("**/api/lead", lambda r: r.fulfill(status=404, body="nf"))
        pg.goto("http://127.0.0.1:8788/stand-brief")
        pg.fill("#fullName","Err Test"); pg.fill("#email","err@acme-test.com.au"); pg.fill("#phone","0412345678"); pg.fill("#company","Err Co")
        for sel in ["#targetShow","#standSize","#standType","#budget","#timeline"]:
            v=pg.eval_on_selector_all(sel+" option","os=>os.map(o=>o.value).filter(Boolean)"); pg.select_option(sel,v[0])
        pg.check("#consent"); time.sleep(3)
        nav=[]
        pg.on("framenavigated", lambda f: nav.append(f.url))
        pg.on("request", lambda r: nav.append(r.url) if r.url.startswith("mailto") else None)
        pg.click("form button[type=submit]"); pg.wait_for_timeout(2500)
        err=pg.locator("#formError")
        out[mode]={"url":pg.url,"error_visible":err.is_visible(),"error_text":err.inner_text() if err.is_visible() else "", "nav":nav}
        if mode=="502": pg.screenshot(path="/tmp/e2e/inline-error.png", full_page=False)
        pg.close()
    b.close()
print(json.dumps(out,indent=1,ensure_ascii=False))
