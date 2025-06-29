require("dotenv").config();
const prisma = require("../prisma/client");

const createOrder = async (req, res) => {
  const {
    firstName,
    lastName,
    address,
    mobileNumber,
    anotherMobile,
    anotherAddress,
    customerEmail,
    items,
    couponCode,
  } = req.body;

  try {
    if (
      !firstName ||
      !lastName ||
      !address ||
      !mobileNumber ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "Missing required fields or items." });
    }

    // Get products + include categoryId + tags
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
      include: {
        tags: true,
      },
    });

    if (products.length !== items.length) {
      return res
        .status(400)
        .json({ error: "One or more products are invalid or inactive." });
    }

    // Stock validation
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (item.quantity > product.stock) {
        return res.status(400).json({
          error: `Not enough stock for product: ${product.name}`,
        });
      }
    }

    const now = new Date();

    // Fetch applicable discounts (product, tag, category)
    const discounts = await prisma.discount.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { productId: { in: productIds } },
          { tagId: { not: null } },
          { categoryId: { not: null } },
        ],
      },
    });

    // Handle coupon
    let coupon = null;
    let couponSnapshot = null; // snapshot object to store on order
    let couponDiscountAmount = 0;

    if (couponCode) {
      coupon = await prisma.coupon.findFirst({
        where: {
          code: couponCode,
          isActive: true,
          startDate: { lte: now },
          endDate: { gte: now },
        },
      });

      if (!coupon) {
        return res.status(400).json({ error: "Invalid or expired coupon." });
      }

      couponSnapshot = {
        code: coupon.code,
        percentage: coupon.percentage,
        description: coupon.description,
      };
    }

    // Prepare order items & calculate totalAmount
    let totalAmount = 0;

    const orderItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const basePrice = Number(product.price);

      // Find best applicable discount
      const productDiscount = discounts.find((d) => d.productId === product.id);
      const tagDiscount = discounts.find(
        (d) => d.tagId && product.tags.some((tag) => tag.id === d.tagId)
      );
      const categoryDiscount = discounts.find(
        (d) => d.categoryId === product.categoryId
      );

      // Choose discount priority: product > tag > category
      let finalDiscount = productDiscount || tagDiscount || categoryDiscount;
      let price = basePrice;
      let discountApplied = 0;
      let discountId = null;

      if (finalDiscount) {
        discountApplied = Number(finalDiscount.percentage);
        discountId = finalDiscount.id;
        price = basePrice * (1 - discountApplied / 100);
      }

      const lineTotal = price * item.quantity;
      totalAmount += lineTotal;

      return {
        quantity: item.quantity,
        priceAtPurchase: price,
        productName: product.name,
        productImageUrl: product.imageUrl,
        productCategory: product.categoryId?.toString() || null,
        productId: product.id,
        discountApplied, // snapshot of discount percentage on this item
        discountId, // snapshot of discount id applied
      };
    });

    // Apply coupon discount (after product-level discounts)
    if (
      coupon &&
      (!coupon.minOrderAmount || totalAmount >= Number(coupon.minOrderAmount))
    ) {
      couponDiscountAmount = (Number(coupon.percentage) / 100) * totalAmount;
      totalAmount -= couponDiscountAmount;
    }

    // Transaction: create order & update stock
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          firstName,
          lastName,
          address,
          mobileNumber,
          anotherMobile,
          anotherAddress,
          customerEmail,
          totalAmount,
          currency: "EGP",
          status: "pending",
          couponId: coupon?.id || null,
          // Store coupon snapshot fields in order
          couponCode: couponSnapshot?.code || null,
          couponPercentage: couponSnapshot?.percentage || null,
          couponDescription: couponSnapshot?.description || null,
          items: {
            create: orderItems,
          },
        },
        include: {
          items: true,
          coupon: true,
        },
      });

      // Decrement stock
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }

      return createdOrder;
    });

    return res.status(201).json({ order });
  } catch (error) {
    console.error("Create Order Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getOrders = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "operator") {
      return res
        .status(403)
        .json({ message: "Access denied. Admins and Operators only." });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, startDate, endDate } = req.query;

    const whereClause = {};
    if (status) whereClause.status = status;

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.createdAt.lte = end;
      }
    }

    const [orders, totalCount] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          items: true, // No product relation
        },
      }),
      prisma.order.count({ where: whereClause }),
    ]);

    const formattedOrders = orders.map((order) => {
      return {
        orderId: order.id,
        status: order.status,
        createdAt: order.createdAt,
        totalPrice: order.totalAmount,
        customerInfo: {
          firstName: order.firstName,
          lastName: order.lastName,
          email: order.customerEmail,
          mobileNumber: order.mobileNumber,
          anotherMobile: order.anotherMobile || null,
          address: order.address,
          anotherAddress: order.anotherAddress || null,
        },
        items: order.items.map((item) => ({
          quantity: item.quantity,
          priceAtPurchase: item.priceAtPurchase,
          product: {
            productId: item.productId,
            name: item.productName,
            imageUrl: item.productImageUrl,
            categoryId: item.productCategory,
          },
        })),
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      currentPage: page,
      totalPages,
      totalCount,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "operator") {
      return res
        .status(403)
        .json({ message: "Access denied. Admins and Operators only." });
    }

    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ message: "Invalid order ID." });
    }

    // Fetch order WITHOUT coupon relation but include items
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const formattedOrder = {
      orderId: order.id,
      firstName: order.firstName,
      lastName: order.lastName,
      email: order.customerEmail,
      phone: order.mobileNumber,
      anotherMobile: order.anotherMobile,
      address: order.address,
      anotherAddress: order.anotherAddress,
      status: order.status,
      createdAt: order.createdAt,
      totalPrice: order.totalAmount,

      // Use coupon snapshot fields, NOT the coupon relation
      coupon: order.couponCode
        ? {
            code: order.couponCode,
            percentage: order.couponPercentage,
            description: order.couponDescription,
          }
        : null,

      items: order.items.map((item) => ({
        quantity: item.quantity,
        priceAtPurchase: item.priceAtPurchase,
        discountApplied: item.discountApplied || 0, // snapshot discount percentage
        discountId: item.discountId || null, // snapshot discount id (optional)

        product: {
          productId: item.productId,
          name: item.productName,
          imageUrl: item.productImageUrl,
          categoryId: item.productCategory,
        },
      })),
    };

    res.status(200).json(formattedOrder);
  } catch (error) {
    console.error("Error fetching order by ID:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateOrderStatus = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;

  // List of allowed statuses
  const allowedStatuses = [
    "pending",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid order status." });
  }

  try {
    if (req.user.role !== "admin" && req.user.role !== "operator") {
      return res
        .status(403)
        .json({ message: "Access denied. Admins and Operators only." });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: { status },
    });

    res.status(200).json({
      message: "Order status updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

//? COUPONS

const addCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      percentage,
      startDate,
      endDate,
      minOrderAmount,
    } = req.body;

    // Check if code already exists
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: "Coupon code already exists." });
    }

    const newCoupon = await prisma.coupon.create({
      data: {
        code,
        description,
        percentage,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : undefined,
      },
    });

    res.status(201).json(newCoupon);
  } catch (error) {
    console.error("Failed to create coupon:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllCoupons = async (req, res) => {
  const coupons = await prisma.coupon.findMany({
    orderBy: { id: "desc" },
  });

  res.status(200).json(coupons);
};

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ message: "Invalid coupon ID" });
    }

    await prisma.coupon.delete({
      where: { id: Number(id) },
    });

    res.status(200).json({ message: "Coupon deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting coupon", error });
  }
};

