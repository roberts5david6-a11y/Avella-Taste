const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  console.error("Missing ADMIN_PASSWORD environment variable.");
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY
);

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

/*
  PRODUCT CATALOG
*/

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

/*
  HELPER FUNCTIONS
*/

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
  WHATSAPP PHONE HELPER
*/

function normalizeWhatsAppPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("0")) {
    digits = "234" + digits.slice(1);
  }

  return digits;
}

/*
  RECEIPT LINK SECURITY
*/

function createReceiptToken(orderId, issuedAt) {
  const payload = `${orderId}.${issuedAt}`;

  const signature = crypto
    .createHmac("sha256", ADMIN_PASSWORD)
    .update(payload)
    .digest("hex");

  return `${issuedAt}.${signature}`;
}

function verifyReceiptToken(orderId, token) {
  const parts = String(token || "").split(".");

  if (parts.length !== 2) {
    return false;
  }

  const issuedAtText = parts[0];
  const signature = parts[1];

  if (!/^\d+$/.test(issuedAtText)) {
    return false;
  }

  const issuedAt = Number(issuedAtText);

  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  /*
    Receipt links are valid for 1 year.
  */

  const maxAge =
    1000 *
    60 *
    60 *
    24 *
    365;

  const age = Date.now() - issuedAt;

  if (age < 0 || age > maxAge) {
    return false;
  }

  const payload = `${orderId}.${issuedAt}`;

  const expectedSignature = crypto
    .createHmac("sha256", ADMIN_PASSWORD)
    .update(payload)
    .digest("hex");

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    return false;
  }
}

function getBaseUrl(req) {
  const forwardedProto = String(
    req.headers["x-forwarded-proto"] || ""
  )
    .split(",")[0]
    .trim();

  const protocol =
    forwardedProto ||
    req.protocol ||
    "https";

  return `${protocol}://${req.get("host")}`;
}

function buildReceiptUrl(req, orderId) {
  const issuedAt = Date.now();

  const token = createReceiptToken(
    orderId,
    issuedAt
  );

  return (
    `${getBaseUrl(req)}/receipt/` +
    encodeURIComponent(orderId) +
    `?token=` +
    encodeURIComponent(token)
  );
}

function buildReceiptWhatsAppUrl(
  order,
  receiptUrl
) {
  const phone =
    normalizeWhatsAppPhone(
      order.customer_phone
    );

  if (!phone) {
    return null;
  }

  const message =
    `Hello ${order.customer_name}, your ` +
    `Avella Taste payment for order ` +
    `${order.order_number} has been confirmed. ` +
    `You can view and download your receipt here:\n\n` +
    receiptUrl;

  return (
    `https://wa.me/${phone}?text=` +
    encodeURIComponent(message)
  );
}

/*
  ADMIN AUTHENTICATION
*/

function requireAdmin(req, res, next) {
  const authorization =
    req.headers.authorization || "";

  if (!authorization.startsWith("Basic ")) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Avella Taste Admin"'
    );

    return res
      .status(401)
      .send("Admin login required.");
  }

  const encoded =
    authorization.slice(6);

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

    return res
      .status(401)
      .send("Invalid admin login.");
  }

  const separator =
    decoded.indexOf(":");

  if (separator === -1) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Avella Taste Admin"'
    );

    return res
      .status(401)
      .send("Invalid admin login.");
  }

  const username =
    decoded.slice(0, separator);

  const password =
    decoded.slice(separator + 1);

  if (
    username !== "admin" ||
    password !== ADMIN_PASSWORD
  ) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Avella Taste Admin"'
    );

    return res
      .status(401)
      .send("Incorrect admin login.");
  }

  next();
}

/*
  ADMIN PAGE
*/

app.get(
  "/admin.html",
  requireAdmin,
  (req, res) => {
    res.sendFile(
      __dirname + "/admin.html"
    );
  }
);

/*
  GET ALL ORDERS
*/

