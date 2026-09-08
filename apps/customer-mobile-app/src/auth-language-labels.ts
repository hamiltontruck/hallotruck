const COMPACT_LANGUAGE_LABELS: Record<string, string> = {
  en: "EN",
  om: "OR",
  am: "አማ",
};

function compactCustomerAuthLanguageSelects() {
  document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
    const values = Array.from(select.options, (option) => option.value);
    if (!(values.includes("en") && values.includes("om") && values.includes("am"))) return;

    select.setAttribute("aria-label", "Language");
    select.dataset.customerAuthLanguage = "compact";
    Array.from(select.options).forEach((option) => {
      const label = COMPACT_LANGUAGE_LABELS[option.value];
      if (label) option.textContent = label;
    });
  });
}

if (typeof document !== "undefined") {
  const root = document.getElementById("root");
  compactCustomerAuthLanguageSelects();
  if (root) {
    const observer = new MutationObserver(() => compactCustomerAuthLanguageSelects());
    observer.observe(root, { childList: true, subtree: true });
  }
}
