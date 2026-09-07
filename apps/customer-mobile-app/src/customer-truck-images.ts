const baseUrl = import.meta.env.BASE_URL;

const style = document.createElement("style");
style.dataset.halloTruckImages = "customer-mobile";
style.textContent = `
  .truck-grid .truck-card:nth-child(3) .truck-art-wrap,
  .truck-grid .truck-card:nth-child(4) .truck-art-wrap {
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
  }

  .truck-grid .truck-card:nth-child(3) .truck-art-wrap {
    background-image: url("${baseUrl}vehicles/cab-over-box-truck-5-ton.webp");
  }

  .truck-grid .truck-card:nth-child(4) .truck-art-wrap {
    background-image: url("${baseUrl}vehicles/dry-cargo-truck-10-ton.webp");
  }

  .truck-grid .truck-card:nth-child(3) .truck-art-wrap .truck-art,
  .truck-grid .truck-card:nth-child(4) .truck-art-wrap .truck-art {
    visibility: hidden;
  }
`;

document.head.appendChild(style);
