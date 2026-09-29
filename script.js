// ============================================
// AVELLA TASTE
// WEBSITE JAVASCRIPT
// ============================================


// ============================================
// SUPABASE
// ============================================

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);


// ============================================
// BACKEND
// ============================================

const BACKEND_URL =
  "https://avella-taste.onrender.com";


// ============================================
// SHOPPING CART
// ============================================

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

  updateCheckoutTotal();

}


// ============================================
// GET CART TOTAL
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
// GET TOTAL ITEMS
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


  // CART COUNT

  if (cartCount) {

    cartCount.textContent =
      totalItems;

  }


  // CART TOTAL

  if (cartTotal) {

    cartTotal.textContent =
      formatMoney(totalPrice);

  }


  // CHECKOUT BUTTON

  if (checkoutButton) {

    checkoutButton.disabled =
      cart.length === 0;

  }


  // EMPTY CART

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


  // CART ITEMS

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

                ${formatMoney(item.price)}
                each

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

              aria-label="Decrease quantity"

            >

              −

            </button>


            <span>

              ${item.quantity}

            </span>


            <button

              type="button"

              onclick="changeQuantity(${index}, 1)"

              aria-label="Increase quantity"

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
// OPEN CHECKOUT
// ============================================

function openCheckout() {


  if (cart.length === 0) {

    return;

  }


  updateCheckoutTotal();


  const checkoutOverlay =
    document.getElementById(
      "checkout-overlay"
    );


  if (checkoutOverlay) {

    checkoutOverlay.classList.add("active");

  }

}


// ============================================
// CLOSE CHECKOUT
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
// UPDATE CHECKOUT TOTAL
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
// CHECKOUT FORM
// ============================================

const checkoutForm =
  document.getElementById(
    "checkout-form"
  );


if (checkoutForm) {


  checkoutForm.addEventListener(

    "submit",

    async function(event) {


      event.preventDefault();


      // MAKE SURE CART HAS ITEMS

      if (cart.length === 0) {

        showCheckoutMessage(
          "Your cart is empty.",
          true
        );

        return;

      }


      // CUSTOMER INFORMATION

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


      // OLD PAYMENT REFERENCE
      // This will be replaced with
      // receipt upload in the next step.

      const paymentReferenceElement =
        document.getElementById(
          "payment-reference"
        );


      const paymentReference =
        paymentReferenceElement
          ? paymentReferenceElement.value.trim()
          : "";


      // REQUIRED CUSTOMER FIELDS

      if (

        !customerName ||

        !customerEmail ||

        !customerPhone ||

        !customerAddress

      ) {


        showCheckoutMessage(

          "Please complete your customer information.",

          true

        );


        return;

      }


      showCheckoutMessage(

        "Preparing your order...",

        false

      );


      try {


        // ORDER DATA

        const orderData = {

          customer_name:
            customerName,

          customer_email:
            customerEmail,

          customer_phone:
            customerPhone,

          delivery_address:
            customerAddress,

          payment_reference:
            paymentReference,

          items: cart.map(item => ({

            product_name:
              item.name,

            quantity:
              item.quantity,

            unit_price_ngn:
              item.price

          }))

        };


        showCheckoutMessage(

          "Submitting your order...",

          false

        );


        // SEND TO BACKEND

        const response =
          await fetch(

            `${BACKEND_URL}/api/orders`,

            {

              method: "POST",

              headers: {

                "Content-Type":
                  "application/json"

              },

              body:
                JSON.stringify(orderData)

            }

          );


        const result =
          await response.json();


        if (!response.ok) {

          throw new Error(

            result.error ||

            "Unable to submit order."

          );

        }


        // SUCCESS

        showCheckoutMessage(

          `Order submitted successfully! Your order number is ${result.order_number}.`,

          false

        );


        // CLEAR CART

        cart = [];


        updateCart();


        // RESET FORM

        checkoutForm.reset();


      } catch (error) {


        console.error(

          "Checkout error:",

          error

        );


        showCheckoutMessage(

          error.message ||

          "Something went wrong. Please try again.",

          true

        );

      }

    }

  );

}


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


  element.textContent =
    message;


  if (isError) {

    element.style.color =
      "#c85d7c";

  } else {

    element.style.color =
      "#4d3438";

  }

}


// ============================================
// SECURITY
// ============================================

function escapeHtml(value) {

  return String(value)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


// ============================================
// START WEBSITE
// ============================================

document.addEventListener(

  "DOMContentLoaded",

  function() {


    updateCart();


    updateCheckoutTotal();


    loadProducts();


    loadStoreSettings();


  }

);
