import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../../../work/writing/index.html", import.meta.url),"utf8");

assert.match(html,/<title>Professional Writing Assistant \| AllToolForest<\/title>/);
assert.match(html,/id="writing-v2-workspace"/);
assert.match(html,/writing-v2\/task3-bootstrap\.js/);
assert.match(html,/writing-v2-task2\.css/);
assert.match(html,/writing-v2-task3\.css/);
assert.doesNotMatch(html,/assets\/js\/app\.js/);
assert.doesNotMatch(html,/assets\/js\/work\.js/);
assert.doesNotMatch(html,/noindex|nofollow/i);
assert.match(html,/Private by design/);
assert.match(html,/does not upload your message to an AllToolForest server/);
assert.match(html,/Frequently asked questions/);
assert.match(html,/application\/ld\+json/);
assert.match(html,/professional emails, follow-ups, leave requests, resignation notices, meeting follow-ups and professional replies/i);
assert.match(html,/Save draft/);
assert.match(html,/local storage/i);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?src="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(scripts,["../../assets/js/writing-v2/task3-bootstrap.js"]);

console.log("Task 4 release-page regression PASS");
