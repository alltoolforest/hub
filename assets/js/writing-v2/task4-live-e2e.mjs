import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";

const URL="https://alltoolforest.github.io/hub/work/writing/";

async function run(browserName,browserType){
  const browser=await browserType.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto(URL,{waitUntil:"networkidle",timeout:60000});

    assert.equal(await page.title(),"Professional Writing Assistant | AllToolForest");
    await page.locator("#writing-v2-workspace").waitFor();
    assert.equal(await page.locator("#pwa2-mode-write").isChecked(),true);

    await page.locator("#pwa2-message-type").selectOption("professional_email");
    await page.locator("#pwa2-audience").selectOption("manager");
    await page.locator("#pwa2-tone").selectOption("professional");
    await page.locator("#pwa2-field-topic").fill("Quarterly report");
    await page.locator("#pwa2-field-facts").fill("The Q4 report is ready for review.\nRevenue increased by 12%.");
    await page.getByRole("button",{name:"Create professional wording"}).click();

    const output=page.locator("#pwa2-result-text");
    await output.waitFor();
    const first=await output.inputValue();
    assert.match(first,/Q4 report is ready for review/i);
    assert.match(first,/12%/);

    await output.fill(first+"\n\nManual edit.");
    await page.locator("#pwa2-field-topic").fill("Updated quarterly report");
    assert.match(await output.inputValue(),/Manual edit/);
    await page.getByRole("button",{name:"Regenerate from current inputs"}).click();
    assert.doesNotMatch(await output.inputValue(),/Manual edit/);

    await page.locator("summary").filter({hasText:"Draft options"}).click();
    await page.getByRole("button",{name:"Save draft"}).click();
    const stored=await page.evaluate(()=>localStorage.getItem("alltoolforest.professional-writing-v2.draft"));
    assert.ok(stored&&stored.includes("Updated quarterly report"));

    await page.locator("#pwa2-mode-improve").check();
    await page.locator("#pwa2-existing-text").fill("hi Priya, pls review invoice 42 by October 10, 2026.");
    await page.locator("#pwa2-improvement").selectOption("make_professional");
    await page.getByRole("button",{name:"Improve writing"}).click();
    const improved=await output.inputValue();
    assert.match(improved,/Priya/);
    assert.match(improved,/42/);
    assert.match(improved,/October 10, 2026/);

    const downloadPromise=page.waitForEvent("download");
    await page.getByRole("button",{name:"Download TXT"}).click();
    const download=await downloadPromise;
    assert.equal(download.suggestedFilename(),"professional-writing.txt");

    await page.locator("summary").filter({hasText:"Draft options"}).click().catch(()=>{});
    await page.getByRole("button",{name:"Clear saved draft"}).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem("alltoolforest.professional-writing-v2.draft")),null);

    assert.deepEqual(errors,[]);
    await context.close();

    const mobile=await browser.newContext({viewport:{width:360,height:800}});
    const mpage=await mobile.newPage();
    await mpage.goto(URL,{waitUntil:"networkidle",timeout:60000});
    const overflow=await mpage.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,"Mobile page should not horizontally overflow.");
    const heights=await mpage.locator(".pwa2-actions button").evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
    assert.ok(heights.every(h=>h>=44),"Mobile action targets must be at least 44px.");
    await mobile.close();

    console.log(browserName+" live E2E PASS");
  }finally{
    await browser.close();
  }
}

for(const [name,type] of [["chromium",chromium],["firefox",firefox],["webkit",webkit]]){
  await run(name,type);
}
console.log("Professional Writing Assistant live cross-browser E2E PASS");
