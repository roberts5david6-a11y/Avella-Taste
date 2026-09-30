const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const app = express();

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  console.error("Missing ADMIN_PASSWORD environment variable.");
  process.exit(1);
}

if (!RESEND_API_KEY) {
  console.error("Missing RESEND_API_KEY environment variable.");
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY
);

const resend = new Resend(RESEND_API_KEY);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf"
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only JPG, PNG, WEBP or PDF files are allowed."
        )
      );
    }
  }
});

app.use(express.json());

const PRODUCT_CATALOG = {
  "Milky Yogurt (Plain) - 35cl": {
    name: "Milky Yogurt (Plain) - 35cl",
    price: 1500
  },

  "Greek Yogurt - 500ml": {
    name: "Greek Yogurt - 500ml",
    price: 5000
  },

  "Greek Yogurt - 1L": {
    name: "Greek Yogurt - 1L",
    price: 9500
  },

  "Mini Banana Bread - 1 pc": {
    name: "Mini Banana Bread - 1 pc",
    price: 1000
  },

  "Mini Banana Bread - 3 pcs": {
    name: "Mini Banana Bread - 3 pcs",
    price: 2500
  },

  "Mini Banana Bread - Pack of 4": {
    name: "Mini Banana Bread - Pack of 4",
    price: 3500
  }
};

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findCatalogProduct(name) {
  const normalized = normalizeName(name);

  for (const key of Object.keys(PRODUCT_CATALOG)) {
    if (normalizeName(key) === normalized) {
      return PRODUCT_CATALOG[key];
    }
  }

  return null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

/*
  ADMIN AUTHENTICATION
*/
function requireAdmin(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Basic ")) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Avella Taste Admin"'
    );

    return res.status(401).send("Admin login required.");
  }

  const encoded = authorization.slice(6);

  let decoded;

  try {
    decoded = Buffer
      .from(encoded, "base64")
      .toString("utf8");
  } catch (error) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Avella Taste Admin"'
    );

    return res.status(401).send("Invalid admin login.");
  }

  const separator = decoded.indexOf(":");

  if (separator === -1) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Avella Taste Admin"'
    );

    return res.status(401).send("Invalid admin login.");
  }

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  if (
    username !== "admin" ||
    password !== ADMIN_PASSWORD
  ) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Avella Taste Admin"'
    );

    return res.status(401).send("Incorrect admin login.");
  }

  next();
}

/*
  ADMIN PAGE
*/
app.get("/admin.html", requireAdmin, (req, res) => {
  res.sendFile(__dirname + "/admin.html");
});