app.get(
  "/api/admin/orders",
  requireAdmin,
  async (req, res) => {
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
        console.error(
          "Admin orders error:",
          error
        );

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
            paymentProofUrl =
              signedData.signedUrl;
          }
        }

        let receiptUrl = null;
        let receiptWhatsAppUrl = null;

        if (
          order.payment_status === "paid"
        ) {
          receiptUrl =
            buildReceiptUrl(
              req,
              order.id
            );

          receiptWhatsAppUrl =
            buildReceiptWhatsAppUrl(
              order,
              receiptUrl
            );
        }

        safeOrders.push({
          ...order,

          payment_proof_signed_url:
            paymentProofUrl,

          receipt_url:
            receiptUrl,

          receipt_whatsapp_url:
            receiptWhatsAppUrl
        });
      }

      res.json({
        orders: safeOrders
      });

    } catch (error) {
      console.error(
        "Admin endpoint error:",
        error
      );

      res.status(500).json({
        error:
          "Server error while loading orders."
      });
    }
  }
);

/*
  CUSTOMER RECEIPT LOOKUP
  Customers enter their order number
  and phone number to generate their
  receipt after payment is confirmed.
*/

app.post(
  "/api/receipt-lookup",
  async (req, res) => {
    try {
      const {
        order_number,
        customer_phone
      } = req.body;

      if (
        !order_number ||
        !customer_phone
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Please enter your order number and phone number."
        });
      }

      const cleanOrderNumber =
        String(order_number)
          .trim();

      const suppliedPhone =
        normalizeWhatsAppPhone(
          customer_phone
        );

      if (!suppliedPhone) {
        return res.status(400).json({
          success: false,
          error:
            "Please enter a valid phone number."
        });
      }

      /*
        Find the order by order number.
      */

      const {
        data: order,
        error: orderError
      } = await supabase
        .from("orders")
        .select(`
          id,
          order_number,
          customer_phone,
          payment_status
        `)
        .eq(
          "order_number",
          cleanOrderNumber
        )
        .maybeSingle();

      /*
        Use the same response for
        an invalid order or phone number.
        This prevents exposing whether
        an order exists.
      */

      if (
        orderError ||
        !order
      ) {
        return res.status(404).json({
          success: false,
          error:
            "Order not found."
        });
      }

      const storedPhone =
        normalizeWhatsAppPhone(
          order.customer_phone
        );

      if (
        !storedPhone ||
        storedPhone !== suppliedPhone
      ) {
        return res.status(404).json({
          success: false,
          error:
            "Order not found."
        });
      }

      /*
        Payment proof has been submitted
        but the sister has not confirmed
        the payment yet.
      */

      if (
        order.payment_status ===
        "proof_submitted"
      ) {
        return res.json({
          success: false,
          payment_status:
            "proof_submitted",
          message:
            "Your payment proof has been received and is still being reviewed."
        });
      }

      /*
        Payment has not been confirmed.
      */

      if (
        order.payment_status !==
        "paid"
      ) {
        return res.json({
          success: false,
          payment_status:
            order.payment_status,
          message:
            "Your payment has not been confirmed yet."
        });
      }

      /*
        Payment is confirmed.
        Generate a secure receipt URL.
      */

      const receiptUrl =
        buildReceiptUrl(
          req,
          order.id
        );

      res.json({
        success: true,
        payment_status:
          "paid",
        receipt_url:
          receiptUrl
      });

    } catch (error) {

      console.error(
        "Receipt lookup error:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Could not check your receipt right now."
      });
    }
  }
);

/*
  CUSTOMER RECEIPT PAGE
*/

