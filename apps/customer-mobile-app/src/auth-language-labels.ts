const COMPACT_LANGUAGE_LABELS: Record<string, string> = { en: "EN", om: "OR", am: "አማ" };
const LANGUAGE_KEY = "hallo-customer-language";
const AUTH_TEXT: Record<string, Record<string, string>> = {
  om: { "Create Account":"Akkaawuntii uumi", "CREATE ACCOUNT":"AKKAAWUNTII UUMI", "Password":"Jecha iccitii", "CUSTOMER QOFA":"MAAMILA QOFA", "Customer Mobile":"Maamila Moobaayilaa" },
  am: { "Create Account":"መለያ ይፍጠሩ", "CREATE ACCOUNT":"መለያ ይፍጠሩ", "Password":"የይለፍ ቃል", "CUSTOMER ONLY":"ለደንበኛ ብቻ", "Customer Mobile":"የደንበኛ ሞባይል" },
};
function authLanguageSelect(){return Array.from(document.querySelectorAll<HTMLSelectElement>("select")).find(select=>{const values=Array.from(select.options,o=>o.value);return values.includes("en")&&values.includes("om")&&values.includes("am")});}
function activeLanguage(){const selected=authLanguageSelect()?.value;const value=selected||window.localStorage.getItem(LANGUAGE_KEY);return value==="en"||value==="am"||value==="om"?value:"om";}
function compactCustomerAuthLanguageSelects(){document.querySelectorAll<HTMLSelectElement>("select").forEach(select=>{const values=Array.from(select.options,o=>o.value);if(!(values.includes("en")&&values.includes("om")&&values.includes("am")))return;select.setAttribute("aria-label","Language");select.dataset.customerAuthLanguage="compact";Array.from(select.options).forEach(option=>{const label=COMPACT_LANGUAGE_LABELS[option.value];if(label&&option.textContent!==label)option.textContent=label;});});}
function localizeAuthText(){const root=document.getElementById("root");if(!root)return;const translations=AUTH_TEXT[activeLanguage()];if(!translations)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node:Node|null=walker.nextNode();while(node){const raw=node.textContent??"";const trimmed=raw.trim();const translated=translations[trimmed];if(translated)node.textContent=raw.replace(trimmed,translated);node=walker.nextNode();}}
function syncAuthLanguageSurface(){compactCustomerAuthLanguageSelects();localizeAuthText();}
if(typeof document!=="undefined"){const root=document.getElementById("root");syncAuthLanguageSurface();if(root){const observer=new MutationObserver(syncAuthLanguageSurface);observer.observe(root,{childList:true,subtree:true,characterData:true});}document.addEventListener("change",event=>{if(event.target instanceof HTMLSelectElement&&event.target.dataset.customerAuthLanguage==="compact")queueMicrotask(syncAuthLanguageSurface);});}

export {};