/*
  GET ALL ORDERS
*/
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const {
      data: orders,
      error
    } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (*)
      `)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error("Admin orders error:", error);

      return res.status(500).json({
        error: "Could not load orders."
      });
    }

    const safeOrders = [];

    for (const order of orders || []) {
      let paymentProofUrl = null;

      if (order.payment_proof_url) {
        const {
          data: signedData,
          error: signedError
        } = await supabase.storage
          .from("payment-receipts")
          .createSignedUrl(
            order.payment_proof_url,
            60 * 60
          );

        if (!signedError && signedData) {
          paymentProofUrl = signedData.signedUrl;
        }
      }

      safeOrders.push({
        ...order,
        payment_proof_signed_url: paymentProofUrl
      });
    }

    res.json({
      orders: safeOrders
    });

  } catch (error) {
    console.error("Admin endpoint error:", error);

    res.status(500).json({
      error: "Server error while loading orders."
    });
  }
});

/*
  SEND BRANDED PAYMENT RECEIPT
*/
async function sendPaymentReceiptEmail(order, orderItems) {
  const itemRows = orderItems.map(item => {
    return `
      <tr>
        <td style="
          padding:12px;
          border-bottom:1px solid #f4dce7;
          color:#4a3028;
        ">
          ${escapeHtml(item.product_name)}
        </td>

        <td style="
          padding:12px;
          border-bottom:1px solid #f4dce7;
          text-align:center;
          color:#4a3028;
        ">
          ${item.quantity}
        </td>

        <td style="
          padding:12px;
          border-bottom:1px solid #f4dce7;
          text-align:right;
          color:#4a3028;
        ">
          ${formatNaira(item.unit_price_ngn)}
        </td>

        <td style="
          padding:12px;
          border-bottom:1px solid #f4dce7;
          text-align:right;
          color:#4a3028;
          font-weight:600;
        ">
          ${formatNaira(item.line_total_ngn)}
        </td>
      </tr>
    `;
  }).join("");

  const paidDate = order.paid_at
    ? new Date(order.paid_at).toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : new Date().toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short"
      });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Avella Taste Payment Receipt</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#fff5f9;
  font-family:Arial,Helvetica,sans-serif;
">

  <div style="
    max-width:680px;
    margin:30px auto;
    background:#ffffff;
    border-radius:18px;
    overflow:hidden;
    box-shadow:0 5px 25px rgba(90,40,60,0.10);
  ">

    <div style="
      background:#fde5ef;
      padding:30px 20px;
      text-align:center;
      border-bottom:4px solid #ed2d78;
    ">

      <div style="
        font-size:36px;
        font-weight:700;
        color:#ed2d78;
        font-family:cursive;
      ">
        Avella
      </div>

      <div style="
        font-size:28px;
        font-weight:700;
        color:#4a3028;
        font-family:cursive;
        margin-top:-4px;
      ">
        Taste
      </div>

      <p style="
        margin:12px 0 0;
        color:#7a5b64;
        font-size:14px;
      ">
        Deliciousness made with love 💗
      </p>

    </div>

    <div style="padding:30px 24px;">

      <div style="
        text-align:center;
        margin-bottom:25px;
      ">

        <div style="
          display:inline-block;
          background:#e9f8ed;
          color:#23833e;
          padding:9px 18px;
          border-radius:30px;
          font-weight:700;
          font-size:14px;
        ">
          PAYMENT CONFIRMED ✓
        </div>

        <h1 style="
          color:#4a3028;
          margin:18px 0 5px;
          font-size:25px;
        ">
          Thank you for your order!
        </h1>

        <p style="
          color:#7a5b64;
          margin:0;
          font-size:14px;
        ">
          Your payment has been confirmed successfully.
        </p>

      </div>

      <div style="
        background:#fff7fa;
        border:1px solid #f4dce7;
        border-radius:12px;
        padding:18px;
        margin-bottom:22px;
      ">

        <p style="
          margin:0 0 8px;
          color:#7a5b64;
          font-size:13px;
        ">
          Order Number
        </p>

        <strong style="
          color:#ed2d78;
          font-size:20px;
        ">
          ${escapeHtml(order.order_number)}
        </strong>

      </div>

      <p style="
        color:#4a3028;
        margin:0 0 6px;
      ">
        <strong>Customer:</strong>
        ${escapeHtml(order.customer_name)}
      </p>

      <p style="
        color:#4a3028;
        margin:0 0 6px;
      ">
        <strong>Email:</strong>
        ${escapeHtml(order.customer_email)}
      </p>

      <p style="
        color:#4a3028;
        margin:0 0 20px;
      ">
        <strong>Payment Date:</strong>
        ${escapeHtml(paidDate)}
      </p>

      <table style="
        width:100%;
        border-collapse:collapse;
        margin-top:15px;
      ">

        <thead>
          <tr style="
            background:#fde5ef;
          ">

            <th style="
              padding:12px;
              text-align:left;
              color:#4a3028;
              font-size:13px;
            ">
              Item
            </th>

            <th style="
              padding:12px;
              text-align:center;
              color:#4a3028;
              font-size:13px;
            ">
              Qty
            </th>

            <th style="
              padding:12px;
              text-align:right;
              color:#4a3028;
              font-size:13px;
            ">
              Price
            </th>

            <th style="
              padding:12px;
              text-align:right;
              color:#4a3028;
              font-size:13px;
            ">
              Total
            </th>

          </tr>
        </thead>

        <tbody>
          ${itemRows}
        </tbody>

      </table>

      <div style="
        margin-top:20px;
        padding:18px;
        background:#ed2d78;
        border-radius:12px;
        color:white;
        display:flex;
        justify-content:space-between;
        align-items:center;
      ">

        <strong style="font-size:17px;">
          TOTAL PAID
        </strong>

        <strong style="font-size:22px;">
          ${formatNaira(order.total_amount_ngn)}
        </strong>

      </div>

      <div style="
        margin-top:25px;
        padding:18px;
        background:#fff7fa;
        border-radius:12px;
        text-align:center;
      ">

        <p style="
          margin:0 0 7px;
          color:#4a3028;
          font-weight:700;
        ">
          Avella Taste
        </p>

        <p style="
          margin:0;
          color:#7a5b64;
          font-size:13px;
        ">
          Thank you for choosing us 💗
        </p>

      </div>

    </div>

    <div style="
      background:#fde5ef;
      padding:18px;
      text-align:center;
      color:#7a5b64;
      font-size:12px;
    ">
      This is an official payment receipt from Avella Taste.
    </div>

  </div>

</body>
</html>
  `;

  const { data, error } = await resend.emails.send({
    from: "Avella Taste <onboarding@resend.dev>",
    to: [order.customer_email],
    subject: `Payment Receipt - ${order.order_number}`,
    html: html
  });

  if (error) {
    console.error("Receipt email error:", error);
    throw new Error(
      error.message || "Could not send receipt email."
    );
  }

  return data;
}

