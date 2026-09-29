let cart = [];

function formatMoney(amount) {
  return "₦" + amount.toLocaleString("en-NG");
}


function addToCart(name, price) {

  const existing = cart.find(
    item => item.name === name
  );

  if (existing) {
    existing.quantity++;
  } else {
    cart.push({
      name,
      price,
      quantity: 1
    });
  }

  updateCart();

  document
    .getElementById("cart-overlay")
    .classList.add("active");
}


function updateCart() {

  const cartItems =
    document.getElementById("cart-items");

  const cartCount =
    document.getElementById("cart-count");

  const cartTotal =
    document.getElementById("cart-total");

  const checkoutButton =
    document.getElementById("checkout-button");


  const totalItems = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );


  const totalPrice = cart.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0
  );


  cartCount.textContent = totalItems;

  cartTotal.textContent =
    formatMoney(totalPrice);


  checkoutButton.disabled =
    cart.length === 0;


  if (cart.length === 0) {

    cartItems.innerHTML = `
      <p class="empty-cart">
        Your cart is empty.
      </p>
    `;

    return;
  }


  cartItems.innerHTML = cart.map(
    (item, index) => `

      <div class="cart-item">

        <div class="cart-item-top">

          <h4>${item.name}</h4>

          <span class="cart-item-price">
            ${formatMoney(
              item.price * item.quantity
            )}
          </span>

        </div>


        <div class="quantity-controls">

          <button
            onclick="changeQuantity(${index}, -1)"
          >
            −
          </button>

          <span>
            ${item.quantity}
          </span>

          <button
            onclick="changeQuantity(${index}, 1)"
          >
            +
          </button>

        </div>

      </div>

    `
  ).join("");
}


function changeQuantity(index, change) {

  cart[index].quantity += change;

  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }

  updateCart();
}


function toggleCart() {

  document
    .getElementById("cart-overlay")
    .classList.toggle("active");
}


function openCheckout() {

  if (cart.length === 0) {
    return;
  }

  document
    .getElementById("checkout-overlay")
    .classList.add("active");
}


function closeCheckout() {

  document
    .getElementById("checkout-overlay")
    .classList.remove("active");
}


document
  .getElementById("checkout-form")
  .addEventListener("submit", function(event) {

    event.preventDefault();


    const customer = {

      name:
        document
          .getElementById("customer-name")
          .value,

      email:
        document
          .getElementById("customer-email")
          .value,

      phone:
        document
          .getElementById("customer-phone")
          .value,

      address:
        document
          .getElementById("customer-address")
          .value,

      paymentReference:
        document
          .getElementById("payment-reference")
          .value
    };


    const total = cart.reduce(
      (sum, item) =>
        sum + item.price * item.quantity,
      0
    );


    const orderNumber =
      "AT-" +
      Date.now().toString().slice(-8);


    /*
      TEMPORARY:

      Later this information will be
      sent to our Supabase backend.

      Supabase will store the order,
      payment reference and customer details.

      After payment confirmation,
      our email service will send
      the customer their receipt.
    */


    alert(
      "Order received!\\n\\n" +
      "Order: " + orderNumber + "\\n" +
      "Customer: " + customer.name + "\\n" +
      "Total: " + formatMoney(total) +
      "\\n\\n" +
      "Your payment will be verified."
    );


    cart = [];

    updateCart();

    closeCheckout();

    document
      .getElementById("cart-overlay")
      .classList.remove("active");

    this.reset();

  });