app.get(
  "/receipt/:orderId",
  async (req, res) => {
    try {
      const orderId =
        req.params.orderId;

      const token =
        req.query.token;

      /*
        Check the private receipt token.
      */

      if (
        !verifyReceiptToken(
          orderId,
          token
        )
      ) {
        return res.status(403).send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt Unavailable - Avella Taste</title>

  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff5f9;
      font-family: Arial, Helvetica, sans-serif;
      color: #4a3028;
      padding: 20px;
      box-sizing: border-box;
    }

    .box {
      max-width: 420px;
      width: 100%;
      background: white;
      border-radius: 20px;
      padding: 35px 25px;
      text-align: center;
      box-shadow: 0 8px 30px rgba(90,40,60,0.10);
    }

    h1 {
      color: #ed2d78;
      margin-top: 0;
    }

    p {
      color: #7a5b64;
      line-height: 1.6;
    }
  </style>
</head>

<body>

  <div class="box">

    <h1>Avella Taste</h1>

    <h2>Receipt Unavailable</h2>

    <p>
      This receipt link is invalid or has expired.
    </p>

    <p>
      Please contact Avella Taste for assistance.
    </p>

  </div>

</body>
</html>
        `);
      }

      /*
        Get order.
      */

      const {
        data: order,
        error: orderError
      } = await supabase
        .from("orders")
        .select(`
          *,
          order_items (*)
        `)
        .eq("id", orderId)
        .single();

      if (
        orderError ||
        !order
      ) {
        return res.status(404).send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt Not Found - Avella Taste</title>

  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff5f9;
      font-family: Arial, Helvetica, sans-serif;
      padding: 20px;
      box-sizing: border-box;
    }

    .box {
      max-width: 420px;
      width: 100%;
      background: white;
      border-radius: 20px;
      padding: 35px 25px;
      text-align: center;
      box-shadow: 0 8px 30px rgba(90,40,60,0.10);
    }

    h1 {
      color: #ed2d78;
    }

    p {
      color: #7a5b64;
    }
  </style>
</head>

<body>

  <div class="box">

    <h1>Avella Taste</h1>

    <h2>Receipt Not Found</h2>

    <p>
      We could not find this order.
    </p>

  </div>

</body>
</html>
        `);
      }

      /*
        Receipt is only available after payment confirmation.
      */

      if (
        order.payment_status !== "paid"
      ) {
        return res.status(403).send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Pending - Avella Taste</title>

  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff5f9;
      font-family: Arial, Helvetica, sans-serif;
      padding: 20px;
      box-sizing: border-box;
    }

    .box {
      max-width: 450px;
      width: 100%;
      background: white;
      border-radius: 20px;
      padding: 35px 25px;
      text-align: center;
      box-shadow: 0 8px 30px rgba(90,40,60,0.10);
    }

    h1 {
      color: #ed2d78;
    }

    p {
      color: #7a5b64;
      line-height: 1.6;
    }
  </style>
</head>

<body>

  <div class="box">

    <h1>Avella Taste</h1>

    <h2>Payment Still Pending</h2>

    <p>
      Your payment has not been confirmed yet.
    </p>

    <p>
      Once Avella Taste confirms your payment,
      your receipt will become available.
    </p>

  </div>

</body>
</html>
        `);
      }

      /*
        Prepare order items.
      */

      const orderItems =
        order.order_items || [];

      const itemRows =
        orderItems
          .map(item => {
            return `
              <tr>

                <td class="item">
                  ${escapeHtml(
                    item.product_name
                  )}
                </td>

                <td class="qty">
                  ${item.quantity}
                </td>

                <td class="price">
                  ${formatNaira(
                    item.unit_price_ngn
                  )}
                </td>

                <td class="price">
                  ${formatNaira(
                    item.line_total_ngn
                  )}
                </td>

              </tr>
            `;
          })
          .join("");

      const paidDate =
        order.paid_at
          ? new Date(
              order.paid_at
            ).toLocaleString(
              "en-NG",
              {
                dateStyle: "medium",
                timeStyle: "short"
              }
            )
          : "";

      const address =
        order.delivery_address
          ? escapeHtml(
              order.delivery_address
            )
          : "Not provided";

      /*
        Receipt page.
      */

      const html = `
<!DOCTYPE html>

<html>

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    Avella Taste Receipt -
    ${escapeHtml(
      order.order_number
    )}
  </title>

  <style>

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 20px;
      background: #fff5f9;
      font-family:
        Arial,
        Helvetica,
        sans-serif;
      color: #4a3028;
    }

    .page {
      position: relative;
      max-width: 760px;
      margin: 0 auto;
      background: white;
      border-radius: 22px;
      overflow: hidden;
      box-shadow:
        0 8px 35px
        rgba(90,40,60,0.12);
    }

    .watermark {
      position: fixed;
      left: 50%;
      top: 52%;
      transform:
        translate(-50%, -50%)
        rotate(-8deg);
      width: 420px;
      max-width: 80%;
      opacity: 0.035;
      pointer-events: none;
      z-index: 0;
    }

    .content {
      position: relative;
      z-index: 1;
    }

    .header {
      background: #fde5ef;
      padding: 28px 20px;
      text-align: center;
      border-bottom: 4px solid #ed2d78;
    }

    .logo {
      width: 115px;
      height: 115px;
      object-fit: contain;
      border-radius: 50%;
      display: block;
      margin: 0 auto 12px;
    }

    .business-name {
      font-size: 27px;
      font-weight: 700;
      color: #4a3028;
      margin: 0;
    }

    .motto {
      color: #ed2d78;
      font-size: 14px;
      font-style: italic;
      margin-top: 6px;
    }

    .body {
      padding: 30px 25px;
    }

    .confirmed {
      display: inline-block;
      background: #e9f8ed;
      color: #23833e;
      padding: 9px 18px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 18px;
    }

    .thank-you {
      text-align: center;
      margin-bottom: 28px;
    }

    .thank-you h1 {
      margin: 0 0 8px;
      font-size: 25px;
      color: #4a3028;
    }

    .thank-you p {
      margin: 0;
      color: #7a5b64;
      font-size: 14px;
    }

    .order-box {
      background: #fff7fa;
      border: 1px solid #f4dce7;
      border-radius: 14px;
      padding: 18px;
      margin-bottom: 22px;
      text-align: center;
    }

    .order-label {
      color: #7a5b64;
      font-size: 13px;
      margin-bottom: 7px;
    }

    .order-number {
      color: #ed2d78;
      font-size: 21px;
      font-weight: 700;
    }

    .details {
      margin-bottom: 25px;
    }

    .detail {
      margin: 0 0 8px;
      color: #4a3028;
      font-size: 14px;
    }

    .detail strong {
      color: #4a3028;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }

    th {
      background: #fde5ef;
      padding: 12px 9px;
      color: #4a3028;
      font-size: 12px;
      text-align: left;
    }

    th:nth-child(2) {
      text-align: center;
    }

    th:nth-child(3),
    th:nth-child(4) {
      text-align: right;
    }

    td {
      padding: 12px 9px;
      border-bottom: 1px solid #f4dce7;
      font-size: 13px;
    }

    td.qty {
      text-align: center;
    }

    td.price {
      text-align: right;
    }

    .total {
      margin-top: 22px;
      padding: 18px;
      background: #ed2d78;
      color: white;
      border-radius: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 15px;
    }

    .total-label {
      font-size: 16px;
      font-weight: 700;
    }

    .total-amount {
      font-size: 21px;
      font-weight: 700;
    }

    .payment-box {
      margin-top: 22px;
      background: #fff7fa;
      border: 1px solid #f4dce7;
      border-radius: 14px;
      padding: 18px;
    }

    .payment-box h3 {
      margin: 0 0 12px;
      color: #ed2d78;
      font-size: 16px;
    }

    .payment-box p {
      margin: 6px 0;
      font-size: 13px;
      color: #4a3028;
    }

    .footer {
      background: #fde5ef;
      padding: 20px;
      text-align: center;
      color: #7a5b64;
      font-size: 12px;
    }

    .buttons {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      padding: 25px 20px 0;
    }

    button {
      border: none;
      border-radius: 12px;
      padding: 13px 18px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }

    .print-button {
      background: #ed2d78;
      color: white;
    }

    .share-button {
      background: #fde5ef;
      color: #4a3028;
    }

    .tip {
      text-align: center;
      color: #7a5b64;
      font-size: 12px;
      margin: 12px 20px 0;
    }

    @media (max-width: 600px) {

      body {
        padding: 10px;
      }

      .body {
        padding: 24px 16px;
      }

      .logo {
        width: 95px;
        height: 95px;
      }

      .business-name {
        font-size: 23px;
      }

      .thank-you h1 {
        font-size: 21px;
      }

      table {
        font-size: 12px;
      }

      th,
      td {
        padding: 9px 5px;
      }

      .total {
        align-items: flex-start;
        flex-direction: column;
      }

      .total-amount {
        font-size: 20px;
      }
    }

    @media print {

      body {
        background: white;
        padding: 0;
      }

      .page {
        max-width: none;
        box-shadow: none;
        border-radius: 0;
      }

      .buttons,
      .tip {
        display: none;
      }

      .watermark {
        position: absolute;
      }

      .header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .total {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

    }

  </style>

</head>

<body>

  <div class="page">

    <img
      src="/avella-logo.jpg"
      class="watermark"
      alt=""
    >

    <div class="content">

      <div class="header">

        <img
          src="/avella-logo.jpg"
          class="logo"
          alt="Avella Taste"
        >

        <div class="business-name">
          Avella Taste
        </div>

        <div class="motto">
          Yummy Everyday
        </div>

      </div>

      <div class="buttons">

        <button
          class="print-button"
          onclick="window.print()"
        >
          Download / Save as PDF
        </button>

        <button
          class="share-button"
          onclick="shareReceipt()"
        >
          Share Receipt
        </button>

      </div>

      <div class="tip">
        On your phone, choose
        <strong>Save as PDF</strong>
        when the print screen appears.
      </div>

      <div class="body">

        <div class="thank-you">

          <div class="confirmed">
            PAYMENT CONFIRMED ✓
          </div>

          <h1>
            Thank you for your order!
          </h1>

          <p>
            Your payment has been confirmed successfully.
          </p>

        </div>

        <div class="order-box">

          <div class="order-label">
            Order Number
          </div>

          <div class="order-number">
            ${escapeHtml(
              order.order_number
            )}
          </div>

        </div>

        <div class="details">

          <p class="detail">
            <strong>Customer:</strong>
            ${escapeHtml(
              order.customer_name
            )}
          </p>

          <p class="detail">
            <strong>Email:</strong>
            ${escapeHtml(
              order.customer_email
            )}
          </p>

          <p class="detail">
            <strong>Phone:</strong>
            ${escapeHtml(
              order.customer_phone
            )}
          </p>

          <p class="detail">
            <strong>Delivery Address:</strong>
            ${address}
          </p>

          <p class="detail">
            <strong>Payment Method:</strong>
            Bank Transfer
          </p>

          <p class="detail">
            <strong>Payment Date:</strong>
            ${escapeHtml(
              paidDate
            )}
          </p>

        </div>

        <table>

          <thead>

            <tr>

              <th>
                Item
              </th>

              <th>
                Qty
              </th>

              <th>
                Price
              </th>

              <th>
                Total
              </th>

            </tr>

          </thead>

          <tbody>

            ${itemRows}

          </tbody>

        </table>

        <div class="total">

          <div class="total-label">
            TOTAL PAID
          </div>

          <div class="total-amount">
            ${formatNaira(
              order.total_amount_ngn
            )}
          </div>

        </div>

        <div class="payment-box">

          <h3>
            Payment Details
          </h3>

          <p>
            <strong>Bank:</strong>
            OPay (OPaycom)
          </p>

          <p>
            <strong>Account Name:</strong>
            AMARACHI NWANKWO
          </p>

          <p>
            <strong>Account Number:</strong>
            8157550592
          </p>

        </div>

      </div>

      <div class="footer">

        <strong>
          Avella Taste
        </strong>

        <br>

        Yummy Everyday 💗

        <br><br>

        This is an official payment receipt from Avella Taste.

      </div>

    </div>

  </div>

  <script>

    async function shareReceipt() {

      const receiptUrl =
        window.location.href;

      if (
        navigator.share
      ) {

        try {

          await navigator.share({
            title:
              "Avella Taste Receipt",
            text:
              "View my Avella Taste payment receipt.",
            url:
              receiptUrl
          });

        } catch (error) {
          // User cancelled sharing.
        }

        return;
      }

      try {

        await navigator.clipboard.writeText(
          receiptUrl
        );

        alert(
          "Receipt link copied!"
        );

      } catch (error) {

        alert(
          "Copy this receipt link from your browser address bar."
        );

      }

    }

  </script>

</body>

</html>
      `;

      res.setHeader(
        "Cache-Control",
        "private, no-store"
      );

      res.setHeader(
        "Content-Type",
        "text/html; charset=utf-8"
      );

      res.send(html);

    } catch (error) {

      console.error(
        "Receipt page error:",
        error
      );

      res.status(500).send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt Error - Avella Taste</title>

  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff5f9;
      font-family: Arial, Helvetica, sans-serif;
      padding: 20px;
    }

    .box {
      max-width: 430px;
      background: white;
      padding: 35px 25px;
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 8px 30px rgba(90,40,60,0.10);
    }

    h1 {
      color: #ed2d78;
    }

    p {
      color: #7a5b64;
      line-height: 1.6;
    }
  </style>
</head>

<body>

  <div class="box">

    <h1>
      Avella Taste
    </h1>

    <h2>
      Something went wrong
    </h2>

    <p>
      We could not load this receipt right now.
      Please try again later.
    </p>

  </div>

</body>
</html>
      `);
    }
  }
);

