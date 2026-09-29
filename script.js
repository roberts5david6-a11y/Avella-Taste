// ============================================
// AVELLA TASTE
// WEBSITE JAVASCRIPT
// ============================================


// ============================================
// SUPABASE CONNECTION
// ============================================

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);


// ============================================
// CART
// ============================================

let cart = [];


// ============================================
// FORMAT NIGERIAN NAIRA
// ============================================

function formatMoney(amount) {
  return "₦" + Number(amount).toLocaleString("en-NG");
}


// ============================================
// ADD PRODUCT TO CART
// ============================================

function addToCart(name, price) {

  const existingItem = cart.find(
    item => item.name === name
  );


  if (existingItem) {

    existingItem.quantity += 1;

  } else {

    cart.push({
      name: name,
      price: Number(price),
      quantity: 1
    });

  }


  updateCart();


  document
    .getElementById("cart-overlay")
    .classList.add("active");
}


// ============================================
// UPDATE CART
// ============================================

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
    (total, item) =>
      total + item.quantity,
    0
  );


  const totalPrice = cart.reduce(
    (total, item) =>
      total +
      item.price * item.quantity,
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


  cartItems.innerHTML = cart
    .map((item, index) => {

      const itemTotal =
        item.price * item.quantity;


      return `
        <div class="cart-item">

          <div class="cart-item-top">

            <h4>
              ${escapeHtml(item.name)}
            </h4>

            <span class="cart-item-price">
              ${formatMoney(itemTotal)}
            </span>

          </div>


          <div class="quantity-controls">

            <button
              type="button"
              onclick="changeQuantity(${index}, -1)"
            >
              −
            </button>

            <span>
              ${item.quantity}
            </span>

            <button
              type="button"
              onclick="changeQuantity(${index}, 1)"
            >
              +
            </button>

          </div>

        </div>
      `;

    })
    .join("");
}


// ============================================
// CHANGE QUANTITY
// ============================================

function changeQuantity(index, change) {

  if (!cart[index]) {
    return;
  }


  cart[index].quantity += change;


  if (cart[index].quantity <= 0) {

    cart.splice(index, 1);

  }


  updateCart();
}


// ============================================
// OPEN / CLOSE CART
// ============================================

function toggleCart() {

  document
    .getElementById("cart-overlay")
    .classList.toggle("active");
}


// ============================================
// OPEN CHECKOUT
// ============================================

function openCheckout() {

  if (cart.length === 0) {
    return;
  }


  updateCheckoutTotal();


  document
    .getElementById("checkout-overlay")
    .classList.add("active");
}


// ============================================
// CLOSE CHECKOUT
// ============================================

function closeCheckout() {

  document
    .getElementById("checkout-overlay")
    .classList.remove("active");
}


// ============================================
// CHECKOUT TOTAL
// ============================================

function updateCheckoutTotal() {

  const total = cart.reduce(
    (sum, item) =>
      sum +
      item.price * item.quantity,
    0
  );


  const checkoutTotal =
    document.getElementById(
      "checkout-total"
    );


  if (checkoutTotal) {

    checkoutTotal.textContent =
      formatMoney(total);

  }
}


// ============================================
// LOAD PRODUCTS FROM SUPABASE
// ============================================

async function loadProducts() {

  try {

    const {
      data,
      error
    } = await supabaseClient
      .from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", {
        ascending: true
      });


    if (error) {
      throw error;
    }


    if (!data || data.length === 0) {

      console.log(
        "No products found in Supabase."
      );

      return;
    }


    console.log(
      "Products loaded from Supabase:",
      data
    );


    /*
      We will connect these database
      products to the visual product cards
      in the next stage.
    */


  } catch (error) {

    console.error(
      "Supabase product loading error:",
      error
    );

  }
}


// ============================================
// LOAD STORE SETTINGS
// ============================================

async function loadStoreSettings() {

  try {

    const {
      data,
      error
    } = await supabaseClient
      .from("store_settings")
      .select("*")
      .eq("id", true)
      .single();


    if (error) {
      throw error;
    }


    if (!data) {
      return;
    }


    console.log(
      "Avella Taste settings loaded:",
      data
    );


    /*
      Later we will use these settings
      to automatically display:

      - Business name
      - Phone
      - Email
      - Bank name
      - Account name
      - Account number

      This means your sister can change
      payment details without editing
      the whole website.
    */


  } catch (error) {

    console.error(
      "Supabase settings error:",
      error
    );

  }
}


// ============================================
// CHECKOUT FORM
// ============================================

document
  .getElementById("checkout-form")
  .addEventListener(
    "submit",
    async function(event) {

      event.preventDefault();


      if (cart.length === 0) {

        showCheckoutMessage(
          "Your cart is empty.",
          true
        );

        return;
      }


      const customerName =
        document
          .getElementById("customer-name")
          .value
          .trim();


      const customerEmail =
        document
          .getElementById("customer-email")
          .value
          .trim();


      const customerPhone =
        document
          .getElementById("customer-phone")
          .value
          .trim();


      const customerAddress =
        document
          .getElementById("customer-address")
          .value
          .trim();


      const paymentReference =
        document
          .getElementById("payment-reference")
          .value
          .trim();


      if (
        !customerName ||
        !customerEmail ||
        !customerPhone ||
        !customerAddress ||
        !paymentReference
      ) {

        showCheckoutMessage(
          "Please complete all fields.",
          true
        );

        return;
      }


      /*
        IMPORTANT:

        We are NOT inserting the order
        directly into Supabase from the
        browser yet.

        The secure server will handle this.

        This prevents customers from
        manipulating prices or orders.

        The server will:

        1. Verify the products.
        2. Calculate the real total.
        3. Create the order.
        4. Save the order items.
        5. Store the payment reference.
        6. Allow payment confirmation.
        7. Send the receipt email.
      */


      showCheckoutMessage(
        "Preparing your order...",
        false
      );


      try {

        const orderData = {

          customer_name: customerName,

          customer_email: customerEmail,

          customer_phone: customerPhone,

          delivery_address: customerAddress,

          payment_reference:
            paymentReference,

          items: cart.map(item => ({

            product_name: item.name,

            quantity: item.quantity,

            unit_price_ngn: item.price

          }))

        };


        console.log(
          "Order ready for secure server:",
          orderData
        );


        /*
          TEMPORARY MESSAGE

          The secure Render backend will
          be connected in the next stage.
        */


        showCheckoutMessage(
          "Your order form is ready. We are connecting the secure payment system next.",
          false
        );


      } catch (error) {

        console.error(
          "Checkout error:",
          error
        );


        showCheckoutMessage(
          "Something went wrong. Please try again.",
          true
        );

      }

    }
  );


// ============================================
// CHECKOUT MESSAGE
// ============================================

function showCheckoutMessage(
  message,
  isError
) {

  const element =
    document.getElementById(
      "checkout-message"
    );


  if (!element) {
    return;
  }


  element.textContent = message;


  if (isError) {

    element.style.color =
      "#c85d7c";

  } else {

    element.style.color =
      "#4d3438";

  }
}


// ============================================
// BASIC HTML ESCAPING
// ============================================

function escapeHtml(value) {

  return String(value)

    .replaceAll("&", "&amp;")

    .replaceAll("<", "&lt;")

    .replaceAll(">", "&gt;")

    .replaceAll('"', "&quot;")

    .replaceAll("'", "&#039;");
}


// ============================================
// START WEBSITE
// ============================================

document.addEventListener(
  "DOMContentLoaded",
  function() {

    updateCart();

    loadProducts();

    loadStoreSettings();

  }
);
