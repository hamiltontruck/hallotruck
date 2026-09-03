import "./styles/customer-mobile-route-first.css";

const MOBILE_CUSTOMER_QUERY = "(max-width: 639px)";

let initialized = false;

function collapseInitialCustomerBookingSheet() {
  if (initialized || !window.matchMedia(MOBILE_CUSTOMER_QUERY).matches) return;

  const sheet = document.querySelector<HTMLElement>(".customer-map-home__sheet.is-expanded");
  const handle = sheet?.querySelector<HTMLButtonElement>(".customer-map-home__handle");
  if (!sheet || !handle) return;

  initialized = true;
  handle.click();
}

const observer = new MutationObserver(collapseInitialCustomerBookingSheet);
observer.observe(document.documentElement, { childList: true, subtree: true });

queueMicrotask(collapseInitialCustomerBookingSheet);
