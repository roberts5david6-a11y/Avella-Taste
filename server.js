const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const app = express();

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
      cb(new Error("Only JPG, PNG, WEBP or PDF files are allowed."));
    }
  }
});

app.use(express.json());

/*
  Avella Taste product catalogue.

  These prices are controlled by the server,
  so customers cannot change product prices
  from their browser.
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

/*
  Admin authentication.

  The browser will show its normal username/password
  box when the admin page is opened.

  Username:
  admin

  Password:
  the ADMIN_PASSWORD stored in Render.
*/
function requireAdmin(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Avella Taste Admin"');
    return res.status(401).send("Admin login required.");
  }

  const encoded = authorization.slice(6);

  let decoded;

  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch (error) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Avella Taste Admin"');
    return res.status(401).send("Invalid admin login.");
  }

  const separator = decoded.indexOf(":");

  if (separator === -1) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Avella Taste Admin"');
    return res.status(401).send("Invalid admin login.");
  }

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  if (username !== "admin" || password !== ADMIN_PASSWORD) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Avella Taste Admin"');
    return res.status(401).send("Incorrect admin login.");
  }

  next();
}

/*
  Protect the admin page itself.
*/
app.get("/admin.html", requireAdmin, (req, res) => {
  res.sendFile(__dirname + "/admin.html");
});

/*
  Admin orders API.
*/
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
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
        const { data: signedData, error: signedError } =
          await supabase.storage
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
  Customer order submission.
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
          error: "Missing required order information."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "Please upload your payment receipt."
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

      if (!Array.isArray(cartItems) || cartItems.length === 0) {
        return res.status(400).json({
          error: "Your cart is empty."
        });
      }

      /*
        Get products from Supabase so we can use their IDs
        when available.
      */
      const {
        data: databaseProducts,
        error: productsError
      } = await supabase
        .from("products")
        .select("*");

      if (productsError) {
        console.error("Products lookup error:", productsError);

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

        const quantity = Number(item.quantity);

        if (!itemName || !Number.isInteger(quantity) || quantity <= 0) {
          return res.status(400).json({
            error: "Invalid product or quantity."
          });
        }

        const catalogProduct = findCatalogProduct(itemName);

        if (!catalogProduct) {
          return res.status(400).json({
            error: `Product not found: ${itemName}`
          });
        }

        const normalizedItemName = normalizeName(itemName);

        const databaseProduct =
          databaseProducts.find(
            product =>
              normalizeName(product.name) === normalizedItemName
          ) || null;

        const unitPrice = catalogProduct.price;
        const lineTotal = unitPrice * quantity;

        totalAmount += lineTotal;

        orderItems.push({
          product_id: databaseProduct
            ? databaseProduct.id
            : null,

          product_name: catalogProduct.name,

          quantity,

          unit_price_ngn: unitPrice,

          line_total_ngn: lineTotal
        });
      }

      /*
        Create a simple unique order number.
      */
      const orderNumber =
        "AT-" +
        Date.now().toString().slice(-8) +
        "-" +
        Math.floor(100 + Math.random() * 900);

      /*
        Upload payment receipt.
      */
      const safeEmail = String(customer_email)
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
            contentType: req.file.mimetype,
            upsert: false
          }
        );

      if (uploadError) {
        console.error("Receipt upload error:", uploadError);

        return res.status(500).json({
          error: "Could not upload payment receipt."
        });
      }

      /*
        Create the order.
      */
      const {
        data: order,
        error: orderError
      } = await supabase
        .from("orders")
        .insert({
          order_number: orderNumber,
          customer_name,
          customer_email,
          customer_phone,
          delivery_address:
            delivery_address || null,
          total_amount_ngn: totalAmount,
          payment_status: "proof_submitted",
          payment_proof_url: filePath
        })
        .select()
        .single();

      if (orderError) {
        console.error("Order insert error:", orderError);

        return res.status(500).json({
          error: "Could not create order."
        });
      }

      /*
        Create order items.
      */
      const itemsToInsert = orderItems.map(item => ({
        ...item,
        order_id: order.id
      }));

      const {
        error: itemsError
      } = await supabase
        .from("order_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.error("Order items error:", itemsError);

        return res.status(500).json({
          error: "Could not save order items."
        });
      }

      res.json({
        success: true,
        order_number: orderNumber,
        order_id: order.id,
        total_amount_ngn: totalAmount,
        payment_status: "proof_submitted"
      });

    } catch (error) {
      console.error("Order submission error:", error);

      res.status(500).json({
        error: error.message || "Something went wrong."
      });
    }
  }
);

/*
  General error handler.
*/
app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "Payment receipt must be 5MB or smaller."
      });
    }

    return res.status(400).json({
      error: error.message
    });
  }

  res.status(500).json({
    error: error.message || "Server error."
  });
});

/*
  Serve the rest of the website.
*/
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Avella Taste server running on port ${PORT}`);
});
