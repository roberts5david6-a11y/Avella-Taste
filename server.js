const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Test route
app.get("/", (req, res) => {
  res.send("Avella Taste backend is running.");
});

// Create customer order
app.post("/api/orders", async (req, res) => {
  try {
    const {
      customer_name,
      customer_email,
      customer_phone,
      delivery_address,
      payment_reference,
      items
    } = req.body;

    // Basic validation
    if (
      !customer_name ||
      !customer_email ||
      !customer_phone ||
      !delivery_address ||
      !payment_reference ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        error: "Please provide all required order information."
      });
    }

    // Get active products from Supabase
    const { data: products, error: productsError } =
      await supabase
        .from("products")
        .select("*")
        .eq("active", true);

    if (productsError) {
      throw productsError;
    }

    // Verify products and calculate the real total
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = products.find(
        p => p.name === item.product_name
      );

      if (!product) {
        return res.status(400).json({
          error: `Product not found: ${item.product_name}`
        });
      }

      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          error: "Invalid product quantity."
        });
      }

      const lineTotal =
        product.price_ngn * quantity;

      totalAmount += lineTotal;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price_ngn: product.price_ngn,
        line_total_ngn: lineTotal
      });
    }

    // Generate order number
    const orderNumber =
      "AT-" +
      Date.now().toString();

    //
