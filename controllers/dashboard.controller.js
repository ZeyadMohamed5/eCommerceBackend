require("dotenv").config();
const prisma = require("../prisma/client");
const getDateFilter = require("../utils/dateFilter");

const getDashboardSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    const orders = await prisma.order.findMany({
      where: {
        status: {
          in: ["paid", "processing", "shipped", "delivered"],
        },
        ...dateFilter,
      },
      select: {
        totalAmount: true,
      },
    });

    const totalSales = orders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0
    );

    const orderCount = orders.length;
    const averageOrderValue =
      orderCount > 0 ? Number((totalSales / orderCount).toFixed(1)) : 0;

    res.status(200).json({
      totalSales: Number(totalSales.toFixed(1)),
      orderCount,
      averageOrderValue,
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to get dashboard summary",
      error: err.message,
    });
  }
};

const getSalesByProduct = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          status: {
            in: ["paid", "processing", "shipped", "delivered"],
          },
          ...dateFilter,
        },
      },
      select: {
        productId: true,
        productName: true,
        quantity: true,
        priceAtPurchase: true,
        orderId: true,
        order: {
          select: {
            id: true,
            totalAmount: true,
          },
        },
      },
    });

    const orderItemGroups = {};
    for (const item of orderItems) {
      if (!orderItemGroups[item.orderId]) {
        orderItemGroups[item.orderId] = {
          totalBeforeDiscount: 0,
          items: [],
        };
      }

      const lineTotal = Number(item.priceAtPurchase) * item.quantity;
      orderItemGroups[item.orderId].totalBeforeDiscount += lineTotal;
      orderItemGroups[item.orderId].items.push({ ...item, lineTotal });
    }

    const productSalesMap = {};

    for (const group of Object.values(orderItemGroups)) {
      const { totalBeforeDiscount, items } = group;

      for (const item of items) {
        const { productId, productName, quantity, order, lineTotal } = item;

        const discountRatio =
          totalBeforeDiscount > 0
            ? Number(order.totalAmount) / totalBeforeDiscount
            : 1;

        const discountedLine = lineTotal * discountRatio;

        if (!productSalesMap[productId]) {
          productSalesMap[productId] = {
            productId,
            productName,
            totalSales: 0,
            totalQuantity: 0,
          };
        }

        productSalesMap[productId].totalSales += discountedLine;
        productSalesMap[productId].totalQuantity += quantity;
      }
    }

    const result = Object.values(productSalesMap).map((item) => ({
      ...item,
      totalSales: Number(item.totalSales.toFixed(1)),
    }));

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({
      message: "Failed to get sales by product",
      error: err.message,
    });
  }
};

const getSalesByCategory = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          status: {
            in: ["paid", "processing", "shipped", "delivered"],
          },
          ...dateFilter,
        },
      },
      select: {
        quantity: true,
        priceAtPurchase: true,
        orderId: true,
        order: {
          select: { id: true, totalAmount: true },
        },
        product: {
          select: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const orderGroups = {};
    for (const item of orderItems) {
      if (!orderGroups[item.orderId]) {
        orderGroups[item.orderId] = {
          totalBeforeDiscount: 0,
          items: [],
        };
      }

      const lineTotal = Number(item.priceAtPurchase) * item.quantity;
      orderGroups[item.orderId].totalBeforeDiscount += lineTotal;
      orderGroups[item.orderId].items.push({ ...item, lineTotal });
    }

    const categorySales = {};

    for (const group of Object.values(orderGroups)) {
      const { totalBeforeDiscount, items } = group;

      for (const item of items) {
        const category = item.product?.category;
        if (!category) continue;

        const discountRatio =
          totalBeforeDiscount > 0
            ? Number(item.order.totalAmount) / totalBeforeDiscount
            : 1;

        const discountedLine = item.lineTotal * discountRatio;

        if (!categorySales[category.id]) {
          categorySales[category.id] = {
            categoryId: category.id,
            categoryName: category.name,
            totalSales: 0,
            totalQuantity: 0,
          };
        }

        categorySales[category.id].totalSales += discountedLine;
        categorySales[category.id].totalQuantity += item.quantity;
      }
    }

    const result = Object.values(categorySales).map((cat) => ({
      ...cat,
      totalSales: Number(cat.totalSales.toFixed(1)),
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to get sales by category",
      error: err.message,
    });
  }
};

const getTopSellingProducts = async (req, res) => {
  try {
    const { startDate, endDate, limit = 5 } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    const products = await prisma.orderItem.groupBy({
      by: ["productId", "productName", "productImageUrl"],
      _sum: {
        quantity: true,
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      where: {
        order: {
          status: {
            in: ["paid", "processing", "shipped", "delivered"],
          },
          ...dateFilter,
        },
      },
      take: parseInt(limit),
    });

    const formatted = products.map((p) => ({
      productId: p.productId,
      productName: p.productName,
      imageUrl: p.productImageUrl,
      quantitySold: p._sum.quantity,
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error("Error in getTopSellingProducts:", err);
    res.status(500).json({
      message: "Failed to fetch top-selling products",
      error: err.message,
    });
  }
};

const getLowStockProducts = async (req, res) => {
  try {
    const { threshold = 5 } = req.query;

    const products = await prisma.product.findMany({
      where: {
        stock: {
          lt: parseInt(threshold),
        },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        stock: true,
        imageUrl: true,
        category: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        stock: "asc",
      },
    });

    res.status(200).json(products);
  } catch (err) {
    console.error("Error in getLowStockProducts:", err);
    res.status(500).json({
      message: "Failed to fetch low stock products",
      error: err.message,
    });
  }
};

const getCouponUsageStatus = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    const coupons = await prisma.coupon.findMany({
      select: {
        id: true,
        code: true,
        description: true,
        percentage: true,
        isActive: true,
        startDate: true,
        endDate: true,
        usedOrders: {
          where: {
            status: {
              in: ["paid", "processing", "shipped", "delivered", "pending"],
            },
            ...dateFilter,
          },
          select: {
            id: true,
          },
        },
      },
    });

    const result = coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      percentage: coupon.percentage,
      isActive: coupon.isActive,
      startDate: coupon.startDate,
      endDate: coupon.endDate,
      usedCount: coupon.usedOrders.length,
    }));

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch coupon usage",
      error: err.message,
    });
  }
};