const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const updatedCoupon = await prisma.coupon.update({
      where: { id: Number(id) },
      data: { isActive: Boolean(isActive) },
    });

    res.status(200).json(updatedCoupon);
  } catch (error) {
    res.status(500).json({ message: "Error updating coupon status", error });
  }
};

const applyCoupon = async (req, res) => {
  const { items, couponCode } = req.body;

  try {
    // Validate input
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided." });
    }

    const now = new Date();

    // Get product IDs
    const productIds = items.map((item) => item.productId);

    // Fetch product data + tags
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
      include: {
        tags: true,
      },
    });

    if (products.length !== items.length) {
      return res
        .status(400)
        .json({ error: "Some products are invalid or inactive." });
    }

    // Fetch active discounts
    const discounts = await prisma.discount.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { productId: { in: productIds } },
          { tagId: { not: null } },
          { categoryId: { not: null } },
        ],
      },
    });

    // Validate coupon
    let coupon = null;
    if (couponCode) {
      coupon = await prisma.coupon.findFirst({
        where: {
          code: couponCode,
          isActive: true,
          startDate: { lte: now },
          endDate: { gte: now },
        },
      });

      if (!coupon) {
        return res.status(400).json({ error: "Invalid or expired coupon." });
      }
    }

    // Process items and apply discounts
    let subtotal = 0;

    const discountedItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const basePrice = Number(product.price);

      // Find best applicable discount
      const productDiscount = discounts.find((d) => d.productId === product.id);
      const tagDiscount = discounts.find(
        (d) => d.tagId && product.tags.some((tag) => tag.id === d.tagId)
      );
      const categoryDiscount = discounts.find(
        (d) => d.categoryId === product.categoryId
      );

      const finalDiscount = productDiscount || tagDiscount || categoryDiscount;

      let discountPercentage = finalDiscount
        ? Number(finalDiscount.percentage)
        : 0;
      let priceAfterDiscount = basePrice * (1 - discountPercentage / 100);
      let lineTotal = priceAfterDiscount * item.quantity;

      subtotal += lineTotal;

      return {
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        originalPrice: basePrice,
        discountApplied: discountPercentage,
        priceAfterDiscount,
        lineTotal,
        imageUrl: product.imageUrl,
      };
    });

    // Apply coupon (after product discounts)
    let couponDiscountAmount = 0;
    let totalAfterDiscount = subtotal;

    if (
      coupon &&
      (!coupon.minOrderAmount || subtotal >= Number(coupon.minOrderAmount))
    ) {
      couponDiscountAmount = (Number(coupon.percentage) / 100) * subtotal;
      totalAfterDiscount = subtotal - couponDiscountAmount;
    }

    return res.json({
      discountedItems,
      subtotal,
      couponCode: coupon?.code || null,
      couponDiscountAmount,
      totalAfterDiscount,
    });
  } catch (error) {
    console.error("Apply Coupon Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//? DISCOUNTS

const addDiscount = async (req, res) => {
  try {
    const { percentage, startDate, endDate, productId, categoryId, tagId } =
      req.body;

    if (!percentage || !startDate || !endDate) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const newDiscount = await prisma.discount.create({
      data: {
        percentage: parseFloat(percentage),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: true,
        product: productId ? { connect: { id: Number(productId) } } : undefined,
        category: categoryId
          ? { connect: { id: Number(categoryId) } }
          : undefined,
        tag: tagId ? { connect: { id: Number(tagId) } } : undefined,
      },
    });

    res.status(201).json(newDiscount);
  } catch (error) {
    console.error("Failed to add discount:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllDiscounts = async (req, res) => {
  try {
    const discounts = await prisma.discount.findMany({
      orderBy: { id: "desc" },
      include: {
        product: true,
        category: true,
        tag: true,
      },
    });

    const shaped = discounts.map((d) => {
      let type = null;
      let referenceId = null;

      if (d.product) {
        type = "product";
        referenceId = d.product.id;
      } else if (d.category) {
        type = "category";
        referenceId = d.category.id;
      } else if (d.tag) {
        type = "tag";
        referenceId = d.tag.id;
      }

      return {
        ...d,
        type,
        referenceId,
      };
    });

    res.status(200).json(shaped);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch discounts", error });
  }
};

const deleteDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Deleting discount ID:", id);

    const deleted = await prisma.discount.delete({
      where: { id: Number(id) },
    });

    console.log("Deleted:", deleted);

    res.status(200).json({ message: "Discount deleted successfully" });
  } catch (error) {
    console.error("❌ Failed to delete discount:", error);
    res.status(500).json({ message: "Error deleting discount", error });
  }
};

const toggleDiscountStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const updated = await prisma.discount.update({
      where: { id: Number(id) },
      data: { isActive: Boolean(isActive) },
    });

    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to update status", error });
  }
};

module.exports = {
  createOrder,
  applyCoupon,
  getOrders,
  updateOrderStatus,
  getOrderById,
  addCoupon,
  getAllCoupons,
  deleteCoupon,
  toggleCouponStatus,
  addDiscount,
  getAllDiscounts,
  deleteDiscount,
  toggleDiscountStatus,
};
