const express = require("express");
const path = require("path");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());


// ============================================
// SUPABASE
// ============================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);


// ============================================
// AVELLA TASTE PRODUCT CATALOG
// ============================================

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


// ============================================
// RECEIPT UPLOAD
// ============================================

const upload = multer({

  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, callback) => {

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf"
    ];

    if (!allowedTypes.includes(file.mimetype)) {

      return callback(
        new Error(
          "Only JPG, PNG, WEBP images or PDF files are allowed."
        )
      );

    }

    callback(null, true);

  }

});


// ============================================
// SERVE WEBSITE
// ============================================

app.use(express.static(__dirname));


// ============================================
// HOMEPAGE
// ============================================

app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "index.html")
  );

});


// ============================================
// NORMALIZE PRODUCT NAME
// ============================================

function normalizeProductName(value) {

  return String(value || "")

    .toLowerCase()

    .trim()

    .replace(/[–—]/g, "-")

    .replace(/\s+/g, " ")

    .replace(/\bpieces\b/g, "pcs")

    .replace(/\bpiece\b/g, "pc")

    .replace(/\bmilliliters\b/g, "ml")

    .replace(/\bmillilitres\b/g, "ml")

    .replace(/\blitres\b/g, "l")

    .replace(/\blitres\b/g, "l")

    .replace(/\blitre\b/g, "l")

    .replace(/\bliter\b/g, "l")

    .replace(/\s*-\s*/g, "-");

}


// ============================================
// FIND CATALOG PRODUCT
// ============================================

function findCatalogProduct(cartName) {

  const normalizedCartName =
    normalizeProductName(cartName);


  for (
    const key of Object.keys(PRODUCT_CATALOG)
  ) {

    if (
      normalizeProductName(key) ===
      normalizedCartName
    ) {

      return PRODUCT_CATALOG[key];

    }

  }


  return null;

}


// ============================================
// FIND DATABASE PRODUCT
// ============================================

function findDatabaseProduct(
  products,
  catalogProduct
) {

  if (!Array.isArray(products)) {

    return null;

  }


  const targetName =
    normalizeProductName(
      catalogProduct.name
    );


  return (
    products.find(product => {

      const databaseFullName =
        normalizeProductName(

          `${product.name || ""} ${
            product.size
              ? "- " + product.size
              : ""
          }`

        );


      const databaseName =
        normalizeProductName(
          product.name
        );


      return (
        databaseFullName ===
        targetName ||

        databaseName ===
        targetName
      );

    }) || null
  );

}


// ============================================
// CREATE CUSTOMER ORDER
// ============================================

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


      // ----------------------------------------
      // REQUIRED INFORMATION
      // ----------------------------------------

      if (
        !customer_name ||
        !customer_email ||
        !customer_phone ||
        !delivery_address ||
        !items
      ) {

        return res.status(400).json({

          error:
            "Please provide all required order information."

        });

      }


      if (!req.file) {

        return res.status(400).json({

          error:
            "Please upload your payment receipt."

        });

      }


      // ----------------------------------------
      // READ CART
      // ----------------------------------------

      let cartItems;

      try {

        cartItems =
          JSON.parse(items);

      } catch (error) {

        return res.status(400).json({

          error:
            "Invalid order items."

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


      // ----------------------------------------
      // GET PRODUCTS FROM SUPABASE
      // ----------------------------------------

      const {
        data: products,
        error: productsError
      } = await supabase

        .from("products")

        .select("*");


      if (productsError) {

        throw productsError;

      }


      // ----------------------------------------
      // CALCULATE ORDER
      // ----------------------------------------

      let totalAmount = 0;

      const orderItems = [];


      for (const item of cartItems) {

        const cartName =
          String(
            item.name ||
            item.product_name ||
            ""
          ).trim();


        // --------------------------------------
        // FIND PRODUCT IN OUR FIXED CATALOG
        // --------------------------------------

        const catalogProduct =
          findCatalogProduct(
            cartName
          );


        if (!catalogProduct) {

          return res.status(400).json({

            error:
              `Product not found: ${cartName}`

          });

        }


        // --------------------------------------
        // CHECK QUANTITY
        // --------------------------------------

        const quantity =
          Number(item.quantity);


        if (
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {

          return res.status(400).json({

            error:
              "Invalid product quantity."

          });

        }


        // --------------------------------------
        // TRY TO FIND DATABASE PRODUCT
        // --------------------------------------

        const databaseProduct =
          findDatabaseProduct(
            products,
            catalogProduct
          );


        // --------------------------------------
        // ALWAYS USE OUR SERVER PRICE
        // --------------------------------------

        const unitPrice =
          catalogProduct.price;


        const lineTotal =
          unitPrice * quantity;


        totalAmount +=
          lineTotal;


        // --------------------------------------
        // SAVE ORDER ITEM
        // --------------------------------------

        orderItems.push({

          product_id:
            databaseProduct
              ? databaseProduct.id
              : null,

          product_name:
            catalogProduct.name,

          quantity:
            quantity,

          unit_price_ngn:
            unitPrice,

          line_total_ngn:
            lineTotal

        });

      }


      // ========================================
      // UPLOAD PAYMENT RECEIPT
      // ========================================

      const fileExtension =
        req.file.originalname
          .split(".")
          .pop()
          .toLowerCase();


      const safeEmail =
        customer_email
          .toLowerCase()
          .replace(
            /[^a-z0-9]/g,
            "-"
          );


      const fileName =
        `${Date.now()}-${safeEmail}.${fileExtension}`;


      const filePath =
        `receipts/${fileName}`;


      const {
        error: uploadError
      } = await supabase

        .storage

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

        throw uploadError;

      }


      // ========================================
      // CREATE ORDER NUMBER
      // ========================================

      const orderNumber =
        "AT-" +
        Date.now().toString();


      // ========================================
      // CREATE ORDER
      // ========================================

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
            delivery_address,

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

        throw orderError;

      }


      // ========================================
      // CREATE ORDER ITEMS
      // ========================================

      const itemsToInsert =
        orderItems.map(item => ({

          order_id:
            order.id,

          product_id:
            item.product_id,

          product_name:
            item.product_name,

          quantity:
            item.quantity,

          unit_price_ngn:
            item.unit_price_ngn,

          line_total_ngn:
            item.line_total_ngn

        }));


      const {
        error: itemsError
      } = await supabase

        .from("order_items")

        .insert(
          itemsToInsert
        );


      if (itemsError) {

        throw itemsError;

      }


      // ========================================
      // SUCCESS
      // ========================================

      return res.status(201).json({

        success:
          true,

        order_number:
          order.order_number,

        order_id:
          order.id,

        total_amount_ngn:
          totalAmount,

        payment_status:
          "proof_submitted"

      });

    } catch (error) {

      console.error(
        "Order creation error:",
        error
      );


      return res.status(500).json({

        error:
          error.message ||
          "Unable to create order."

      });

    }

  }
);


// ============================================
// ERROR HANDLER
// ============================================

app.use(
  (error, req, res, next) => {

    console.error(
      "Server error:",
      error
    );


    if (
      error instanceof multer.MulterError
    ) {

      if (
        error.code === "LIMIT_FILE_SIZE"
      ) {

        return res.status(400).json({

          error:
            "Receipt file is too large. Maximum size is 5MB."

        });

      }

    }


    return res.status(400).json({

      error:
        error.message ||
        "Unable to process your request."

    });

  }
);


// ============================================
// START SERVER
// ============================================

const PORT =
  process.env.PORT || 3000;


app.listen(
  PORT,
  () => {

    console.log(
      `Avella Taste server running on port ${PORT}`
    );

  }
);
