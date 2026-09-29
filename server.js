const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Serve the Avella Taste website
app.use(express.static(__dirname));

// Homepage
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
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

    const { data: products, error: productsError } =
      await supabase
        .from("products")
        .select("*")
        .eq("active", true);

    if (productsError) {
      throw productsError;
    }

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
        quantity: quantity,
        unit_price_ngn: product.price_ngn,
        line_total_ngn: lineTotal
      });
    }

    const orderNumber =
      "AT-" + Date.now().toString();

    const { data: order, error: orderError } =
      await supabase
        .from("orders")
        .insert({
          order_number: orderNumber,
          customer_name: customer_name,
          customer_email: customer_email,
          customer_phone: customer_phone,
          delivery_address: delivery_address,
          total_amount_ngn: totalAmount,
          payment_status: "proof_submitted",
          payment_reference: payment_reference
        })
        .select()
        .single();

    if (orderError) {
      throw orderError;
    }

    const itemsToInsert = orderItems.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price_ngn: item.unit_price_ngn,
      line_total_ngn: item.line_total_ngn
    }));

    const { error: itemsError } =
      await supabase
        .from("order_items")
        .insert(itemsToInsert);

    if (itemsError) {
      throw itemsError;
    }

    return res.status(201).json({
      success: true,
      order_number: order.order_number,
      order_id: order.id,
      total_amount_ngn: totalAmount,
      payment_status: "proof_submitted"
    });

  } catch (error) {
    console.error(
      "Order creation error:",
      error
    );

    return res.status(500).json({
      error: "Unable to create order."
    });
  }
});

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Avella Taste server running on port ${PORT}`
  );
});
