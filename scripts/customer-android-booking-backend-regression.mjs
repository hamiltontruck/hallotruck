import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const repository = await readFile("mobile/customer/android/app/src/main/java/com/hallo/logistics/customer/CustomerRepository.kt", "utf8");
const models = await readFile("mobile/customer/android/app/src/main/java/com/hallo/logistics/customer/CustomerModels.kt", "utf8");

assert.match(repository, /functions\/v1\/customer-booking/, "Customer Android order creation must use the secure customer-booking Edge Function");
assert.match(repository, /Authorization" to "Bearer \$\{session\.accessToken\}"/, "Customer Android booking must forward the signed-in Customer bearer token");
assert.match(repository, /"requestId", input\.requestId/, "Customer Android booking must send an idempotency request ID");
assert.match(repository, /catch \(error: IOException\)[\s\S]*postJson\(endpoint, payload, headers\)/, "Customer Android network retry must reuse the same booking request ID");
assert.doesNotMatch(repository, /from\("orders"\)\.insert/, "Customer Android must not directly insert booking orders anymore");
assert.doesNotMatch(repository, /tracking\s*=\s*"HT-/, "Customer Android must not generate authoritative tracking IDs client-side");
assert.match(models, /val requestId: String = java\.util\.UUID\.randomUUID\(\)\.toString\(\)/, "CreateOrderInput must carry a stable request ID for the submit attempt");

console.log("Customer Android secure booking backend regression guards passed.");
