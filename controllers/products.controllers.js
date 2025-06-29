const prisma = require("../prisma/client");

const cloudinary = require("cloudinary").v2;

const streamUpload = require("../utils/mediaUpload");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Get all products
const allProducts = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const categoryId = req.query.categoryId
    ? parseInt(req.query.categoryId)
    : null;
  const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
  const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
  const active = req.query.active;
  const tag = req.query.tag;

  const skip = (page - 1) * limit;

  try {
    // Build filter object
    const filter = {};

    if (categoryId) {
      filter.categoryId = categoryId;
    }

    if (minPrice !== null && maxPrice !== null) {
      filter.price = { gte: minPrice, lte: maxPrice };
    } else if (minPrice !== null) {
      filter.price = { gte: minPrice };
    } else if (maxPrice !== null) {
      filter.price = { lte: maxPrice };
    }

    if (active !== undefined) {
      filter.isActive = active === "true";
    }

    if (tag) {
      filter.tags = {
        some: {
          name: tag,
        },
      };
    }

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: {
          ...filter,
          category:
            active !== undefined
              ? {
                  isActive: active === "true",
                }
              : undefined,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          category: true,
          tags: true,
        },
      }),
      prisma.product.count({
        where: {
          ...filter,
          category:
            active !== undefined
              ? {
                  isActive: active === "true",
                }
              : undefined,
        },
      }),
    ]);

    const now = new Date();

    // Enhance each product with its best active discount
    const enhancedProducts = await Promise.all(
      products.map(async (product) => {
        const tagIds = product.tags.map((tag) => tag.id);

        const discounts = await prisma.discount.findMany({
          where: {
            isActive: true,
            startDate: { lte: now },
            endDate: { gte: now },
            OR: [
              { productId: product.id },
              { categoryId: product.category?.id || -1 },
              { tagId: { in: tagIds.length ? tagIds : [-1] } },
            ],
          },
        });

        let bestDiscount = null;
        if (discounts.length > 0) {
          bestDiscount = discounts.reduce((max, d) =>
            Number(d.percentage) > Number(max.percentage) ? d : max
          );
        }

        let discountedPrice = null;
        if (bestDiscount) {
          discountedPrice =
            Number(product.price) * (1 - Number(bestDiscount.percentage) / 100);
        }

        return {
          ...product,
          discount: bestDiscount
            ? {
                id: bestDiscount.id,
                percentage: bestDiscount.percentage,
                startDate: bestDiscount.startDate,
                endDate: bestDiscount.endDate,
                isActive: bestDiscount.isActive,
                discountedPrice: discountedPrice,
              }
            : null,
        };
      })
    );

    res.json({
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      products: enhancedProducts,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Search products

const searchProducts = async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 9,
      categoryId,
      minPrice,
      maxPrice,
      active,
    } = req.query;

    if (!q) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const skip = (page - 1) * limit;
    const query = q.toLowerCase();

    // Base search conditions
    const searchConditions = [
      {
        name: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        tags: {
          some: {
            name: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      },
      {
        category: {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
    ];

    // Additional filters
    const additionalFilters = [];

    if (categoryId) {
      additionalFilters.push({
        categoryId: parseInt(categoryId),
      });
    }

    if (minPrice !== undefined) {
      additionalFilters.push({
        price: {
          gte: parseFloat(minPrice),
        },
      });
    }

    if (maxPrice !== undefined) {
      additionalFilters.push({
        price: {
          lte: parseFloat(maxPrice),
        },
      });
    }

    if (active !== undefined) {
      additionalFilters.push({
        isActive: active === "true",
      });
    }

    const finalWhere = {
      AND: [
        {
          OR: searchConditions,
        },
        ...additionalFilters,
      ],
    };

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: finalWhere,
        include: {
          category: true,
          tags: true,
        },
        skip: Number(skip),
        take: Number(limit),
      }),
      prisma.product.count({
        where: finalWhere,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({ products, totalPages });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

// Get all Categories

const allCategories = async (req, res) => {
  try {
    const active = req.query.active;

    const categoryFilter = {};
    const tagFilter = {};

    if (active !== undefined) {
      const isActive = active === "true";
      categoryFilter.isActive = isActive;
      tagFilter.isActive = isActive;
    }

    const [categories, tags] = await Promise.all([
      prisma.category.findMany({ where: categoryFilter }),
      prisma.tag.findMany({ where: tagFilter }),
    ]);

    res.status(200).json({ categories, tags });
  } catch (error) {
    console.error("Error fetching categories and tags:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get each product

const getProductById = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await prisma.product.findUnique({
      where: { id: parseInt(id) },
      include: {
        images: true,
        category: true,
        tags: true,
      },
    });

    if (!product || !product.isActive) {
      return res.status(404).json({ message: "Product not found or inactive" });
    }

    const now = new Date();

    // Collect tag IDs for this product
    const tagIds = product.tags.map((tag) => tag.id);

    // Fetch all applicable active discounts (product, category, tag)
    const discounts = await prisma.discount.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { productId: product.id },
          { categoryId: product.category?.id || -1 },
          { tagId: { in: tagIds.length ? tagIds : [-1] } },
        ],
      },
    });

    // Pick the highest discount
    let activeDiscount = null;
    if (discounts.length > 0) {
      activeDiscount = discounts.reduce((max, d) =>
        Number(d.percentage) > Number(max.percentage) ? d : max
      );
    }

    // Calculate discounted price
    let discountedPrice = null;
    if (activeDiscount) {
      discountedPrice =
        Number(product.price) * (1 - Number(activeDiscount.percentage) / 100);
    }

    // Prepare final response
    const productResponse = {
      ...product,
      discount: activeDiscount
        ? {
            id: activeDiscount.id,
            percentage: activeDiscount.percentage,
            startDate: activeDiscount.startDate,
            endDate: activeDiscount.endDate,
            isActive: activeDiscount.isActive,
            discountedPrice: discountedPrice
              ? discountedPrice.toFixed(2)
              : null,
          }
        : null,
    };

    res.status(200).json(productResponse);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Add products (ADMINS ONLY)

const addProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      previousPrice,
      stock,
      categoryId,
      tagIds,
    } = req.body;

    const category = await prisma.category.findUnique({
      where: { id: parseInt(categoryId) },
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // ✅ Safely access main image
    const mainImageFile = req.files?.mainImage?.[0];
    if (!mainImageFile) {
      return res.status(400).json({ message: "Main image is required." });
    }

    const mainImageResult = await streamUpload(mainImageFile.buffer);

    let additionalImageResults = [];
    if (req.files?.images?.length > 0) {
      additionalImageResults = await Promise.all(
        req.files.images.map((file) => streamUpload(file.buffer))
      );
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        ...(previousPrice &&
          !isNaN(parseFloat(previousPrice)) && {
            previousPrice: parseFloat(previousPrice),
          }),
        stock: parseInt(stock),
        imageUrl: mainImageResult.secure_url, // ✅ no need to rename
        categoryId: parseInt(categoryId),
        images: {
          create: additionalImageResults.map((img) => ({
            url: img.secure_url,
          })),
        },
        tags: {
          connect: tagIds
            ? JSON.parse(tagIds).map((id) => ({ id: parseInt(id) }))
            : [],
        },
      },
      include: {
        images: true,
        tags: true,
      },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Add Categories (ADMINS ONLY)

const addCategory = async (req, res) => {
  const { name, isActive, description, type } = req.body;
  const file = req.file;

  try {
    if (!name || !type) {
      return res.status(400).json({ message: "Name and type are required." });
    }

    let imageUrl = null;

    // ✅ Upload image if provided
    if (file) {
      const result = await streamUpload(file.buffer);
      imageUrl = result.secure_url;
    }

    const commonData = {
      name,
      description,
      isActive: isActive !== undefined ? isActive : true,
    };

    if (type === "category") {
      const category = await prisma.category.create({
        data: {
          ...commonData,
          imageUrl,
        },
      });

      return res.status(201).json({
        message: "Category created successfully",
        data: category,
      });
    }

    if (type === "tag") {
      const tag = await prisma.tag.create({
        data: commonData,
      });

      return res.status(201).json({
        message: "Tag created successfully",
        data: tag,
      });
    }

    return res.status(400).json({
      message: "Invalid type. Must be either 'category' or 'tag'.",
    });
  } catch (error) {
    console.error("Error creating category or tag:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
      file: req.file,
    });
  }
};

// edit category (ADMINS ONLY)
const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, imageUrl, isActive, description, type } = req.body;

  try {
    if (!id || !type) {
      return res.status(400).json({ message: "ID and type are required." });
    }

    // Build update data with only defined fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (type === "category" && imageUrl !== undefined)
      updateData.imageUrl = imageUrl;

    if (type === "category") {
      const updatedCategory = await prisma.category.update({
        where: { id: parseInt(id) },
        data: updateData,
      });

      return res.status(200).json({
        message: "Category updated successfully",
        data: updatedCategory,
      });
    }

    if (type === "tag") {
      const updatedTag = await prisma.tag.update({
        where: { id: parseInt(id) },
        data: updateData,
      });

      return res.status(200).json({
        message: "Tag updated successfully",
        data: updatedTag,
      });
    }

    return res.status(400).json({
      message: "Invalid type. Must be either 'category' or 'tag'.",
    });
  } catch (error) {
    console.error("Error updating category or tag:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// Edit product (ADMINS ONLY)

const updateProduct = async (req, res) => {
  const { id } = req.params;

  // Destructure with default values
  const {
    name = null,
    description = null,
    price,
    previousPrice,
    stock,
    categoryId,
    isActive,
  } = req.body;

  const tagIds = req.body.tagIds ? JSON.parse(req.body.tagIds) : [];

  // Parse numeric values safely
  const parsedPrice = parseFloat(price);
  const parsedPreviousPrice = parseFloat(previousPrice);
  const parsedStock = parseInt(stock);
  const parsedCategoryId = parseInt(categoryId);

  try {
    const existingProduct = await prisma.product.findUnique({
      where: { id: parseInt(id) },
      include: { images: true },
    });

    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Upload new main image if provided
    let newMainImageUrl = existingProduct.imageUrl;
    const mainImageFile = req.files?.mainImage?.[0];
    if (mainImageFile) {
      const mainImageResult = await streamUpload(mainImageFile.buffer);
      newMainImageUrl = mainImageResult.secure_url;
    }

    // Upload and process new additional images
    let additionalImageResults = [];
    if (req.files?.images?.length > 0) {
      await prisma.productImage.deleteMany({
        where: { productId: existingProduct.id },
      });

      additionalImageResults = await Promise.all(
        req.files.images.map((file) => streamUpload(file.buffer))
      );
    }

    // Build update data conditionally
    const updateData = {
      ...(name && { name }),
      ...(description && { description }),
      ...(price && !isNaN(parsedPrice) && { price: parsedPrice }),
      ...(previousPrice === "" || isNaN(parsedPreviousPrice)
        ? { previousPrice: null }
        : { previousPrice: parsedPreviousPrice }),
      ...(stock && !isNaN(parsedStock) && { stock: parsedStock }),
      ...(categoryId &&
        !isNaN(parsedCategoryId) && { categoryId: parsedCategoryId }),
      imageUrl: newMainImageUrl,
      isActive: isActive === "true" || isActive === true,
      tags: {
        set: tagIds.map((id) => ({ id: parseInt(id) })),
      },
    };

    // Add images if present
    if (additionalImageResults.length > 0) {
      updateData.images = {
        create: additionalImageResults.map((img) => ({
          url: img.secure_url,
        })),
      };
    }

    const updatedProduct = await prisma.product.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        tags: true,
        images: true,
      },
    });

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete product (ADMINS ONLY)

const deleteProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await prisma.product.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: "Product deleted successfully", deleted });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete Category (ADMINS ONLY)

const deleteCategory = async (req, res) => {
  const { id, type } = req.params;

  try {
    if (!id || !type) {
      return res.status(400).json({ message: "ID and type are required." });
    }

    if (type === "category") {
      const deletedCategory = await prisma.category.delete({
        where: { id: parseInt(id) },
      });
      return res.status(200).json({
        message: "Category deleted successfully",
        deleted: deletedCategory,
      });
    }

    if (type === "tag") {
      const deletedTag = await prisma.tag.delete({
        where: { id: parseInt(id) },
      });
      return res
        .status(200)
        .json({ message: "Tag deleted successfully", deleted: deletedTag });
    }

    res
      .status(400)
      .json({ message: "Invalid type. Must be either 'category' or 'tag'." });
  } catch (error) {
    console.error("Error deleting category or tag:", error);

    if (error.code === "P2003") {
      return res.status(400).json({
        message: "Cannot delete category: it's linked to existing products.",
      });
    }

    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  allProducts,
  allCategories,
  getProductById,
  addProduct,
  addCategory,
  updateProduct,
  deleteProduct,
  deleteCategory,
  updateCategory,
  searchProducts,
};