const getBestTimeToSell = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    const orders = await prisma.order.findMany({
      where: {
        status: {
          in: ["paid", "processing", "shipped", "delivered"],
        },
        ...dateFilter,
      },
      select: {
        createdAt: true,
        totalAmount: true,
      },
    });

    const salesBy3Hour = {
      0: 0,
      3: 0,
      6: 0,
      9: 0,
      12: 0,
      15: 0,
      18: 0,
      21: 0,
    };

    const salesByDayOfWeek = Array(7).fill(0); // Sunday = 0

    for (const order of orders) {
      const date = new Date(order.createdAt);
      const hour = date.getHours();
      const day = date.getDay();
      const groupHour = Math.floor(hour / 3) * 3;

      salesBy3Hour[groupHour] += Number(order.totalAmount);
      salesByDayOfWeek[day] += Number(order.totalAmount);
    }

    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    const byHour = Object.entries(salesBy3Hour).map(([hour, total]) => ({
      hour: Number(hour),
      totalSales: Number(total.toFixed(1)),
    }));

    const byDayOfWeek = salesByDayOfWeek.map((total, index) => ({
      day: dayNames[index],
      totalSales: Number(total.toFixed(1)),
    }));

    res.status(200).json({ byHour, byDayOfWeek });
  } catch (err) {
    console.error("Error in getBestTimeToSell:", err);
    res.status(500).json({
      message: "Failed to determine best time to sell",
      error: err.message,
    });
  }
};

const getMonthlySalesTrends = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = getDateFilter(startDate, endDate);

    const orders = await prisma.order.findMany({
      where: {
        status: {
          in: ["paid", "processing", "shipped", "delivered"],
        },
        ...dateFilter,
      },
      select: {
        createdAt: true,
        totalAmount: true,
      },
    });

    const salesByMonth = {};

    for (const order of orders) {
      const date = new Date(order.createdAt);
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      if (!salesByMonth[monthKey]) {
        salesByMonth[monthKey] = {
          month: monthKey,
          totalSales: 0,
          orderCount: 0,
        };
      }

      salesByMonth[monthKey].totalSales += Number(order.totalAmount);
      salesByMonth[monthKey].orderCount += 1;
    }

    // === Add default months with zero values ===
    const now = new Date();
    const targetYear = startDate
      ? new Date(startDate).getFullYear()
      : now.getFullYear();

    const allMonths = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      const key = `${targetYear}-${month}`;
      return {
        month: key,
        totalSales: 0,
        orderCount: 0,
      };
    });

    // Merge real data with default months
    const resultMap = Object.fromEntries(allMonths.map((m) => [m.month, m]));

    for (const [key, value] of Object.entries(salesByMonth)) {
      resultMap[key] = {
        month: key,
        totalSales: Number(value.totalSales.toFixed(1)),
        orderCount: value.orderCount,
      };
    }

    const result = Object.values(resultMap).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    res.status(200).json(result);
  } catch (err) {
    console.error("Error in getMonthlySalesTrends:", err);
    res.status(500).json({
      message: "Failed to fetch monthly sales trends",
      error: err.message,
    });
  }
};

module.exports = {
  getDashboardSummary,
  getSalesByProduct,
  getSalesByCategory,
  getTopSellingProducts,
  getLowStockProducts,
  getCouponUsageStatus,
  getBestTimeToSell,
  getMonthlySalesTrends,
};
