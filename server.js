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
// NORMALIZE TEXT
// ============================================

function normalizeText(value) {

  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\bpieces\b/g, "pc")
    .replace(/\bpiece\b/g, "pc")
    .replace(/\bpcs\b/g, "pc")
    .replace(/\bmilliliters\b/g, "ml")
    .replace(/\bmillilitres\b/g, "ml")
    .replace(/\bliters\b/g, "l")
    .replace(/\blitres\b/g, "l")
    .replace(/\blitre\b/g, "l")
    .replace(/\bliter\b/g, "l")
    .replace(/\s*-\s*/g, "-");

}


// ============================================
// REMOVE EXTRA DESCRIPTION
// ============================================

function normalizeProductName(value) {

  return normalizeText(value)

    // Remove things such as:
    // (Plain)
    // (Sweetened)
    // (Unsweetened)

    .replace(/\([^)]*\)/g, "")

    .replace(/\s+/g, " ")

    .trim();

}


// ============================================
// NORMALIZE SIZE
// ============================================

function normalizeSize(value) {

  return normalizeText(value)

    .replace(/\s+/g, "")

    .replace(/^(\d+)pieces?$/, "$1pc")

    .replace(/^(\d+)pcs$/, "$1pc");

}


// ============================================
// FIND PRODUCT
// ============================================

function findMatchingProduct(products, cartItem) {

  const cartName =
    String(
      cartItem.name ||
      cartItem.product_name ||
      ""
    ).trim();


  const cartFull =
    normalizeText(cartName);


  // ------------------------------------------
  // SPLIT CART NAME
  //
  // Example:
  //
  // Milky Yogurt (Plain) - 35cl
  //
  // becomes:
  //
  // name = Milky Yogurt (Plain)
  // size = 35cl
  // ------------------------------------------

  const parts =
    cartFull.split("-");


  let cartNamePart =
    parts[0] || cartFull;


  let cartSizePart =
    parts.slice(1).join("-");


  cartNamePart =
    normalizeProductName(
      cartNamePart
    );


  cartSizePart =
    normalizeSize(
      cartSizePart
    );


  // ------------------------------------------
  // TRY EVERY ACTIVE PRODUCT
  // ------------------------------------------

  for (const product of products) {

    const databaseName =
      normalizeProductName(
        product.name
      );


    const databaseSize =
      normalizeSize(
        product.size
      );


    const databaseFull =
      normalizeText(
        `${product.name} ${
          product.size
            ? "- " + product.size
            : ""
        }`
      );


    // ----------------------------------------
    // MATCH 1
    // EXACT FULL NAME
    // ----------------------------------------

    if (
      databaseFull === cartFull
    ) {

      return product;

    }


    // ----------------------------------------
    // MATCH 2
    // NAME + SIZE
    // ----------------------------------------

    if (
      databaseName === cartNamePart &&
      databaseSize === cartSizePart
    ) {

      return product;

    }


    // ----------------------------------------
    // MATCH 3
    // CART NAME CONTAINS DATABASE NAME
    // WITH SAME SIZE
    // ----------------------------------------

    if (
      cartNamePart.includes(databaseName) &&
      databaseSize === cartSizePart
    ) {

      return product;

    }


    // ----------------------------------------
    // MATCH 4
    // DATABASE NAME CONTAINS CART NAME
    // WITH SAME SIZE
    // ----------------------------------------

    if (
      databaseName.includes(cartNamePart) &&
      databaseSize === cartSizePart
    ) {

      return product;

    }

  }


  return null;

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
      // CHECK REQUIRED INFORMATION
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
      // READ CART ITEMS
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
      // GET ACTIVE PRODUCTS
      // ----------------------------------------

      const {
        data: products,
        error: productsError
      } = await supabase

        .from("products")

        .select("*")

        .eq("active", true);


      if (productsError) {

        throw productsError;

      }


      // ----------------------------------------
      // CALCULATE ORDER
      // ----------------------------------------

      let totalAmount = 0;

      const orderItems = [];


      for (const item of cartItems) {

        const product =
          findMatchingProduct(
            products,
            item
          );


        if (!product) {

          return res.status(400).json({

            error:
              `Product not found: ${
                item.name ||
                item.product_name
              }`

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
        // CALCULATE LINE TOTAL
        // --------------------------------------

        const lineTotal =
          product.price_ngn *
          quantity;


        totalAmount +=
          lineTotal;


        // --------------------------------------
        // SAVE ORDER ITEM
        // --------------------------------------

        orderItems.push({

          product_id:
            product.id,

          product_name:
            product.name,

          quantity:
            quantity,

          unit_price_ngn:
            product.price_ngn,

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
        orderItems.map(
          item => ({

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

          })
        );


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
        error.code ===
        "LIMIT_FILE_SIZE"
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
