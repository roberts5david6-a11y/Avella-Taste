// ============================================
// AVELLA TASTE
// WEBSITE JAVASCRIPT
// ============================================

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const BACKEND_URL =
  "https://avella-taste.onrender.com";

let cart = [];


// ============================================
// FORMAT MONEY
// ============================================

function formatMoney(amount) {

  return "₦" + Number(amount).toLocaleString("en-NG");

}


// ============================================
// ADD TO CART
// ============================================

function addToCart(name, price) {

  const existingItem =
    cart.find(item => item.name === name);

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

  const cartOverlay =
    document.getElementById("cart-overlay");

  if (cartOverlay) {

    cartOverlay.classList.add("active");

  }

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
// CART TOTAL
// ============================================

function getCartTotal() {

  return cart.reduce(

    (total, item) => {

      return total +
        (item.price * item.quantity);

    },

    0

  );

}


// ============================================
// CART ITEM COUNT
// ============================================

function getCartItemCount() {

  return cart.reduce(

    (total, item) => {

      return total + item.quantity;

    },

    0

  );

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


  const totalItems =
    getCartItemCount();

  const totalPrice =
    getCartTotal();


  if (cartCount) {

    cartCount.textContent =
      totalItems;

  }


  if (cartTotal) {

    cartTotal.textContent =
      formatMoney(totalPrice);

  }


  if (checkoutButton) {

    checkoutButton.disabled =
      cart.length === 0;

  }


  if (!cartItems) {

    return;

  }


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

            <div>

              <h4>
                ${escapeHtml(item.name)}
              </h4>

              <p>
                ${formatMoney(item.price)} each
              </p>

            </div>

            <strong>
              ${formatMoney(itemTotal)}
            </strong>

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
// OPEN / CLOSE CART
// ============================================

function toggleCart() {

  const cartOverlay =
    document.getElementById("cart-overlay");

  if (!cartOverlay) {

    return;

  }

  cartOverlay.classList.toggle("active");

}


// ============================================
// CHECKOUT
// ============================================

function openCheckout() {

  if (cart.length === 0) {

    return;

  }


  /*
    Save the current cart so payment.html
    can read it.
  */

  localStorage.setItem(
    "avellaCart",
    JSON.stringify(cart)
  );


  /*
    Go to the dedicated payment page.
  */

  window.location.href =
    "payment.html";

}


// ============================================
// OLD CHECKOUT CLOSE FUNCTION
// ============================================

function closeCheckout() {

  const checkoutOverlay =
    document.getElementById(
      "checkout-overlay"
    );

  if (checkoutOverlay) {

    checkoutOverlay.classList.remove(
      "active"
    );

  }

}


// ============================================
// CHECKOUT TOTAL
// ============================================

function updateCheckoutTotal() {

  const checkoutTotal =
    document.getElementById(
      "checkout-total"
    );

  if (!checkoutTotal) {

    return;

  }

  checkoutTotal.textContent =
    formatMoney(getCartTotal());

}


// ============================================
// LOAD PRODUCTS
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


  } catch (error) {

    console.error(
      "Supabase settings error:",
      error
    );

  }

}


// ============================================
// ESCAPE HTML
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