/*
  CONFIRM PAYMENT
*/

app.post(
  "/api/admin/orders/:orderId/confirm-payment",
  requireAdmin,
  async (req, res) => {

    try {

      const orderId =
        req.params.orderId;

      if (!orderId) {
        return res.status(400).json({
          error: "Missing order ID."
        });
      }

      /*
        Find the order.
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

      if (
        findError ||
        !existingOrder
      ) {

        console.error(
          "Order lookup error:",
          findError
        );

        return res.status(404).json({
          error: "Order not found."
        });
      }

      /*
        Do not confirm cancelled orders.
      */

      if (
        existingOrder.payment_status ===
        "cancelled"
      ) {

        return res.status(400).json({
          error:
            "This order has been cancelled."
        });
      }

      /*
        If already paid,
        simply generate a new receipt link.
      */

      if (
        existingOrder.payment_status ===
        "paid"
      ) {

        const receiptUrl =
          buildReceiptUrl(
            req,
            orderId
          );

        const receiptWhatsAppUrl =
          buildReceiptWhatsAppUrl(
            existingOrder,
            receiptUrl
          );

        return res.json({
          success: true,
          payment_confirmed: true,
          receipt_url:
            receiptUrl,
          receipt_whatsapp_url:
            receiptWhatsAppUrl,
          message:
            "Payment is already confirmed."
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
          paid_at:
            new Date().toISOString()
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
          error:
            "Could not confirm payment."
        });
      }

      /*
        Create private receipt link.
      */

      const receiptUrl =
        buildReceiptUrl(
          req,
          updatedOrder.id
        );

      const receiptWhatsAppUrl =
        buildReceiptWhatsAppUrl(
          updatedOrder,
          receiptUrl
        );

      res.json({
        success: true,

        payment_confirmed: true,

        receipt_url:
          receiptUrl,

        receipt_whatsapp_url:
          receiptWhatsAppUrl,

        message:
          "Payment confirmed and receipt is ready.",

        order:
          updatedOrder
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

        cartItems =
          JSON.parse(items);

      } catch (error) {

        return res.status(400).json({
          error:
            "Invalid cart information."
        });
      }

      if (
        !Array.isArray(cartItems) ||
        cartItems.length === 0
      ) {

        return res.status(400).json({
          error:
            "Your cart is empty."
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
          error:
            "Could not verify products."
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
          findCatalogProduct(
            itemName
          );

        if (!catalogProduct) {

          return res.status(400).json({
            error:
              `Product not found: ${itemName}`
          });
        }

        const normalizedItemName =
          normalizeName(
            itemName
          );

        const databaseProduct =
          databaseProducts.find(
            product =>
              normalizeName(
                product.name
              ) === normalizedItemName
          ) || null;

        const unitPrice =
          catalogProduct.price;

        const lineTotal =
          unitPrice * quantity;

        totalAmount +=
          lineTotal;

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
          100 +
          Math.random() * 900
        );

      /*
        Upload payment receipt.
      */

      const safeEmail =
        String(customer_email)
          .toLowerCase()
          .replace(
            /[^a-z0-9]/g,
            "-"
          )
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
            delivery_address ||
            null,

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
          order_id:
            order.id
        }));

      const {
        error: itemsError
      } = await supabase
        .from("order_items")
        .insert(
          itemsToInsert
        );

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

app.use(
  (error, req, res, next) => {

    console.error(
      "Server error:",
      error
    );

    if (
      error instanceof
      multer.MulterError
    ) {

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
        error:
          error.message
      });
    }

    res.status(500).json({
      error:
        error.message ||
        "Server error."
    });
  }
);

/*
  SERVE WEBSITE FILES
*/

app.use(
  express.static(__dirname)
);

/*
  START SERVER
*/

app.listen(
  PORT,
  () => {
    console.log(
      `Avella Taste server running on port ${PORT}`
    );
  }
);