/*
  CONFIRM PAYMENT
*/
app.post(
  "/api/admin/orders/:orderId/confirm-payment",
  requireAdmin,
  async (req, res) => {

    try {
      const orderId = req.params.orderId;

      if (!orderId) {
        return res.status(400).json({
          error: "Missing order ID."
        });
      }

      /*
        First check that the order exists.
      */
      const {
        data: existingOrder,
        error: findError
      } = await supabase
        .from("orders")
        .select(`
          *,
          order_items (*)
        `)
        .eq("id", orderId)
        .single();

      if (findError || !existingOrder) {
        console.error(
          "Order lookup error:",
          findError
        );

        return res.status(404).json({
          error: "Order not found."
        });
      }

      /*
        Do not confirm an already cancelled order.
      */
      if (existingOrder.payment_status === "cancelled") {
        return res.status(400).json({
          error: "This order has been cancelled."
        });
      }

      /*
        Mark payment as paid.
      */
      const {
        data: updatedOrder,
        error: updateError
      } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          paid_at: new Date().toISOString()
        })
        .eq("id", orderId)
        .select()
        .single();

      if (updateError) {
        console.error(
          "Payment confirmation error:",
          updateError
        );

        return res.status(500).json({
          error: "Could not confirm payment."
        });
      }

      /*
        Send the branded receipt email.
      */
      let emailSent = false;
      let emailError = null;

      try {
        await sendPaymentReceiptEmail(
          updatedOrder,
          existingOrder.order_items || []
        );

        emailSent = true;

      } catch (error) {
        console.error(
          "Receipt email failed:",
          error
        );

        emailError =
          error.message ||
          "Payment was confirmed, but the receipt email could not be sent.";
      }

      /*
        Payment remains confirmed even if email delivery fails.
      */
      if (!emailSent) {
        return res.json({
          success: true,
          payment_confirmed: true,
          email_sent: false,
          message:
            "Payment confirmed, but the receipt email could not be sent.",
          email_error: emailError,
          order: updatedOrder
        });
      }

      res.json({
        success: true,
        payment_confirmed: true,
        email_sent: true,
        message:
          "Payment confirmed and receipt email sent.",
        order: updatedOrder
      });

    } catch (error) {
      console.error(
        "Confirm payment error:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "Could not confirm payment."
      });
    }
  }
);

/*
  CUSTOMER ORDER SUBMISSION
*/
app.post(
  "/api/orders",
  upload.single("payment_receipt"),
  async (req, res) => {

    try {
      const {
        customer_name,
        customer_email,
        customer_phone,
        delivery_address,
        items
      } = req.body;

      if (
        !customer_name ||
        !customer_email ||
        !customer_phone ||
        !items
      ) {
        return res.status(400).json({
          error:
            "Missing required order information."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error:
            "Please upload your payment receipt."
        });
      }

      let cartItems;

      try {
        cartItems = JSON.parse(items);
      } catch (error) {
        return res.status(400).json({
          error: "Invalid cart information."
        });
      }

      if (
        !Array.isArray(cartItems) ||
        cartItems.length === 0
      ) {
        return res.status(400).json({
          error: "Your cart is empty."
        });
      }

      /*
        Get database products.
      */
      const {
        data: databaseProducts,
        error: productsError
      } = await supabase
        .from("products")
        .select("*");

      if (productsError) {
        console.error(
          "Products lookup error:",
          productsError
        );

        return res.status(500).json({
          error: "Could not verify products."
        });
      }

      let totalAmount = 0;

      const orderItems = [];

      for (const item of cartItems) {

        const itemName =
          item.name ||
          item.product_name;

        const quantity =
          Number(item.quantity);

        if (
          !itemName ||
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          return res.status(400).json({
            error:
              "Invalid product or quantity."
          });
        }

        const catalogProduct =
          findCatalogProduct(itemName);

        if (!catalogProduct) {
          return res.status(400).json({
            error:
              `Product not found: ${itemName}`
          });
        }

        const normalizedItemName =
          normalizeName(itemName);

        const databaseProduct =
          databaseProducts.find(
            product =>
              normalizeName(product.name) ===
              normalizedItemName
          ) || null;

        const unitPrice =
          catalogProduct.price;

        const lineTotal =
          unitPrice * quantity;

        totalAmount += lineTotal;

        orderItems.push({
          product_id:
            databaseProduct
              ? databaseProduct.id
              : null,

          product_name:
            catalogProduct.name,

          quantity,

          unit_price_ngn:
            unitPrice,

          line_total_ngn:
            lineTotal
        });
      }

      /*
        Generate order number.
      */
      const orderNumber =
        "AT-" +
        Date.now()
          .toString()
          .slice(-8) +
        "-" +
        Math.floor(
          100 + Math.random() * 900
        );

      /*
        Upload receipt.
      */
      const safeEmail =
        String(customer_email)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .slice(0, 40);

      const extension =
        req.file.originalname
          .split(".")
          .pop()
          .toLowerCase();

      const filePath =
        `receipts/${Date.now()}-${safeEmail}.${extension}`;

      const {
        error: uploadError
      } = await supabase.storage
        .from("payment-receipts")
        .upload(
          filePath,
          req.file.buffer,
          {
            contentType:
              req.file.mimetype,

            upsert: false
          }
        );

      if (uploadError) {
        console.error(
          "Receipt upload error:",
          uploadError
        );

        return res.status(500).json({
          error:
            "Could not upload payment receipt."
        });
      }

      /*
        Create order.
      */
      const {
        data: order,
        error: orderError
      } = await supabase
        .from("orders")
        .insert({
          order_number:
            orderNumber,

          customer_name:
            customer_name,

          customer_email:
            customer_email,

          customer_phone:
            customer_phone,

          delivery_address:
            delivery_address || null,

          total_amount_ngn:
            totalAmount,

          payment_status:
            "proof_submitted",

          payment_proof_url:
            filePath
        })
        .select()
        .single();

      if (orderError) {
        console.error(
          "Order insert error:",
          orderError
        );

        return res.status(500).json({
          error:
            "Could not create order."
        });
      }

      /*
        Create order items.
      */
      const itemsToInsert =
        orderItems.map(item => ({
          ...item,
          order_id: order.id
        }));

      const {
        error: itemsError
      } = await supabase
        .from("order_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.error(
          "Order items error:",
          itemsError
        );

        return res.status(500).json({
          error:
            "Could not save order items."
        });
      }

      res.json({
        success: true,

        order_number:
          orderNumber,

        order_id:
          order.id,

        total_amount_ngn:
          totalAmount,

        payment_status:
          "proof_submitted"
      });

    } catch (error) {
      console.error(
        "Order submission error:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "Something went wrong."
      });
    }
  }
);

/*
  GENERAL ERROR HANDLER
*/
app.use((error, req, res, next) => {
  console.error(
    "Server error:",
    error
  );

  if (error instanceof multer.MulterError) {

    if (
      error.code ===
      "LIMIT_FILE_SIZE"
    ) {
      return res.status(400).json({
        error:
          "Payment receipt must be 5MB or smaller."
      });
    }

    return res.status(400).json({
      error: error.message
    });
  }

  res.status(500).json({
    error:
      error.message ||
      "Server error."
  });
});

/*
  SERVE WEBSITE
*/
app.use(
  express.static(__dirname)
);

app.listen(PORT, () => {
  console.log(
    `Avella Taste server running on port ${PORT}`
  );
});
